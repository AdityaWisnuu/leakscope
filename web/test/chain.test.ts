// The browser adapter must judge plans exactly like the engine does on full records.
import { describe, expect, test } from 'bun:test';
import { analyze, ChainContext, preflight, type Plan, type TxRecord } from '../lib/engine';
import { fromIndex, runPreflight } from '../lib/chain';
import type { EventIndex } from '../lib/types';

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
const recs = [
  ...shield(10, 123_456_789, 1),
  ...Array.from({ length: 30 }, (_, i) => shield(20 + i * 2, 100_000_000, 100 + i)).flat(),
  tx(90, { vb: { sapling: 0, orchard: 777_000_000, ironwood: -777_000_000 } }),
];
const analysis = analyze(recs);
const P = { transparent: 0, sapling: 1, orchard: 2, ironwood: 3 } as const;
const ix: EventIndex = {
  tip: analysis.events.reduce((m, e) => Math.max(m, e.h), 0),
  amount: analysis.events.map((e) => e.amount),
  h: analysis.events.map((e) => e.h),
  dir: analysis.events.map((e) => (e.dir === 'in' ? 1 : 0)),
  from: analysis.events.map((e) => P[e.from]),
  to: analysis.events.map((e) => P[e.to]),
  tx: analysis.events.map((e) => recs.findIndex((r) => r.txid === e.txid)),
};
const addrs = new Set(analysis.events.flatMap((e) => e.addrs));
const local = { ...fromIndex(ix), boundaryAddresses: addrs };
const engine = new ChainContext(analysis);

const plans: Plan[] = [
  { from: 'ironwood', to: 'ironwood', amount: 5 },
  { from: 'transparent', to: 'transparent', amount: 5 },
  { from: 'ironwood', to: 'transparent', amount: 123_446_789 },
  { from: 'ironwood', to: 'transparent', amount: 100_000_000 },
  { from: 'orchard', to: 'ironwood', amount: 777_000_000 },
  { from: 'orchard', to: 'ironwood', amount: 3_727_814_000 },
  { from: 'transparent', to: 'ironwood', amount: 50_000 },
];

const { tx: _drop, ...legacyIx } = ix;
const legacy = { ...fromIndex(legacyIx), boundaryAddresses: addrs };

describe('browser pre-flight matches the engine', () => {
  for (const p of plans) {
    test(`${p.from} → ${p.to} ${p.amount}`, () => {
      const a = preflight(p, engine), b = runPreflight(p, local);
      expect(b.score).toBe(a.score);
      expect(b.anonymitySet).toBe(a.anonymitySet);
      expect(b.revealsAmount).toBe(a.revealsAmount);
      expect(b.warnings.map((w) => [w.severity, w.title])).toEqual(a.warnings.map((w) => [w.severity, w.title]));
      expect(b.suggestions.map((s) => [s.title, s.schedule?.length])).toEqual(a.suggestions.map((s) => [s.title, s.schedule?.length]));
      // Indexes generated before the tx column existed still agree.
      const c = runPreflight(p, legacy);
      expect([c.score, c.anonymitySet]).toEqual([a.score, a.anonymitySet]);
    });
  }

  test('address reuse is flagged with the engine title', () => {
    const addr = [...addrs][0];
    const p: Plan = { from: 'ironwood', to: 'transparent', amount: 100_000_000, toAddress: addr };
    const a = preflight(p, engine), b = runPreflight(p, local);
    expect(b.score).toBe(a.score);
    expect(b.warnings.some((w) => w.title === 'Destination address already appears on-chain')).toBe(true);
  });
});
