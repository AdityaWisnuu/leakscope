// Re-runs Leakscope's detectors over the 301 testnet blocks that contain our deliberate mistakes
// (blocks 4,491,800-4,492,100, public chain data) and checks that each one is caught.
// usage (from the repo root, after `cd engine && bun install`): bun validation/testnet/check.ts
import fs from 'node:fs';
import path from 'node:path';
import { analyze, type TxRecord } from '../../engine/src';

const file = path.join(import.meta.dir, 'txs_4491800_4492100.jsonl');
const records: TxRecord[] = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const { findings } = analyze(records, { network: 'test' });

// Ground truth: transactions we made ourselves (see testnet/GROUND_TRUTH.md).
const expected = [
  { kind: 'utxo-roundtrip', severity: 'critical', txids: ['85e9872f', '1d15b95d'], what: 'faucet deshield to our t-addr, then we shielded that UTXO' },
  { kind: 'quick-roundtrip', severity: 'high', txids: ['4080c7a2', '8225aad0'], what: '0.02 ZEC Ironwood -> Sapling, back 12 blocks later' },
  { kind: 'pool-crossing', severity: 'medium', txids: ['4080c7a2'], what: 'exact 0.02 ZEC turnstile amount (Ironwood -> Sapling)' },
  { kind: 'pool-crossing', severity: 'medium', txids: ['8225aad0'], what: 'exact turnstile amount (Sapling -> Ironwood)' },
];

let ok = true;
for (const e of expected) {
  const hit = findings.find((f) => f.kind === e.kind && e.txids.every((p) => f.txids.some((t) => t.startsWith(p))));
  const pass = !!hit && hit.severity === e.severity;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${e.kind.padEnd(16)} ${e.severity.padEnd(8)} ${e.txids.join(' -> ')}  (${e.what})`);
}
console.log(`\n${records.length} txs, ${findings.length} findings in total`);
for (const f of findings) console.log(`  ${f.severity.padEnd(8)} ${f.kind.padEnd(16)} ${f.txids.map((t) => t.slice(0, 8)).join(' -> ')}  ${f.title}`);
process.exit(ok ? 0 : 1);
