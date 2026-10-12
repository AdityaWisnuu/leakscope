//! Viewing-key wallet scanner: finds which compact transactions belong to a wallet.
//!
//! This is the *owner's* view, the counterpart to the observer's view in the crate
//! root. Given a Unified Full Viewing Key it trial-decrypts every Sapling output and
//! every Orchard / Ironwood action of a compact block with both the external
//! (received) and internal (change / self) incoming viewing keys, and remembers the
//! nullifiers of the notes it finds so later spends of those notes are recognised too.
//!
//! Input is the raw protobuf encoding of lightwalletd's `CompactBlock` (or a single
//! `CompactTx`), so callers can hand over the bytes straight off the wire. The key
//! never leaves this process; under the `wasm` feature that means the user's browser.

use std::collections::HashMap;

use orchard::keys::{FullViewingKey as OrchardFvk, PreparedIncomingViewingKey as OrchardIvk};
use orchard::note::{ExtractedNoteCommitment as Cmx, Nullifier as OrchardNf};
use orchard::note_encryption::{CompactAction, IronwoodDomain, OrchardDomain};
use prost::Message;
use sapling::keys::PreparedIncomingViewingKey as SaplingIvk;
use sapling::note_encryption::{CompactOutputDescription, SaplingDomain};
use sapling::NullifierDerivingKey;
use serde::Serialize;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_note_encryption::{batch, EphemeralKeyBytes};
use zcash_primitives::transaction::components::sapling::zip212_enforcement;
use zcash_protocol::consensus::{BlockHeight, Network};
use orchard::keys::Scope;

/// Minimal lightwalletd wire types (compact_formats.proto). Fields the scanner does
/// not need (header, transparent vin/vout, ...) are skipped by prost.
pub mod proto {
    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactBlock {
        #[prost(uint64, tag = "2")]
        pub height: u64,
        #[prost(uint32, tag = "5")]
        pub time: u32,
        #[prost(message, repeated, tag = "7")]
        pub vtx: Vec<CompactTx>,
        #[prost(message, optional, tag = "8")]
        pub chain_metadata: Option<ChainMetadata>,
    }

    #[derive(Clone, PartialEq, prost::Message)]
    pub struct ChainMetadata {
        #[prost(uint32, tag = "1")]
        pub sapling_commitment_tree_size: u32,
        #[prost(uint32, tag = "2")]
        pub orchard_commitment_tree_size: u32,
        #[prost(uint32, tag = "3")]
        pub ironwood_commitment_tree_size: u32,
    }

    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactTx {
        #[prost(uint64, tag = "1")]
        pub index: u64,
        #[prost(bytes = "vec", tag = "2")]
        pub txid: Vec<u8>,
        #[prost(message, repeated, tag = "4")]
        pub spends: Vec<CompactSaplingSpend>,
        #[prost(message, repeated, tag = "5")]
        pub outputs: Vec<CompactSaplingOutput>,
        #[prost(message, repeated, tag = "6")]
        pub actions: Vec<CompactOrchardAction>,
        #[prost(message, repeated, tag = "9")]
        pub ironwood_actions: Vec<CompactOrchardAction>,
    }

    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactSaplingSpend {
        #[prost(bytes = "vec", tag = "1")]
        pub nf: Vec<u8>,
    }

    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactSaplingOutput {
        #[prost(bytes = "vec", tag = "1")]
        pub cmu: Vec<u8>,
        #[prost(bytes = "vec", tag = "2")]
        pub ephemeral_key: Vec<u8>,
        #[prost(bytes = "vec", tag = "3")]
        pub ciphertext: Vec<u8>,
    }

    #[derive(Clone, PartialEq, prost::Message)]
    pub struct CompactOrchardAction {
        #[prost(bytes = "vec", tag = "1")]
        pub nullifier: Vec<u8>,
        #[prost(bytes = "vec", tag = "2")]
        pub cmx: Vec<u8>,
        #[prost(bytes = "vec", tag = "3")]
        pub ephemeral_key: Vec<u8>,
        #[prost(bytes = "vec", tag = "4")]
        pub ciphertext: Vec<u8>,
    }
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Pool {
    Sapling,
    Orchard,
    Ironwood,
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NoteScope {
    /// Received on one of the wallet's addresses.
    External,
    /// Change or a shielding/self transfer, sent by the wallet to itself.
    Internal,
}

fn scope_of(ivk_index: usize) -> NoteScope {
    if ivk_index == 0 { NoteScope::External } else { NoteScope::Internal }
}

/// A note this transaction created for the wallet.
#[derive(Serialize, Debug, Clone)]
pub struct Received {
    pub pool: Pool,
    pub scope: NoteScope,
    /// Zatoshis.
    pub value: u64,
    /// Index of the Sapling output / Orchard or Ironwood action within the transaction.
    pub index: u32,
}

/// A previously found wallet note that this transaction spends.
#[derive(Serialize, Debug, Clone)]
pub struct Spent {
    pub pool: Pool,
    pub scope: NoteScope,
    pub value: u64,
    /// Display-order txid of the transaction that created the spent note.
    pub note_txid: String,
}

/// One transaction that touches the wallet.
#[derive(Serialize, Debug, Clone)]
pub struct OwnedTx {
    /// Display-order (reversed) txid, as explorers show it.
    pub txid: String,
    pub height: u32,
    pub tx_index: u32,
    pub received: Vec<Received>,
    pub spent: Vec<Spent>,
}

struct NoteRef {
    scope: NoteScope,
    value: u64,
    txid: String,
}

struct SaplingKeys {
    /// [external, internal]
    ivks: [SaplingIvk; 2],
    nks: [NullifierDerivingKey; 2],
}

struct OrchardKeys {
    fvk: OrchardFvk,
    /// [external, internal]. Ironwood notes use the same Orchard key tree.
    ivks: [OrchardIvk; 2],
}

pub struct Scanner {
    network: Network,
    sapling: Option<SaplingKeys>,
    orchard: Option<OrchardKeys>,
    /// Nullifiers of every note found so far, so spends of them can be detected.
    nullifiers: HashMap<(Pool, [u8; 32]), NoteRef>,
}

fn arr32(b: &[u8]) -> Option<[u8; 32]> {
    b.try_into().ok()
}

fn arr52(b: &[u8]) -> Option<[u8; 52]> {
    b.try_into().ok()
}

fn display_txid(txid: &[u8]) -> String {
    let mut t = txid.to_vec();
    t.reverse();
    hex::encode(t)
}

fn compact_action(a: &proto::CompactOrchardAction) -> Option<CompactAction> {
    let nf = Option::from(OrchardNf::from_bytes(&arr32(&a.nullifier)?))?;
    let cmx = Option::from(Cmx::from_bytes(&arr32(&a.cmx)?))?;
    Some(CompactAction::from_parts(
        nf,
        cmx,
        EphemeralKeyBytes(arr32(&a.ephemeral_key)?),
        arr52(&a.ciphertext)?,
    ))
}

impl Scanner {
    /// Decodes a Unified Full Viewing Key. The network comes from the key's prefix:
    /// `uview1…` is mainnet, `uviewtest1…` testnet.
    pub fn new(ufvk: &str) -> Result<Self, String> {
        let ufvk = ufvk.trim();
        let network = if ufvk.starts_with("uviewtest1") {
            Network::TestNetwork
        } else if ufvk.starts_with("uview1") {
            Network::MainNetwork
        } else {
            return Err("not a mainnet (uview1…) or testnet (uviewtest1…) unified full viewing key".into());
        };
        let key = UnifiedFullViewingKey::decode(&network, ufvk).map_err(|e| format!("invalid UFVK: {e}"))?;
        Self::from_ufvk(network, &key)
    }

    pub fn from_ufvk(network: Network, key: &UnifiedFullViewingKey) -> Result<Self, String> {
        let sapling = key.sapling().map(|dfvk| SaplingKeys {
            ivks: [
                SaplingIvk::new(&dfvk.to_ivk(Scope::External)),
                SaplingIvk::new(&dfvk.to_ivk(Scope::Internal)),
            ],
            nks: [dfvk.to_nk(Scope::External), dfvk.to_nk(Scope::Internal)],
        });
        let orchard = key.orchard().map(|fvk| OrchardKeys {
            fvk: fvk.clone(),
            ivks: [
                OrchardIvk::new(&fvk.to_ivk(Scope::External)),
                OrchardIvk::new(&fvk.to_ivk(Scope::Internal)),
            ],
        });
        if sapling.is_none() && orchard.is_none() {
            return Err("UFVK has no Sapling or Orchard component; only transparent keys are not scannable".into());
        }
        Ok(Scanner { network, sapling, orchard, nullifiers: HashMap::new() })
    }

    /// "main" or "test", matching lightwalletd's `GetLightdInfo.chainName`.
    pub fn network(&self) -> &'static str {
        match self.network {
            Network::MainNetwork => "main",
            Network::TestNetwork => "test",
        }
    }

    /// Shielded pools this key can see.
    pub fn pools(&self) -> Vec<Pool> {
        let mut p = vec![];
        if self.sapling.is_some() {
            p.push(Pool::Sapling);
        }
        if self.orchard.is_some() {
            p.extend([Pool::Orchard, Pool::Ironwood]);
        }
        p
    }

    /// Number of wallet notes found so far (spent or not).
    pub fn notes_found(&self) -> usize {
        self.nullifiers.len()
    }

    /// Scans one protobuf-encoded `CompactBlock`.
    pub fn scan_block_bytes(&mut self, bytes: &[u8]) -> Result<Vec<OwnedTx>, String> {
        let block = proto::CompactBlock::decode(bytes).map_err(|e| format!("bad CompactBlock: {e}"))?;
        Ok(self.scan_block(&block))
    }

    /// Scans one protobuf-encoded `CompactTx` mined at `height`. Without block context the
    /// Sapling note positions are unknown, so later spends of Sapling notes found this way
    /// cannot be recognised (Orchard/Ironwood spends still are). Prefer whole blocks.
    pub fn scan_tx_bytes(&mut self, bytes: &[u8], height: u32) -> Result<Option<OwnedTx>, String> {
        let tx = proto::CompactTx::decode(bytes).map_err(|e| format!("bad CompactTx: {e}"))?;
        let block = proto::CompactBlock { height: height.into(), time: 0, vtx: vec![tx], chain_metadata: None };
        Ok(self.scan_block(&block).pop())
    }

    pub fn scan_block(&mut self, block: &proto::CompactBlock) -> Vec<OwnedTx> {
        let height = block.height as u32;
        let ntx = block.vtx.len();
        // Per tx: received notes with their nullifier (if derivable).
        let mut found: Vec<Vec<(Received, Option<[u8; 32]>)>> = vec![vec![]; ntx];

        if let Some(keys) = &self.sapling {
            let zip212 = zip212_enforcement(&self.network, BlockHeight::from_u32(height));
            let mut outs = vec![];
            let mut at = vec![]; // (tx, output index, valid)
            for (t, tx) in block.vtx.iter().enumerate() {
                for (i, o) in tx.outputs.iter().enumerate() {
                    let parsed = (|| {
                        Some(CompactOutputDescription {
                            ephemeral_key: EphemeralKeyBytes(arr32(&o.ephemeral_key)?),
                            cmu: Option::from(sapling::note::ExtractedNoteCommitment::from_bytes(&arr32(&o.cmu)?))?,
                            enc_ciphertext: arr52(&o.ciphertext)?,
                        })
                    })();
                    at.push((t, i as u32, parsed.is_some()));
                    if let Some(p) = parsed {
                        outs.push((SaplingDomain::new(zip212), p));
                    }
                }
            }
            // Positions are only known when the server sends the tree size at the block's end.
            let total = at.len() as u64;
            let first_pos = block
                .chain_metadata
                .as_ref()
                .map(|m| m.sapling_commitment_tree_size as u64)
                .filter(|&size| size >= total && size > 0)
                .map(|size| size - total);
            let hits = batch::try_compact_note_decryption(&keys.ivks, &outs);
            let mut hit = hits.into_iter();
            for (pos, (t, i, valid)) in at.into_iter().enumerate() {
                if !valid {
                    continue;
                }
                if let Some(((note, _), k)) = hit.next().flatten() {
                    let nf = first_pos.map(|p| note.nf(&keys.nks[k], p + pos as u64).0);
                    let r = Received { pool: Pool::Sapling, scope: scope_of(k), value: note.value().inner(), index: i };
                    found[t].push((r, nf));
                }
            }
        }

        if let Some(keys) = &self.orchard {
            for pool in [Pool::Orchard, Pool::Ironwood] {
                let mut at = vec![];
                let mut acts = vec![];
                for (t, tx) in block.vtx.iter().enumerate() {
                    let list = if pool == Pool::Orchard { &tx.actions } else { &tx.ironwood_actions };
                    for (i, a) in list.iter().enumerate() {
                        if let Some(ca) = compact_action(a) {
                            at.push((t, i as u32));
                            acts.push(ca);
                        }
                    }
                }
                if acts.is_empty() {
                    continue;
                }
                // Orchard (v2 plaintexts) and Ironwood (v3) differ only in the accepted lead byte.
                let hits: Vec<_> = if pool == Pool::Orchard {
                    let outs: Vec<_> = acts.into_iter().map(|a| (OrchardDomain::for_compact_action(&a), a)).collect();
                    batch::try_compact_note_decryption(&keys.ivks, &outs)
                } else {
                    let outs: Vec<_> = acts.into_iter().map(|a| (IronwoodDomain::for_compact_action(&a), a)).collect();
                    batch::try_compact_note_decryption(&keys.ivks, &outs)
                };
                for ((t, i), h) in at.into_iter().zip(hits) {
                    if let Some(((note, _), k)) = h {
                        // nk is shared by both scopes, so the external FVK derives either nullifier.
                        let nf = note.nullifier(&keys.fvk).to_bytes();
                        let r = Received { pool, scope: scope_of(k), value: note.value().inner(), index: i };
                        found[t].push((r, Some(nf)));
                    }
                }
            }
        }

        // Walk txs in block order: spends can only consume notes created earlier.
        let mut owned = vec![];
        for (tx, recv) in block.vtx.iter().zip(found) {
            let mut spent = vec![];
            let sapling_nfs = tx.spends.iter().map(|s| (Pool::Sapling, &s.nf));
            let orchard_nfs = tx.actions.iter().map(|a| (Pool::Orchard, &a.nullifier));
            let ironwood_nfs = tx.ironwood_actions.iter().map(|a| (Pool::Ironwood, &a.nullifier));
            for (pool, nf) in sapling_nfs.chain(orchard_nfs).chain(ironwood_nfs) {
                if let Some(n) = arr32(nf).and_then(|nf| self.nullifiers.get(&(pool, nf))) {
                    spent.push(Spent { pool, scope: n.scope, value: n.value, note_txid: n.txid.clone() });
                }
            }
            if recv.is_empty() && spent.is_empty() {
                continue;
            }
            let txid = display_txid(&tx.txid);
            let mut received = vec![];
            for (r, nf) in recv {
                if let Some(nf) = nf {
                    self.nullifiers.insert((r.pool, nf), NoteRef { scope: r.scope, value: r.value, txid: txid.clone() });
                }
                received.push(r);
            }
            owned.push(OwnedTx { txid, height, tx_index: tx.index as u32, received, spent });
        }
        owned
    }
}

#[cfg(test)]
mod tests {
    //! Offline tests. Keys are generated from fresh randomness on every run, so no seed or
    //! spending key is ever stored. Notes are encrypted to them exactly as a wallet would,
    //! wrapped in a protobuf CompactBlock, and fed through the same path as network data.
    use super::*;
    use orchard::keys::{FullViewingKey, SpendingKey};
    use orchard::note::{NoteVersion, RandomSeed, Rho};
    use orchard::note_encryption::{IronwoodNoteEncryption, OrchardNoteEncryption};
    use orchard::value::NoteValue;
    use rand::RngExt as _;
    use zcash_note_encryption::Domain;

    struct Wallet {
        ufvk: String,
        sapling: sapling::zip32::DiversifiableFullViewingKey,
        orchard: FullViewingKey,
    }

    fn random_wallet() -> Wallet {
        let mut rng = rand::rng();
        let seed: [u8; 32] = rng.random();
        let sapling = sapling::zip32::ExtendedSpendingKey::master(&seed).unwrap().to_diversifiable_full_viewing_key();
        let orchard = loop {
            if let Some(sk) = Option::<SpendingKey>::from(SpendingKey::from_bytes(rng.random())) {
                break FullViewingKey::from(&sk);
            }
        };
        let key = UnifiedFullViewingKey::new(Some(sapling.clone()), Some(orchard.clone())).unwrap();
        Wallet { ufvk: key.encode(&Network::TestNetwork).unwrap(), sapling, orchard }
    }

    fn random_nf(rng: &mut impl rand::Rng) -> OrchardNf {
        loop {
            let mut b: [u8; 32] = rng.random();
            b[31] &= 0x3f; // below the Pallas modulus
            if let Some(nf) = Option::from(OrchardNf::from_bytes(&b)) {
                break nf;
            }
        }
    }

    /// An Orchard-style action paying `value` to `fvk` (scope picks external/internal address).
    fn action_to(fvk: &FullViewingKey, scope: Scope, value: u64, version: NoteVersion) -> proto::CompactOrchardAction {
        let mut rng = rand::rng();
        let nf_old = random_nf(&mut rng);
        let rho = Rho::from_bytes(&nf_old.to_bytes()).unwrap();
        let rseed = loop {
            if let Some(r) = Option::from(RandomSeed::from_bytes(rng.random(), &rho)) {
                break r;
            }
        };
        let note = orchard::Note::from_parts(fvk.address_at(0u32, scope), NoteValue::from_raw(value), rho, rseed, version)
            .unwrap();
        let cmx = Cmx::from(note.commitment());
        let (epk, ct) = match version {
            NoteVersion::V3 => {
                let e = IronwoodNoteEncryption::new(None, note, [0; 512]);
                (IronwoodDomain::epk_bytes(e.epk()).0, e.encrypt_note_plaintext())
            }
            _ => {
                let e = OrchardNoteEncryption::new(None, note, [0; 512]);
                (OrchardDomain::epk_bytes(e.epk()).0, e.encrypt_note_plaintext())
            }
        };
        proto::CompactOrchardAction {
            nullifier: nf_old.to_bytes().to_vec(),
            cmx: cmx.to_bytes().to_vec(),
            ephemeral_key: epk.to_vec(),
            ciphertext: ct.as_ref()[..52].to_vec(),
        }
    }

    fn sapling_output_to(
        dfvk: &sapling::zip32::DiversifiableFullViewingKey,
        scope: Scope,
        value: u64,
    ) -> proto::CompactSaplingOutput {
        let mut rng = rand::rng();
        let addr = match scope {
            Scope::External => dfvk.default_address().1,
            Scope::Internal => dfvk.change_address().1,
        };
        let note = addr.create_note(sapling::value::NoteValue::from_raw(value), sapling::Rseed::AfterZip212(rng.random()));
        let cmu = note.cmu();
        let enc = sapling::note_encryption::sapling_note_encryption(None, note, [0; 512], &mut rng);
        proto::CompactSaplingOutput {
            cmu: cmu.to_bytes().to_vec(),
            ephemeral_key: SaplingDomain::epk_bytes(enc.epk()).0.to_vec(),
            ciphertext: enc.encrypt_note_plaintext().as_ref()[..52].to_vec(),
        }
    }

    fn tx(i: u8) -> proto::CompactTx {
        proto::CompactTx { index: i.into(), txid: vec![i; 32], ..Default::default() }
    }

    fn block(height: u64, vtx: Vec<proto::CompactTx>, sapling_tree_size: u32) -> Vec<u8> {
        proto::CompactBlock {
            height,
            time: 0,
            vtx,
            chain_metadata: Some(proto::ChainMetadata { sapling_commitment_tree_size: sapling_tree_size, ..Default::default() }),
        }
        .encode_to_vec()
    }

    const H: u64 = 4_492_000; // post-Canopy testnet height

    #[test]
    fn network_from_prefix_and_clean_errors() {
        let w = random_wallet();
        let s = Scanner::new(&w.ufvk).unwrap();
        assert_eq!(s.network(), "test");
        assert_eq!(s.pools(), vec![Pool::Sapling, Pool::Orchard, Pool::Ironwood]);
        let main = UnifiedFullViewingKey::decode(&Network::TestNetwork, &w.ufvk).unwrap().encode(&Network::MainNetwork).unwrap();
        assert!(main.starts_with("uview1"));
        assert_eq!(Scanner::new(&main).unwrap().network(), "main");

        assert!(Scanner::new("hello").is_err());
        assert!(Scanner::new("uviewregtest1abc").is_err());
        assert!(Scanner::new(&w.ufvk[..w.ufvk.len() - 3]).err().unwrap().starts_with("invalid UFVK"));
        let mut s = Scanner::new(&w.ufvk).unwrap();
        assert!(s.scan_block_bytes(&[]).unwrap().is_empty());
        assert!(s.scan_block_bytes(&[0xff, 0xff, 0xff]).is_err());
    }

    #[test]
    fn finds_received_and_change_in_every_pool_and_ignores_strangers() {
        let me = random_wallet();
        let stranger = random_wallet();
        let mut s = Scanner::new(&me.ufvk).unwrap();

        let mut t0 = tx(0); // someone else's
        t0.ironwood_actions = vec![action_to(&stranger.orchard, Scope::External, 1, NoteVersion::V3)];
        t0.outputs = vec![sapling_output_to(&stranger.sapling, Scope::External, 2)];
        let mut t1 = tx(1); // ours
        t1.ironwood_actions = vec![
            action_to(&stranger.orchard, Scope::External, 5, NoteVersion::V3),
            action_to(&me.orchard, Scope::Internal, 1_000, NoteVersion::V3),
        ];
        t1.outputs = vec![sapling_output_to(&me.sapling, Scope::External, 2_000)];
        t1.actions = vec![action_to(&me.orchard, Scope::External, 3_000, NoteVersion::V2)];
        // An Orchard (v2) plaintext must not be accepted in the Ironwood bundle, and vice versa.
        let mut t2 = tx(2);
        t2.ironwood_actions = vec![action_to(&me.orchard, Scope::External, 7, NoteVersion::V2)];
        t2.actions = vec![action_to(&me.orchard, Scope::External, 8, NoteVersion::V3)];

        let got = s.scan_block_bytes(&block(H, vec![t0, t1, t2], 100)).unwrap();
        assert_eq!(got.len(), 1, "{got:?}");
        let t = &got[0];
        assert_eq!((t.txid.as_str(), t.height, t.tx_index), (hex::encode([1u8; 32]).as_str(), H as u32, 1));
        let mut r: Vec<_> = t.received.iter().map(|r| (r.pool, r.scope, r.value, r.index)).collect();
        r.sort_by_key(|x| x.2);
        assert_eq!(
            r,
            vec![
                (Pool::Ironwood, NoteScope::Internal, 1_000, 1),
                (Pool::Sapling, NoteScope::External, 2_000, 0),
                (Pool::Orchard, NoteScope::External, 3_000, 0),
            ]
        );
        assert_eq!(s.notes_found(), 3);
    }

    #[test]
    fn detects_spends_of_found_notes_even_without_change() {
        let me = random_wallet();
        let other = random_wallet();
        let mut s = Scanner::new(&me.ufvk).unwrap();

        let mut recv = tx(1);
        let iw = action_to(&me.orchard, Scope::External, 50_000, NoteVersion::V3);
        recv.ironwood_actions = vec![iw.clone()];
        recv.outputs = vec![sapling_output_to(&me.sapling, Scope::Internal, 7_000)];
        assert_eq!(s.scan_block_bytes(&block(H, vec![recv], 1000)).unwrap().len(), 1);

        // Recompute the nullifiers a spender would reveal.
        let a = compact_action(&iw).unwrap();
        let (note, _) = zcash_note_encryption::try_compact_note_decryption(
            &IronwoodDomain::for_compact_action(&a),
            &OrchardIvk::new(&me.orchard.to_ivk(Scope::External)),
            &a,
        )
        .unwrap();
        let iw_nf = note.nullifier(&me.orchard).to_bytes().to_vec();
        // The Sapling note was the only output of a block whose tree ended at size 1000: position 999.
        let snote = {
            let mut b = s.nullifiers.keys().filter(|(p, _)| *p == Pool::Sapling);
            b.next().unwrap().1
        };

        // Outgoing-only tx (pays everything to someone else, no change back): still found via nullifiers.
        let mut spend = tx(2);
        spend.spends = vec![proto::CompactSaplingSpend { nf: snote.to_vec() }];
        let mut act = action_to(&other.orchard, Scope::External, 49_000, NoteVersion::V3);
        act.nullifier = iw_nf;
        spend.ironwood_actions = vec![act];
        let got = s.scan_block_bytes(&block(H + 5, vec![tx(0), spend], 1000)).unwrap();
        assert_eq!(got.len(), 1);
        assert!(got[0].received.is_empty());
        let mut sp: Vec<_> = got[0].spent.iter().map(|x| (x.pool, x.scope, x.value)).collect();
        sp.sort_by_key(|x| x.2);
        assert_eq!(sp, vec![(Pool::Sapling, NoteScope::Internal, 7_000), (Pool::Ironwood, NoteScope::External, 50_000)]);
        assert_eq!(got[0].spent[0].note_txid, hex::encode([1u8; 32]));
    }

    #[test]
    fn sapling_nullifier_uses_block_position() {
        let me = random_wallet();
        let mut s = Scanner::new(&me.ufvk).unwrap();
        let mut t = tx(3);
        t.outputs = vec![
            sapling_output_to(&random_wallet().sapling, Scope::External, 1),
            sapling_output_to(&me.sapling, Scope::External, 9),
        ];
        s.scan_block_bytes(&block(H, vec![t.clone()], 42)).unwrap();
        // Two outputs ending at tree size 42 → ours is at position 41.
        let o = &t.outputs[1];
        let out = CompactOutputDescription {
            ephemeral_key: EphemeralKeyBytes(arr32(&o.ephemeral_key).unwrap()),
            cmu: sapling::note::ExtractedNoteCommitment::from_bytes(&arr32(&o.cmu).unwrap()).unwrap(),
            enc_ciphertext: arr52(&o.ciphertext).unwrap(),
        };
        let ivk = SaplingIvk::new(&me.sapling.to_ivk(Scope::External));
        let (note, _) = sapling::note_encryption::try_sapling_compact_note_decryption(
            &ivk,
            &out,
            sapling::note_encryption::Zip212Enforcement::On,
        )
        .unwrap();
        let nf = note.nf(&me.sapling.to_nk(Scope::External), 41).0;
        assert!(s.nullifiers.contains_key(&(Pool::Sapling, nf)));

        // A lone CompactTx has no tree context: the note is found, its nullifier is not tracked.
        let mut s2 = Scanner::new(&me.ufvk).unwrap();
        let one = s2.scan_tx_bytes(&t.encode_to_vec(), H as u32).unwrap().unwrap();
        assert_eq!(one.received[0].value, 9);
        assert_eq!(s2.notes_found(), 0);
    }
}
