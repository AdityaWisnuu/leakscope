// Turns indexer output into the static data the web observatory renders.
// usage: bun scripts/report.ts [--report-from H] [--network main|test] <outdir> <txs_*.jsonl ...>
import fs from 'node:fs';
import path from 'node:path';
import { analyze, CALIBRATION, isDenomination, type Finding, type TxRecord, type ValueEvent } from '../src';

// Blocks before --report-from only warm up the observer's memory (so the first deposits
// seen aren't mistaken for unique ones); they are not counted.
const argv = process.argv.slice(2);
const rf = argv.indexOf('--report-from');
const reportFrom = rf >= 0 ? +argv.splice(rf, 2)[1] : 0;
// --network test: decode testnet transparent addresses (t2…/tm…) instead of mainnet ones.
const nf = argv.indexOf('--network');
const network = nf >= 0 ? (argv.splice(nf, 2)[1] as 'main' | 'test') : 'main';
if (network !== 'main' && network !== 'test') throw new Error(`--network must be main or test, got ${network}`);
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
const all = analyze(records(), { network });
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
// A withdrawal counts as linked back to its deposit when a calibrated amount link points at
// it — not merely when its amount happens to be unique.
const outEvent = new Map(events.filter((e) => e.dir === 'out' && e.to === 'transparent').map((e) => [e.txid, e]));
const linkedTx = new Set<string>();
for (const f of findings) {
  if (f.kind !== 'quick-roundtrip' && f.kind !== 'amount-link') continue;
  const s = { event: outEvent.get(f.txids[1]) };
  if (!s.event || linkedTx.has(s.event.txid)) continue;
  linkedTx.add(s.event.txid);
  const d = dayOf(s.event.h);
  if (d) d.linkedOuts++;
}

const linkedAnyWay = new Set(linkedTx);
for (const f of findings) if (f.kind === 'utxo-roundtrip' && outEvent.has(f.txids[0])) linkedAnyWay.add(f.txids[0]);

const heightOf = new Map(all.events.map((e) => [e.txid, e.h]));
const count = (pred: (f: Finding) => boolean) => findings.filter(pred).length;
/** Which pools the coins came from and went back into, and how much value the links expose. */
function roundTripPaths() {
  const fromPool = new Map<string, string>();
  const toPool = new Map<string, string>();
  for (const e of all.events) {
    if (e.dir === 'out' && e.to === 'transparent') fromPool.set(e.txid, e.from);
    if (e.dir === 'in' && e.from === 'transparent') toPool.set(e.txid, e.to);
  }
  const paths: Record<string, { count: number; zec: number }> = {};
  let within10 = 0;
  for (const f of findings) {
    if (f.kind !== 'utxo-roundtrip') continue;
    const k = `${fromPool.get(f.txids[0]) ?? '?'} → transparent → ${toPool.get(f.txids[1]) ?? '?'}`;
    paths[k] ??= { count: 0, zec: 0 };
    paths[k].count++;
    paths[k].zec += (f.amount ?? 0) / 1e8;
    const out = all.events.length && heightOf.get(f.txids[0]);
    if (out !== undefined && f.h !== undefined && f.h - out <= 10) within10++;
  }
  for (const v of Object.values(paths)) v.zec = Math.round(v.zec);
  return { paths, within10Blocks: within10 };
}

/** How spread out a kind of finding is across addresses: one busy service vs. many users. */
function concentration(kind: Finding['kind']) {
  const per = new Map<string, number>();
  for (const f of findings) if (f.kind === kind) for (const a of f.addresses ?? []) per.set(a, (per.get(a) ?? 0) + 1);
  const top = [...per.values()].sort((a, b) => b - a)[0] ?? 0;
  const total = count((f) => f.kind === kind);
  return { distinct: per.size, topAddressShare: +((100 * top) / Math.max(1, total)).toFixed(1) };
}
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
  /** Withdrawals linked backwards (to their deposit) or forwards (re-shielded as-is). */
  deshieldsLinkedAnyWay: linkedAnyWay.size,
  deshieldsLinkedAnyWayPct: +((100 * linkedAnyWay.size) / Math.max(1, deshieldTxs)).toFixed(1),
  amountLinks: Object.fromEntries(
    Object.entries(CALIBRATION).map(([tier, c]) => [tier, { ...c, count: findings.filter((f) => (f.kind === 'quick-roundtrip' || f.kind === 'amount-link') && f.detail.includes(c.label)).length }]),
  ),
  roundTrips: count((f) => f.kind === 'utxo-roundtrip'),
  roundTripAddresses: concentration('utxo-roundtrip'),
  roundTripPaths: roundTripPaths(),
  addressReuse: count((f) => f.kind === 'address-reuse'),
  addressReuseAddresses: concentration('address-reuse'),
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
const allLinks = findings
  .filter((f) => ['utxo-roundtrip', 'address-reuse', 'quick-roundtrip', 'amount-link'].includes(f.kind) && f.txids.length === 2)
  .map((f) => ({ kind: f.kind, severity: f.severity, set: f.anonymitySet ?? 1, a: pick(evByTx.get(f.txids[0])), b: pick(evByTx.get(f.txids[1])), title: f.title }))
  .filter((l) => l.a && l.b);
// Spread the drawn links evenly over the days, strongest first within each day, so the
// picture shows how linkage evolves rather than only its first weeks.
const MAX_LINKS = 6000;
const rank = (l: (typeof allLinks)[number]) => (l.severity === 'critical' ? 0 : l.set === 1 ? 1 : 2 + l.set);
const byDay = new Map<number, typeof allLinks>();
for (const l of allLinks) {
  const d = Math.floor((l.b!.h - 3_428_143) / BLOCKS_PER_DAY);
  byDay.set(d, [...(byDay.get(d) ?? []), l]);
}
for (const list of byDay.values()) list.sort((x, y) => rank(x) - rank(y));
const links: typeof allLinks = [];
for (let i = 0; links.length < MAX_LINKS && links.length < allLinks.length; i++) {
  for (const list of byDay.values()) if (i < list.length && links.length < MAX_LINKS) links.push(list[i]);
}

// Columnar boundary-event index so the browser can run pre-flight without a server.
const POOL = { transparent: 0, sapling: 1, orchard: 2, ironwood: 3 } as const;
const index = {
  tip: last,
  amount: events.map((e) => e.amount),
  h: events.map((e) => e.h),
  dir: events.map((e) => (e.dir === 'in' ? 1 : 0)),
  from: events.map((e) => POOL[e.from]),
  to: events.map((e) => POOL[e.to]),
  // Transaction ordinal: events of one transaction (a crossing's out + in, a deshielding's
  // outputs) share it, so look-alikes are counted per transaction as the engine does.
  tx: (() => {
    let k = -1, prev = '';
    return events.map((e) => (e.txid !== prev ? ((prev = e.txid), ++k) : k));
  })(),
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
// Per-transaction lookup without shipping every finding: shard by the first txid byte.
const shards = new Map<string, Finding[]>();
for (const f of findings) {
  for (const t of new Set(f.txids)) {
    const k = t.slice(0, 2);
    shards.set(k, [...(shards.get(k) ?? []), f]);
  }
}
fs.mkdirSync(path.join(outDir, 'findings'), { recursive: true });
// Every one of the 256 shards exists (possibly empty), so fetching all of them is uniform and quiet.
for (let i = 0; i < 256; i++) {
  const k = i.toString(16).padStart(2, '0');
  fs.writeFileSync(path.join(outDir, 'findings', `${k}.json`), JSON.stringify(shards.get(k) ?? []));
}
console.log(`findings/: ${shards.size} shards`);

// The most telling examples of each kind, for the front page.
const examples: Record<string, Finding[]> = {};
for (const kind of ['utxo-roundtrip', 'address-reuse', 'quick-roundtrip', 'amount-link', 'pool-crossing', 'fee-fingerprint']) {
  examples[kind] = findings
    .filter((f) => f.kind === kind && (f.anonymitySet ?? 1) <= 1)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, 12);
}
write('examples.json', examples);
console.log(JSON.stringify(summary, null, 1));
console.log(`analysis ${Math.round(performance.now() - t0)} ms`);
