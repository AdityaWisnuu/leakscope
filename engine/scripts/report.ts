// Turns indexer output into the static data the web observatory renders.
// usage: bun scripts/report.ts <outdir> <txs_*.jsonl ...>
import fs from 'node:fs';
import path from 'node:path';
import { analyze, isDenomination, type Finding, type TxRecord, type ValueEvent } from '../src';

// Blocks before --report-from only warm up the observer's memory (so the first deposits
// seen aren't mistaken for unique ones); they are not counted.
const argv = process.argv.slice(2);
const rf = argv.indexOf('--report-from');
const reportFrom = rf >= 0 ? +argv.splice(rf, 2)[1] : 0;
const [outDir, ...files] = argv;
fs.mkdirSync(outDir, { recursive: true });

const BLOCKS_PER_DAY = 1152;
const sorted = files.sort((a, b) => +a.match(/txs_(\d+)/)![1] - +b.match(/txs_(\d+)/)![1]);

interface Day {
  day: number;
  from: number;
  time: number;
  txs: number;
  transparentOnly: number;
  mixed: number;
  fullyShielded: number;
  actions: { sapling: number; orchard: number; ironwood: number };
  shields: number;
  deshields: number;
  crossings: number;
  linkedOuts: number;
}

const days = new Map<number, Day>();
let first = Infinity, last = 0, txCount = 0;
let firstTime = 0;

function* records(): Generator<TxRecord> {
  for (const f of sorted) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line) continue;
      const r: TxRecord = JSON.parse(line);
      if (r.h < reportFrom) {
        yield r;
        continue;
      }
      first = Math.min(first, r.h);
      last = Math.max(last, r.h);
      if (!firstTime) firstTime = r.time;
      const d = Math.floor((r.h - 3_428_143) / BLOCKS_PER_DAY);
      let day = days.get(d);
      if (!day) {
        day = { day: d, from: r.h, time: r.time, txs: 0, transparentOnly: 0, mixed: 0, fullyShielded: 0,
          actions: { sapling: 0, orchard: 0, ironwood: 0 }, shields: 0, deshields: 0, crossings: 0, linkedOuts: 0 };
        days.set(d, day);
      }
      if (r.idx !== 0) {
        txCount++;
        day.txs++;
        const shielded = r.n.ss + r.n.so + r.n.orc + r.n.iw > 0;
        const transparent = r.vin.length + r.vout.length > 0;
        if (!shielded) day.transparentOnly++;
        else if (transparent) day.mixed++;
        else day.fullyShielded++;
        day.actions.sapling += r.n.ss + r.n.so;
        day.actions.orchard += r.n.orc;
        day.actions.ironwood += r.n.iw;
      }
      yield r;
    }
  }
}

const t0 = performance.now();
const all = analyze(records());
const findings = all.findings.filter((f) => (f.h ?? 0) >= reportFrom);
const events = all.events.filter((e) => e.h >= reportFrom);
const outSets = all.outSets.filter((s) => s.event.h >= reportFrom);
const dayOf = (h: number) => days.get(Math.floor((h - 3_428_143) / BLOCKS_PER_DAY));

const outsByTx = new Set<string>();
for (const e of events) {
  const d = dayOf(e.h);
  if (!d) continue;
  if (e.dir === 'in' && e.from === 'transparent') d.shields++;
  if (e.dir === 'in' && e.from !== 'transparent') d.crossings++;
  if (e.dir === 'out' && e.to === 'transparent' && !outsByTx.has(e.txid)) {
    outsByTx.add(e.txid);
    d.deshields++;
  }
}
const uniquelyLinked = outSets.filter((s) => s.candidates.length === 1);
const linkedTx = new Set<string>();
for (const s of uniquelyLinked) {
  if (s.event.to !== 'transparent' || linkedTx.has(s.event.txid)) continue;
  linkedTx.add(s.event.txid);
  const d = dayOf(s.event.h);
  if (d) d.linkedOuts++;
}

const count = (pred: (f: Finding) => boolean) => findings.filter(pred).length;
const crossings = events.filter((e) => e.dir === 'in' && e.from !== 'transparent');
const migrations = crossings.filter((e) => e.from === 'orchard' && e.to === 'ironwood');
const deshieldTxs = outsByTx.size;

const summary = {
  generatedAt: new Date().toISOString(),
  range: { from: first, to: last, blocks: last - first + 1, days: +((last - first + 1) / BLOCKS_PER_DAY).toFixed(1) },
  txs: txCount,
  boundaryEvents: events.length,
  deshieldTxs,
  shieldTxs: new Set(events.filter((e) => e.dir === 'in' && e.from === 'transparent').map((e) => e.txid)).size,
  /** Withdrawals whose amount matches exactly one earlier deposit. */
  linkableDeshields: linkedTx.size,
  linkableDeshieldsPct: +((100 * linkedTx.size) / Math.max(1, deshieldTxs)).toFixed(1),
  roundTrips: count((f) => f.kind === 'utxo-roundtrip'),
  addressReuse: count((f) => f.kind === 'address-reuse'),
  feeFingerprints: count((f) => f.kind === 'fee-fingerprint'),
  migrations: {
    count: migrations.length,
    zec: +(migrations.reduce((s, e) => s + e.amount, 0) / 1e8).toFixed(2),
    standardDenomination: migrations.filter((e) => isDenomination(e.amount)).length,
    uniqueAmount: count((f) => f.kind === 'pool-crossing' && f.anonymitySet === 1 && f.title.includes('orchard → ironwood')),
  },
  findingsBySeverity: Object.fromEntries(
    ['critical', 'high', 'medium', 'low', 'info'].map((s) => [s, count((f) => f.severity === s)]),
  ),
  findingsByKind: findings.reduce<Record<string, number>>((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {}),
};

// The strongest links, for drawing: deterministic first, then unique amount matches.
const evByTx = new Map<string, ValueEvent>();
for (const e of events) if (!evByTx.has(e.txid)) evByTx.set(e.txid, e);
const pick = (e: ValueEvent | undefined) => e && { txid: e.txid, h: e.h, amount: e.amount, from: e.from, to: e.to };
const links = findings
  .filter((f) => ['utxo-roundtrip', 'address-reuse', 'quick-roundtrip', 'amount-link'].includes(f.kind) && f.txids.length === 2)
  .map((f) => ({ kind: f.kind, severity: f.severity, set: f.anonymitySet ?? 1, a: pick(evByTx.get(f.txids[0])), b: pick(evByTx.get(f.txids[1])), title: f.title }))
  .filter((l) => l.a && l.b);

// Columnar boundary-event index so the browser can run pre-flight without a server.
const POOL = { transparent: 0, sapling: 1, orchard: 2, ironwood: 3 } as const;
const index = {
  tip: last,
  amount: events.map((e) => e.amount),
  h: events.map((e) => e.h),
  dir: events.map((e) => (e.dir === 'in' ? 1 : 0)),
  from: events.map((e) => POOL[e.from]),
  to: events.map((e) => POOL[e.to]),
};
const addresses = [...new Set(events.flatMap((e) => e.addrs))];

const write = (name: string, data: unknown) => {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, JSON.stringify(data));
  console.log(`${name}: ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
};
write('summary.json', summary);
write('days.json', [...days.values()].sort((a, b) => a.day - b.day));
write('links.json', links);
write('event-index.json', index);
write('boundary-addresses.json', addresses);
write('findings.json', findings.filter((f) => f.severity !== 'info'));
console.log(JSON.stringify(summary, null, 1));
console.log(`analysis ${Math.round(performance.now() - t0)} ms`);
