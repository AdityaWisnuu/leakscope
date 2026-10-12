#!/usr/bin/env bun
// leakscope — what a Zcash transaction reveals, before and after you send it.
//
//   leakscope check <txid> [--testnet] [--data <dir>]
//   leakscope plan --from <pool> --to <pool> --amount <ZEC> [--to-address t1…] [--from-address t1…] [--data <dir>]
//
// <pool> is one of: transparent, sapling, orchard, ironwood.
// --data points at indexer output (txs_*.jsonl); without it, plan/check use only the live transaction.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import grpc from '@grpc/grpc-js';
import loader from '@grpc/proto-loader';
import {
  analyze, ChainContext, fmtZec, preflight, scriptToAddress, conventionalFee,
  type Finding, type Pool, type TxRecord,
} from '../../engine/src';

const root = path.resolve(import.meta.dir, '../..');
const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, v && !v.startsWith('--') ? 2 : 1);
  return v && !v.startsWith('--') ? v : 'true';
};

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  sev: (sev: string, s: string) =>
    ({ critical: '\x1b[41;97m', high: '\x1b[31m', medium: '\x1b[33m', low: '\x1b[36m', info: '\x1b[2m' })[sev] + s + '\x1b[0m',
};

function loadRecords(dir: string | undefined): TxRecord[] {
  if (!dir) return [];
  const files = fs.readdirSync(dir).filter((f) => /^txs_\d+_\d+\.jsonl$/.test(f))
    .sort((a, b) => +a.split('_')[1] - +b.split('_')[1]);
  const out: TxRecord[] = [];
  for (const f of files) for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) if (l) out.push(JSON.parse(l));
  return out;
}

function client(testnet: boolean) {
  const def = loader.loadSync(['service.proto'], { includeDirs: [path.join(root, 'indexer/proto')], longs: Number, defaults: true });
  const Svc = (grpc.loadPackageDefinition(def) as any).cash.z.wallet.sdk.rpc.CompactTxStreamer;
  const c = new Svc(testnet ? 'testnet.zec.rocks:443' : 'zec.rocks:443', grpc.credentials.createSsl(), { 'grpc.max_receive_message_length': 64e6 });
  return (m: string, req: object) => new Promise<any>((res, rej) => c[m](req, (e: Error, v: unknown) => (e ? rej(e) : res(v))));
}

function printFindings(fs_: Finding[]) {
  for (const f of fs_) {
    console.log(`  ${C.sev(f.severity, `[${f.severity}]`)} ${C.bold(f.title)}`);
    console.log(`    ${f.detail}`);
    if (f.txids.length > 1) console.log(C.dim(`    linked: ${f.txids.join(' → ')}`));
  }
}

async function check() {
  const txid = args.find((a) => /^[0-9a-f]{64}$/i.test(a));
  if (!txid) throw new Error('usage: leakscope check <txid> [--testnet] [--data dir]');
  const testnet = flag('testnet') === 'true';
  const data = flag('data');
  const call = client(testnet);
  const raw = await call('GetTransaction', { hash: Buffer.from(txid, 'hex').reverse() });
  const parser = path.join(root, 'core/target/release/leakscope-parse');
  const parsed = spawnSync(parser, [], { input: Buffer.from(raw.data).toString('hex') + '\n' });
  const f = JSON.parse(parsed.stdout.toString());
  if (f.error) throw new Error(f.error);

  console.log(C.bold(`\n${f.txid}`) + C.dim(`  ${f.version} · ${f.branch_id} · block ${raw.height} · ${f.size} bytes`));
  console.log(C.bold('\nWhat anyone can see'));
  const pools: [string, { value_balance: number; actions?: number; spends?: number; outputs?: number } | null][] = [
    ['sapling', f.sapling], ['orchard', f.orchard], ['ironwood', f.ironwood],
  ];
  const net = testnet ? 'test' : 'main';
  for (const [i] of f.transparent.vin.entries()) console.log(`  transparent input  ${f.transparent.vin[i].txid.slice(0, 16)}…:${f.transparent.vin[i].index}`);
  for (const o of f.transparent.vout) console.log(`  transparent output ${fmtZec(o.value).padStart(18)} → ${scriptToAddress(o.script, net)}`);
  for (const [name, b] of pools) {
    if (!b) continue;
    const count = b.actions !== undefined ? `${b.actions} actions` : `${b.spends} spends, ${b.outputs} outputs`;
    const vb = b.value_balance;
    const flow = vb === 0 ? 'no value crosses this pool’s edge' : vb > 0 ? `${fmtZec(vb)} leaves the pool` : `${fmtZec(-vb)} enters the pool`;
    console.log(`  ${name.padEnd(9)} ${count.padEnd(22)} ${flow}`);
  }
  console.log(C.dim('  hidden: shielded senders, recipients, individual amounts and memos'));

  const rec: TxRecord = {
    h: raw.height, time: 0, txid: f.txid, idx: 1, fee: null,
    vin: f.transparent.vin.map((v: { txid: string; index: number }) => [v.txid, v.index]),
    vout: f.transparent.vout.map((o: { value: number; script: string }) => [o.value, o.script]),
    n: { ss: f.sapling?.spends ?? 0, so: f.sapling?.outputs ?? 0, orc: f.orchard?.actions ?? 0, iw: f.ironwood?.actions ?? 0 },
    vb: { sapling: f.sapling?.value_balance ?? 0, orchard: f.orchard?.value_balance ?? 0, ironwood: f.ironwood?.value_balance ?? 0 },
  };
  const history = loadRecords(data);
  const all = history.some((r) => r.txid === rec.txid) ? history : [...history.filter((r) => r.h <= rec.h), rec];
  const found = analyze(all, { network: net }).findings.filter((x) => x.txids.includes(rec.txid));
  console.log(C.bold(`\nLeaks${history.length ? ` (against ${history.length.toLocaleString()} indexed transactions)` : ' (this transaction alone; pass --data for linkage)'}`));
  if (found.length === 0) console.log('  none found');
  printFindings(found);
  if (rec.vin.length === 0) {
    const fee = rec.vb!.sapling + rec.vb!.orchard + rec.vb!.ironwood - rec.vout.reduce((s, [v]) => s + v, 0);
    if (fee !== conventionalFee(rec)) console.log(C.sev('low', `  [low] fee ${fee} zat differs from ZIP-317 (${conventionalFee(rec)}): a wallet fingerprint`));
  }
  console.log();
}

async function plan() {
  const from = flag('from') as Pool;
  const to = flag('to') as Pool;
  const amount = Math.round(Number(flag('amount')) * 1e8);
  const pools = ['transparent', 'sapling', 'orchard', 'ironwood'];
  if (!pools.includes(from) || !pools.includes(to) || !(amount > 0)) {
    throw new Error('usage: leakscope plan --from <pool> --to <pool> --amount <ZEC> [--to-address t1…] [--from-address t1…] [--data dir]');
  }
  const toAddress = flag('to-address');
  const fromAddress = flag('from-address');
  const records = loadRecords(flag('data'));
  const ctx = new ChainContext(analyze(records));
  const r = preflight({ from, to, amount, toAddress, fromAddresses: fromAddress ? [fromAddress] : undefined }, ctx);

  const bar = '█'.repeat(Math.round(r.score / 5)).padEnd(20, '░');
  console.log(C.bold(`\nPre-flight: ${fmtZec(amount)} ${from} → ${to}`));
  console.log(`  privacy score ${bar} ${r.score}/100` + (r.anonymitySet ? C.dim(`   anonymity set ${r.anonymitySet}`) : ''));
  if (!records.length) console.log(C.dim('  (no --data given: amount crowd sizes are unknown)'));
  console.log(C.bold('\nWarnings'));
  for (const w of r.warnings) console.log(`  ${C.sev(w.severity, `[${w.severity}]`)} ${C.bold(w.title)}\n    ${w.detail}`);
  if (r.suggestions.length) console.log(C.bold('\nDo this instead'));
  for (const s of r.suggestions) {
    console.log(`  → ${C.bold(s.title)}\n    ${s.detail}`);
    for (const p of s.schedule ?? []) console.log(C.dim(`      at block ${p.height}: ${fmtZec(p.amount)}`));
  }
  console.log();
}

try {
  if (cmd === 'check') await check();
  else if (cmd === 'plan') await plan();
  else {
    console.log('leakscope check <txid> [--testnet] [--data dir]\nleakscope plan --from <pool> --to <pool> --amount <ZEC> [--to-address t…] [--data dir]');
    process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
process.exit();
