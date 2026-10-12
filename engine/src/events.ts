import { scriptToAddress } from './address';
import type { Pool, ShieldedPool, TxRecord, ValueEvent } from './types';

export interface OutputInfo {
  value: number;
  addr: string;
  /** The transaction that created this output. */
  txid: string;
}

/** Resolves transparent outpoints to their value and address, from every transaction seen so far. */
export class OutputIndex {
  private outputs = new Map<string, OutputInfo>();

  constructor(private network: 'main' | 'test' = 'main') {}

  add(r: TxRecord) {
    r.vout.forEach(([value, script], i) => {
      this.outputs.set(`${r.txid}:${i}`, { value, addr: scriptToAddress(script, this.network), txid: r.txid });
    });
  }

  get(txid: string, index: number) {
    return this.outputs.get(`${txid}:${index}`);
  }

  address(script: string) {
    return scriptToAddress(script, this.network);
  }
}

const SHIELDED: ShieldedPool[] = ['sapling', 'orchard', 'ironwood'];

/**
 * Public amounts crossing pool boundaries in one transaction.
 *
 * - Shielding: transparent → pool, amount = net value entering the shielded pools.
 * - Deshielding: pool → transparent, one event per transparent output (each lands at a visible address).
 * - Pool crossing: the turnstile between two shielded pools reveals the exact amount moved.
 */
export function valueEvents(r: TxRecord, outputs: OutputIndex): ValueEvent[] {
  if (r.idx === 0 || !r.vb) return [];
  const vb = r.vb;
  const sum = vb.sapling + vb.orchard + vb.ironwood;
  const receiving = SHIELDED.filter((p) => vb[p] < 0).sort((a, b) => vb[a] - vb[b]);
  const sending = SHIELDED.filter((p) => vb[p] > 0).sort((a, b) => vb[b] - vb[a]);
  const base = { txid: r.txid, h: r.h, time: r.time };
  const events: ValueEvent[] = [];

  if (r.vin.length > 0 && sum < 0) {
    const addrs = [...new Set(r.vin.map(([t, i]) => outputs.get(t, i)?.addr).filter((a): a is string => !!a))];
    events.push({ ...base, dir: 'in', from: 'transparent', to: receiving[0] ?? 'ironwood', amount: -sum, addrs });
  }

  if (r.vout.length > 0 && sum > 0) {
    const from: Pool = sending[0] ?? 'ironwood';
    for (const [value, script] of r.vout) {
      events.push({ ...base, dir: 'out', from, to: 'transparent', amount: value, addrs: [outputs.address(script)] });
    }
  }

  // Turnstile: value moving between shielded pools inside one transaction.
  if (receiving.length > 0 && sending.length > 0) {
    for (const to of receiving) {
      const from = sending[0];
      const amount = -vb[to];
      events.push({ ...base, dir: 'out', from, to, amount, addrs: [] });
      events.push({ ...base, dir: 'in', from, to, amount, addrs: [] });
    }
  }
  return events;
}

/** ZIP-317 conventional fee for a transaction's shape. */
export function conventionalFee(r: TxRecord): number {
  const logical = Math.max(r.vin.length, r.vout.length) + Math.max(r.n.ss, r.n.so) + r.n.orc + r.n.iw;
  return 5000 * Math.max(2, logical);
}

/** The fee actually paid, when every input value is known. */
export function paidFee(r: TxRecord, outputs: OutputIndex): number | null {
  if (r.idx === 0) return null;
  if (r.fee !== null && r.vin.length === 0) return r.fee;
  if (!r.vb) return r.vin.length === 0 ? r.fee : null;
  let tin = 0;
  for (const [t, i] of r.vin) {
    const o = outputs.get(t, i);
    if (!o) return null;
    tin += o.value;
  }
  const tout = r.vout.reduce((s, [v]) => s + v, 0);
  return tin - tout + r.vb.sapling + r.vb.orchard + r.vb.ironwood;
}
