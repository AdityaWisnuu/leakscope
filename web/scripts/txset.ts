// Builds public/txset.bin: a Bloom filter of every txid in the indexed range (see lib/txset.ts).
//   bun scripts/txset.ts [../data]
// Reads the indexer's txs_*.jsonl files and keeps the blocks summary.json says were reported.
import fs from 'node:fs';
import path from 'node:path';
import { buildTxSet, readTxSet } from '../lib/txset';

const dataDir = path.resolve(process.argv[2] ?? path.join(import.meta.dir, '../../data'));
const summary = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '../public/data/summary.json'), 'utf8'));
const { from, to } = summary.range as { from: number; to: number };
const txids: string[] = [];
for (const f of fs.readdirSync(dataDir).filter((f) => /^txs_\d+_\d+\.jsonl$/.test(f)).sort()) {
  for (const line of fs.readFileSync(path.join(dataDir, f), 'utf8').split('\n')) {
    if (!line) continue;
    const m = /"h":(\d+).*?"txid":"([0-9a-f]{64})"/.exec(line);
    if (!m) throw new Error(`Unparsed line in ${f}`);
    const h = Number(m[1]);
    if (h >= from && h <= to) txids.push(m[2]);
  }
}
const bytes = buildTxSet(txids, from, to);
const out = path.join(import.meta.dir, '../public/txset.bin');
fs.writeFileSync(out, bytes);
const set = readTxSet(bytes.buffer as ArrayBuffer);
if (!txids.every((t) => set.has(t))) throw new Error('false negative');
let fp = 0;
for (let i = 0; i < 100_000; i++) if (set.has(crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''))) fp++;
console.log(`${txids.length} txids, blocks ${from}–${to} → ${out} (${(bytes.length / 1024).toFixed(0)} KB, measured FP ${(fp / 1000).toFixed(2)}%)`);
