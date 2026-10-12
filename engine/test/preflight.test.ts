import { describe, expect, test } from 'bun:test';
import { analyze, ChainContext, preflight, type TxRecord } from '../src';

const P2PKH = (n: number) => `76a914${n.toString(16).padStart(40, '0')}88ac`;
let seq = 1000;
const tx = (h: number, part: Partial<TxRecord>): TxRecord => ({
  h, time: h * 75, txid: (++seq).toString(16).padStart(64, '0'), idx: 1, fee: null,
  vin: [], vout: [], n: { ss: 0, so: 0, orc: 0, iw: 2 }, ...part,
});
const shield = (h: number, amount: number, addr: number) => {
  const f = tx(h - 1, { vout: [[amount + 15_000, P2PKH(addr)]], n: { ss: 0, so: 0, orc: 0, iw: 0 } });
  return [f, tx(h, { vin: [[f.txid, 0]], vb: { sapling: 0, orchard: 0, ironwood: -amount } })];
};

const recs = [...shield(10, 123_456_789, 1), ...Array.from({ length: 30 }, (_, i) => shield(20 + i * 2, 100_000_000, 100 + i)).flat()];
const ctx = new ChainContext(analyze(recs));

describe('preflight', () => {
  test('staying in one pool is safe', () => {
    expect(preflight({ from: 'ironwood', to: 'ironwood', amount: 5 }, ctx).score).toBe(100);
  });

  test('withdrawing your own unique deposit is critical', () => {
    const own = recs[1].txid;
    const r = preflight({ from: 'ironwood', to: 'transparent', amount: 123_446_789, ownTxids: [own] }, ctx);
    expect(r.warnings.some((w) => w.severity === 'critical')).toBe(true);
    expect(r.score).toBeLessThanOrEqual(5);
    expect(r.suggestions[0].schedule?.length).toBeGreaterThan(1);
  });

  test('a common denomination hides in the crowd', () => {
    const r = preflight({ from: 'ironwood', to: 'transparent', amount: 100_000_000 }, ctx);
    expect(r.anonymitySet).toBeGreaterThan(20);
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  test('reusing a known address is flagged', () => {
    const addr = analyze(recs).events.find((e) => e.addrs.length)!.addrs[0];
    const r = preflight({ from: 'ironwood', to: 'transparent', amount: 100_000_000, toAddress: addr }, ctx);
    expect(r.warnings.some((w) => w.title.includes('already appears'))).toBe(true);
  });
});
