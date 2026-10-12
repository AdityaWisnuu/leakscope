// Builds a leak-analysis dataset for a block range from a lightwalletd-compatible server.
//
// Compact blocks already carry transparent inputs/outputs and per-pool action counts.
// The one public fact they lack is each pool's value balance, so the full transaction
// is fetched (and parsed by leakscope-parse) only where that balance can leak an amount:
// transactions that mix transparent and shielded parts, or touch more than one shielded pool.
//
// usage: node build-dataset.mjs --from <height> --to <height|tip> [--url zec.rocks:443] [--out ../data]

import grpc from '@grpc/grpc-js';
import loader from '@grpc/proto-loader';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const opt = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const url = opt.url ?? 'zec.rocks:443';
const outDir = path.resolve(here, opt.out ?? '../data');
const concurrency = +(opt.concurrency ?? 12);
const parser = path.resolve(here, '../core/target/release/leakscope-parse');

const def = loader.loadSync(['service.proto'], { includeDirs: [path.join(here, 'proto')], longs: Number, defaults: true });
const Svc = grpc.loadPackageDefinition(def).cash.z.wallet.sdk.rpc.CompactTxStreamer;
const client = new Svc(url, grpc.credentials.createSsl(), { 'grpc.max_receive_message_length': 64e6 });
const call = (m, req) => new Promise((res, rej) => client[m](req, (e, v) => (e ? rej(e) : res(v))));

const hexId = (b) => Buffer.from(b).reverse().toString('hex');

const tip = (await call('GetLatestBlock', {})).height;
const from = +opt.from;
const to = opt.to === undefined || opt.to === 'tip' ? tip : +opt.to;
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `txs_${from}_${to}.jsonl`);
const cacheDir = path.join(outDir, 'raw-facts');
fs.mkdirSync(cacheDir, { recursive: true });

// One long-lived parser process; requests are answered strictly in order.
const proc = spawn(parser, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = [];
readline.createInterface({ input: proc.stdout }).on('line', (l) => pending.shift()(JSON.parse(l)));
const parse = (hex) => new Promise((res) => { pending.push(res); proc.stdin.write(hex + '\n'); });

async function facts(txid) {
  const cached = path.join(cacheDir, `${txid}.json`);
  try {
    return JSON.parse(fs.readFileSync(cached, 'utf8'));
  } catch {
    // Missing or partially written: fetch again.
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const raw = await call('GetTransaction', { hash: Buffer.from(txid, 'hex').reverse() });
      const f = await parse(Buffer.from(raw.data).toString('hex'));
      fs.writeFileSync(cached + '.tmp', JSON.stringify(f));
      fs.renameSync(cached + '.tmp', cached);
      return f;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt ** 2));
    }
  }
}

const t0 = Date.now();
const records = [];
await new Promise((res, rej) => {
  const s = client.GetBlockRange({
    start: { height: from }, end: { height: to },
    poolTypes: ['TRANSPARENT', 'SAPLING', 'ORCHARD', 'IRONWOOD'],
  });
  s.on('data', (b) => {
    for (const tx of b.vtx) {
      const iw = tx.ironwoodActions ?? [];
      records.push({
        h: b.height,
        time: b.time,
        txid: hexId(tx.txid),
        idx: Number(tx.index),
        fee: tx.fee || null,
        vin: tx.vin.map((i) => [hexId(i.prevoutTxid), i.prevoutIndex]),
        vout: tx.vout.map((o) => [Number(o.value), Buffer.from(o.scriptPubKey).toString('hex')]),
        n: { ss: tx.spends.length, so: tx.outputs.length, orc: tx.actions.length, iw: iw.length },
      });
    }
  });
  s.on('end', res);
  s.on('error', rej);
});
console.error(`compact: ${to - from + 1} blocks, ${records.length} txs in ${Date.now() - t0} ms`);

const needsFull = (r) => {
  const pools = (r.n.ss + r.n.so > 0) + (r.n.orc > 0) + (r.n.iw > 0);
  const transparent = r.vin.length + r.vout.length > 0;
  return r.idx !== 0 && pools > 0 && (transparent || pools > 1);
};
const queue = records.filter(needsFull);
let done = 0;
const t1 = Date.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let r; (r = queue.pop()); ) {
      const f = await facts(r.txid);
      if (f.error) { r.parseError = f.error; continue; }
      r.vb = { sapling: f.sapling?.value_balance ?? 0, orchard: f.orchard?.value_balance ?? 0, ironwood: f.ironwood?.value_balance ?? 0 };
      r.expiry = f.expiry_height;
      r.version = f.version;
      if (++done % 500 === 0) console.error(`full txs: ${done} (${Math.round((done * 1000) / (Date.now() - t1))}/s)`);
    }
  }),
);
proc.stdin.end();

fs.writeFileSync(outFile, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.error(`wrote ${outFile}: ${records.length} txs, ${done} with value balances, total ${Date.now() - t0} ms`);
process.exit(0);
