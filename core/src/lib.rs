//! Publicly visible facts of a serialized Zcash transaction.
//!
//! This is deliberately the *observer's* view: only what anyone holding the raw
//! transaction can learn, with no keys involved. Leak detectors run on top of it.

use serde::Serialize;
use std::io::Cursor;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::BranchId;

#[derive(Serialize, Debug)]
pub struct TxFacts {
    pub txid: String,
    pub version: String,
    pub branch_id: String,
    pub size: usize,
    pub lock_time: u32,
    pub expiry_height: u32,
    pub transparent: TransparentFacts,
    pub sapling: Option<SaplingFacts>,
    pub orchard: Option<OrchardFacts>,
    pub ironwood: Option<OrchardFacts>,
}

#[derive(Serialize, Debug, Default)]
pub struct TransparentFacts {
    pub vin: Vec<OutPoint>,
    pub vout: Vec<TxOut>,
}

#[derive(Serialize, Debug)]
pub struct OutPoint {
    /// Display-order (reversed) txid, as explorers show it.
    pub txid: String,
    pub index: u32,
}

#[derive(Serialize, Debug)]
pub struct TxOut {
    pub value: u64,
    pub script: String,
}

#[derive(Serialize, Debug)]
pub struct SaplingFacts {
    pub spends: usize,
    pub outputs: usize,
    /// Net value leaving the Sapling pool (positive) or entering it (negative), in zatoshis.
    pub value_balance: i64,
}

/// Shared shape for the Orchard and Ironwood pools, which use the same bundle format.
#[derive(Serialize, Debug)]
pub struct OrchardFacts {
    pub actions: usize,
    pub spends_enabled: bool,
    pub outputs_enabled: bool,
    /// Net value leaving the pool (positive) or entering it (negative), in zatoshis.
    pub value_balance: i64,
}

fn orchard_facts<A: orchard::bundle::Authorization>(
    b: &orchard::Bundle<A, zcash_protocol::value::ZatBalance>,
) -> OrchardFacts {
    OrchardFacts {
        actions: b.actions().len(),
        spends_enabled: b.flags().spends_enabled(),
        outputs_enabled: b.flags().outputs_enabled(),
        value_balance: i64::from(*b.value_balance()),
    }
}

/// Parses raw transaction bytes. v5+ transactions carry their own branch id;
/// the hint is only used for v4 and earlier.
pub fn parse(raw: &[u8]) -> std::io::Result<TxFacts> {
    let tx = Transaction::read(Cursor::new(raw), BranchId::Nu6_3)?;

    let mut transparent = TransparentFacts::default();
    if let Some(t) = tx.transparent_bundle() {
        for i in &t.vin {
            let mut h = *i.prevout().hash();
            h.reverse();
            transparent.vin.push(OutPoint { txid: hex::encode(h), index: i.prevout().n() });
        }
        for o in &t.vout {
            transparent.vout.push(TxOut {
                value: u64::from(o.value()),
                script: hex::encode(&o.script_pubkey().0 .0),
            });
        }
    }

    Ok(TxFacts {
        txid: tx.txid().to_string(),
        version: format!("{:?}", tx.version()),
        branch_id: format!("{:?}", tx.consensus_branch_id()),
        size: raw.len(),
        lock_time: tx.lock_time(),
        expiry_height: u32::from(tx.expiry_height()),
        transparent,
        sapling: tx.sapling_bundle().map(|b| SaplingFacts {
            spends: b.shielded_spends().len(),
            outputs: b.shielded_outputs().len(),
            value_balance: i64::from(*b.value_balance()),
        }),
        orchard: tx.orchard_bundle().map(orchard_facts),
        ironwood: tx.ironwood_bundle().map(orchard_facts),
    })
}

pub fn parse_hex(raw_hex: &str) -> Result<TxFacts, String> {
    let raw = hex::decode(raw_hex.trim()).map_err(|e| format!("bad hex: {e}"))?;
    parse(&raw).map_err(|e| format!("bad transaction: {e}"))
}
