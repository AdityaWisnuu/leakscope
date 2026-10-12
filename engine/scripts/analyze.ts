// Runs every detector over indexer output and prints findings.
// usage: bun scripts/analyze.ts <txs_*.jsonl ...> [--network test] [--only txid,txid] [--json out.json]
import fs from 'node:fs';
import { analyze, type TxRecord } from '../src';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const network = (flag('network') ?? 'main') as 'main' | 'test';
const only = flag('only')?.split(',');
const jsonOut = flag('json');

function* records(files: string[]): Generator<TxRecord> {
  for (const f of files.sort((a, b) => +a.match(/txs_(\d+)/)![1] - +b.match(/txs_(\d+)/)![1])) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) if (line) yield JSON.parse(line);
  }
}

const t0 = performance.now();
const { findings, events } = analyze(records(args), { network });
const shown = only ? findings.filter((f) => f.txids.some((t) => only.some((o) => t.startsWith(o)))) : findings;

const byKind: Record<string, number> = {};
for (const f of findings) byKind[`${f.kind}/${f.severity}`] = (byKind[`${f.kind}/${f.severity}`] ?? 0) + 1;
console.log(`events ${events.length}, findings ${findings.length} in ${Math.round(performance.now() - t0)} ms`);
console.table(byKind);
for (const f of shown.slice(0, 40)) console.log(`[${f.severity}] ${f.kind}: ${f.title}\n    ${f.txids.map((t) => t.slice(0, 12)).join(' → ')}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(findings));
