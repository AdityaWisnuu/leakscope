// How often is an amount link a coincidence? Measured on real mainnet data.
//
// The amount detector pairs a withdrawal with deposits that came BEFORE it. Running the
// exact same rule against deposits that came AFTER it can only ever find coincidences —
// money can't leave before it arrives — so the reverse-time match rate estimates the false
// discovery rate of the forward matches, using the chain's real amount distribution.
//
// usage: bun scripts/evaluate.ts --report-from <h> <txs_*.jsonl ...> [--json out.json]

import fs from 'node:fs';
import { analyze, CALIBRATION, depositMatches, linkTier, DEFAULTS, isDenomination, type TxRecord, type ValueEvent } from '../src';

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const reportFrom = +(opt('report-from') ?? 0);
const jsonOut = opt('json');
const files = argv.sort((a, b) => +a.match(/txs_(\d+)/)![1] - +b.match(/txs_(\d+)/)![1]);

function* records(): Generator<TxRecord> {
  for (const f of files) for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l) yield JSON.parse(l);
}

const { events } = analyze(records());
const ins = events.filter((e) => e.dir === 'in').sort((a, b) => a.amount - b.amount);
const lastH = events.reduce((m, e) => Math.max(m, e.h), 0);

function candidates(out: ValueEvent, window: number, direction: 1 | -1): number {
  return matches(out, window, direction).length;
}

function matches(out: ValueEvent, window: number, direction: 1 | -1): ValueEvent[] {
  let lo = 0, hi = ins.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ins[mid].amount < out.amount) lo = mid + 1;
    else hi = mid;
  }
  const seen = new Map<string, ValueEvent>();
  for (let i = lo; i < ins.length && ins[i].amount <= out.amount + DEFAULTS.maxFeeGap; i++) {
    const c = ins[i];
    const d = direction * (out.h - c.h);
    if (c.txid === out.txid || d <= 0 || d > window || c.to !== out.from) continue;
    if (depositMatches(c.amount, out)) seen.set(c.txid, c);
  }
  return [...seen.values()];
}

interface Row { label: string; window: number; outs: number; forwardUnique: number; reverseUnique: number; fdr: number }
const rows: Row[] = [];

function measure(label: string, window: number, pick: (e: ValueEvent) => boolean) {
  // Only withdrawals whose reverse window lies entirely inside the data, so both directions see the same amount of chain.
  const outs = events.filter((e) => e.dir === 'out' && e.to === 'transparent' && e.h >= reportFrom && e.h + window <= lastH && pick(e));
  let f = 0, r = 0;
  for (const o of outs) {
    if (candidates(o, window, 1) === 1) f++;
    if (candidates(o, window, -1) === 1) r++;
  }
  const row = { label, window, outs: outs.length, forwardUnique: f, reverseUnique: r, fdr: +((100 * r) / Math.max(1, f)).toFixed(1) };
  rows.push(row);
  console.log(`${label.padEnd(34)} window ${String(window).padStart(5)}  withdrawals ${String(row.outs).padStart(6)}  unique fwd ${String(f).padStart(5)}  unique rev ${String(r).padStart(5)}  est. false links ${row.fdr}%`);
}

const round = (e: ValueEvent) => e.amount % 100_000 === 0;
for (const w of [100, 1152, 1152 * 7, DEFAULTS.windowBlocks]) measure('all withdrawals', w, () => true);
for (const w of [100, 576, 1152, 1152 * 7, DEFAULTS.windowBlocks]) measure('non-round amounts', w, (e) => !round(e));
for (const w of [10, 100, 576, 1152]) measure('round amounts (0.001 ZEC multiples)', w, round);

// Calibration exactly as the detector decides: unique within 30 days, then tiered by delay.
const tiers: Record<string, { forward: number; reverse: number; precision?: number; current?: number }> = {};
const W = DEFAULTS.windowBlocks;
for (const o of events) {
  if (o.dir !== 'out' || o.to !== 'transparent' || o.h < reportFrom || o.h + W > lastH) continue;
  for (const dir of [1, -1] as const) {
    const m = matches(o, W, dir);
    if (m.length !== 1) continue;
    const t = linkTier(Math.abs(o.h - m[0].h), o.amount);
    if (!t) continue;
    tiers[t] ??= { forward: 0, reverse: 0 };
    tiers[t][dir === 1 ? 'forward' : 'reverse']++;
  }
}
console.log('\ncalibration per detector tier (unique within 30 days):');
for (const [t, v] of Object.entries(tiers)) {
  v.precision = +(100 - (100 * v.reverse) / Math.max(1, v.forward)).toFixed(1);
  v.current = CALIBRATION[t as keyof typeof CALIBRATION].precision;
  console.log(`  ${t.padEnd(11)} links ${String(v.forward).padStart(5)}  coincidences ${String(v.reverse).padStart(5)}  precision ≈ ${v.precision}%  (CALIBRATION says ${v.current}%)`);
}

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), reportFrom, rows, tiers }, null, 1));
