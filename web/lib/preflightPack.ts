// Compact binary form of the pre-flight index (/preflight.bin), built from event-index.json.
//
// Pre-flight only ever asks "which boundary events in the last 30 days had an amount within a
// fee of X, and how many distinct transactions are they?". So the packed form keeps exactly
// what that question needs, for the events inside the engine's window:
//   - amounts, sorted ascending and delta-encoded as varints;
//   - per event one varint code = group * 32 + from * 8 + to * 2 + dir, where group is 0 for an
//     event whose transaction has no other event in the window, otherwise a dense 1-based id
//     shared by the events of one transaction.
// Heights are dropped: every packed event is inside the window, so the decoder stamps them with
// the tip, which leaves ChainContext.similar() and the schedule anchor unchanged. The parity
// test (test/chain.test.ts) checks packed results against the engine.
import { DEFAULTS } from './engine';
import type { EventIndex } from './types';

export const PREFLIGHT_VERSION = 1;

function pushVarint(out: number[], v: number) {
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

export function packPreflight(ix: EventIndex, windowBlocks = DEFAULTS.windowBlocks): Uint8Array<ArrayBuffer> {
  // ChainContext's tip is the highest event height, not ix.tip.
  let tip = 0;
  for (const h of ix.h) if (h > tip) tip = h;
  const keep: number[] = [];
  for (let i = 0; i < ix.h.length; i++) if (tip - ix.h[i] <= windowBlocks) keep.push(i);
  const txOf = (i: number) => (ix.tx ? ix.tx[i] : i);
  const perTx = new Map<number, number>();
  for (const i of keep) perTx.set(txOf(i), (perTx.get(txOf(i)) ?? 0) + 1);
  const group = new Map<number, number>();
  for (const i of keep) {
    const t = txOf(i);
    if (perTx.get(t)! > 1 && !group.has(t)) group.set(t, group.size + 1);
  }
  keep.sort((a, b) => ix.amount[a] - ix.amount[b] || a - b);

  const out: number[] = [];
  for (const v of [PREFLIGHT_VERSION, tip, keep.length, windowBlocks]) pushVarint(out, v);
  let prev = 0;
  for (const i of keep) {
    pushVarint(out, ix.amount[i] - prev);
    prev = ix.amount[i];
  }
  for (const i of keep) {
    const g = group.get(txOf(i)) ?? 0;
    pushVarint(out, g * 32 + ix.from[i] * 8 + ix.to[i] * 2 + (ix.dir[i] ? 1 : 0));
  }
  return Uint8Array.from(out);
}

export function unpackPreflight(buf: ArrayBuffer | Uint8Array): EventIndex & { windowBlocks: number } {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let p = 0;
  const next = () => {
    let v = 0, mul = 1, byte: number;
    do {
      if (p >= b.length) throw new Error('Truncated pre-flight index');
      byte = b[p++];
      v += (byte & 127) * mul;
      mul *= 128;
    } while (byte & 128);
    return v;
  };
  if (next() !== PREFLIGHT_VERSION) throw new Error('Unknown pre-flight index version');
  const tip = next(), n = next(), windowBlocks = next();
  const amount = new Array<number>(n), h = new Array<number>(n).fill(tip);
  const dir = new Array<number>(n), from = new Array<number>(n), to = new Array<number>(n), tx = new Array<number>(n);
  let a = 0;
  for (let i = 0; i < n; i++) amount[i] = a += next();
  const codes = new Array<number>(n);
  let groups = 0;
  for (let i = 0; i < n; i++) {
    const c = (codes[i] = next());
    groups = Math.max(groups, Math.floor(c / 32));
  }
  for (let i = 0; i < n; i++) {
    const c = codes[i], g = Math.floor(c / 32);
    tx[i] = g > 0 ? g - 1 : groups + i; // singletons get ids no group uses
    from[i] = (c >> 3) & 3;
    to[i] = (c >> 1) & 3;
    dir[i] = c & 1;
  }
  return { tip, amount, h, dir, from, to, tx, windowBlocks };
}
