// Membership filter for "is this transaction in the indexed range at all?" (/txset.bin).
//
// A Bloom filter over every txid in the indexed blocks (coinbase included), so /check can tell
// "in our data, nothing found" apart from "not in our data" (too recent, too old, or mistyped).
// The whole file is downloaded, never a per-txid query, so the txid stays in the tab.
// Built by scripts/txset.mjs from the indexer's JSON lines.
//
// Layout: header Uint32 ×5 (version, log2 bits, k, count, fromHeight), Uint32 toHeight, then the bit array.
// Txids are already uniform hashes, so the k probe positions use double hashing on two 32-bit
// slices of the hex id: (h1 + i·h2) mod 2^bits. No false negatives; false positives ≈ 0.25%.

export const TXSET_VERSION = 1;
export const TXSET_HEADER_BYTES = 24;

export function probes(txid: string, logBits: number, k: number): number[] {
  const h1 = parseInt(txid.slice(0, 8), 16);
  const h2 = (parseInt(txid.slice(8, 16), 16) | 1) >>> 0;
  const m = 2 ** logBits;
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push((h1 + i * h2) % m);
  return out;
}

export interface TxSet {
  count: number;
  from: number;
  to: number;
  has(txid: string): boolean;
}

export function readTxSet(buf: ArrayBuffer): TxSet {
  const head = new DataView(buf, 0, TXSET_HEADER_BYTES);
  const le = true;
  if (head.getUint32(0, le) !== TXSET_VERSION) throw new Error('Unknown txset version');
  const logBits = head.getUint32(4, le), k = head.getUint32(8, le), count = head.getUint32(12, le);
  const from = head.getUint32(16, le), to = head.getUint32(20, le);
  const bits = new Uint8Array(buf, TXSET_HEADER_BYTES);
  return {
    count,
    from,
    to,
    has: (txid) => probes(txid.toLowerCase(), logBits, k).every((p) => (bits[p >>> 3] & (1 << (p & 7))) !== 0),
  };
}

export function buildTxSet(txids: Iterable<string>, from: number, to: number, logBits = 23, k = 8): Uint8Array {
  const bits = new Uint8Array(2 ** logBits / 8);
  let count = 0;
  for (const t of txids) {
    count++;
    for (const p of probes(t.toLowerCase(), logBits, k)) bits[p >>> 3] |= 1 << (p & 7);
  }
  const out = new Uint8Array(TXSET_HEADER_BYTES + bits.length);
  const dv = new DataView(out.buffer);
  [TXSET_VERSION, logBits, k, count, from, to].forEach((v, i) => dv.setUint32(i * 4, v, true));
  out.set(bits, TXSET_HEADER_BYTES);
  return out;
}

let pending: Promise<TxSet> | null = null;
export function loadTxSet(): Promise<TxSet> {
  pending ??= fetch('/txset.bin')
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`txset.bin ${r.status}`))))
    .then(readTxSet);
  pending.catch(() => (pending = null));
  return pending;
}
