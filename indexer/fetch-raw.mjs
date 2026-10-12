// Fetch raw transactions from a lightwalletd-compatible server and save them as hex fixtures.
// usage: node fetch-raw.mjs <outdir> <txid>... [--url zec.rocks:443]
import grpc from '@grpc/grpc-js';
import loader from '@grpc/proto-loader';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const url = urlIdx >= 0 ? args.splice(urlIdx, 2)[1] : 'zec.rocks:443';
const [outdir, ...txids] = args;

const def = loader.loadSync(['service.proto'], { includeDirs: [path.join(here, 'proto')], longs: Number, defaults: true });
const Svc = grpc.loadPackageDefinition(def).cash.z.wallet.sdk.rpc.CompactTxStreamer;
const client = new Svc(url, grpc.credentials.createSsl(), { 'grpc.max_receive_message_length': 64e6 });

fs.mkdirSync(outdir, { recursive: true });
for (const txid of txids) {
  const hash = Buffer.from(txid, 'hex').reverse();
  const raw = await new Promise((res, rej) => client.GetTransaction({ hash }, (e, v) => (e ? rej(e) : res(v))));
  fs.writeFileSync(path.join(outdir, `${txid}.hex`), Buffer.from(raw.data).toString('hex'));
  console.log(txid, raw.height, raw.data.length, 'bytes');
}
process.exit(0);
