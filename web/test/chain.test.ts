// The browser adapter must judge plans exactly like the engine does on full records.
import { describe, expect, test } from 'bun:test';
import { analyze, ChainContext, preflight, type Plan, type TxRecord } from '../lib/engine';
import { fromIndex, runPreflight } from '../lib/chain';
import type { EventIndex } from '../lib/types';
import { packPreflight, unpackPreflight } from '../lib/preflightPack';
import { AddrSet, packAddrSet } from '../lib/addrSet';

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
// The shipped form: /preflight.bin and /addr.bin.
const addrBin = new AddrSet(packAddrSet(addrs));
const packed = { ...fromIndex(unpackPreflight(packPreflight(ix))), boundaryAddresses: addrBin };
// A tip far past the old events: only the window survives packing, results still agree.
const lateRec = tx(90 + 1152 * 30 + 15, { vb: { sapling: 0, orchard: 1_000_000, ironwood: -1_000_000 } });
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
      // The packed binary index gives the same verdict.
      const d = runPreflight(p, packed);
      const shape = (r: typeof a) => [r.score, r.anonymitySet, r.revealsAmount, r.warnings, r.suggestions.map((s) => [s.title, s.schedule?.length])];
      expect(shape(d)).toEqual(shape(b));
    });
  }

  test('address reuse is flagged with the engine title', () => {
    const addr = [...addrs][0];
    const p: Plan = { from: 'ironwood', to: 'transparent', amount: 100_000_000, toAddress: addr };
    const a = preflight(p, engine), b = runPreflight(p, local);
    expect(b.score).toBe(a.score);
    expect(b.warnings.some((w) => w.title === 'Destination address already appears on-chain')).toBe(true);
  });

  test('packed index keeps only the window and still matches the engine', () => {
    const recs2 = [...recs, lateRec];
    const an2 = analyze(recs2);
    const ix2: EventIndex = {
      tip: an2.events.reduce((m, e) => Math.max(m, e.h), 0),
      amount: an2.events.map((e) => e.amount),
      h: an2.events.map((e) => e.h),
      dir: an2.events.map((e) => (e.dir === 'in' ? 1 : 0)),
      from: an2.events.map((e) => P[e.from]),
      to: an2.events.map((e) => P[e.to]),
      tx: an2.events.map((e) => recs2.findIndex((r) => r.txid === e.txid)),
    };
    const eng2 = new ChainContext(an2);
    const un = unpackPreflight(packPreflight(ix2));
    expect(un.amount.length).toBeLessThan(ix2.amount.length);
    const pk = { ...fromIndex(un), boundaryAddresses: addrBin };
    for (const p of plans) {
      const a = preflight(p, eng2), b = runPreflight(p, pk);
      expect([b.score, b.anonymitySet, b.warnings.map((w) => w.detail)]).toEqual([a.score, a.anonymitySet, a.warnings.map((w) => w.detail)]);
      expect(pk.ctx.tip).toBe(eng2.tip);
    }
  });

  test('hashed address set has every boundary address and nothing else', () => {
    for (const a of addrs) expect(addrBin.has(a)).toBe(true);
    expect(addrBin.has('t1NotARealAddressAtAllxxxxxxxxxxxx')).toBe(false);
    expect(addrBin.size).toBe(addrs.size);
  });
});
