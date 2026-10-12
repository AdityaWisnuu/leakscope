// Finds the transactions that belong to a wallet, using only its viewing key.
//
// Compact blocks stream from a lightwalletd-compatible server as raw protobuf bytes and go
// straight into the leakscope-core WASM scanner, which trial-decrypts every Sapling output
// and Orchard / Ironwood action locally. The server only ever sees a block-range request,
// the same request every light wallet makes; the key never leaves this process.
//
// usage: node scan-wallet.mjs --ufvk <uview…> --from <height> --to <height|tip> [--url host:443]
//        (or --ufvk-file <path>, or LEAKSCOPE_UFVK=<uview…>, to keep the key out of `ps`/history)
// Prints JSON to stdout; progress and speed to stderr.

import grpc from '@grpc/grpc-js';
import loader from '@grpc/proto-loader';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { Scanner } = createRequire(import.meta.url)('../core/pkg-node/leakscope_core.js');

const SERVERS = { main: 'zec.rocks:443', test: 'testnet.zec.rocks:443' };
const SVC = 'cash.z.wallet.sdk.rpc.CompactTxStreamer';

function connect(url) {
  const def = loader.loadSync(['service.proto'], { includeDirs: [path.join(here, 'proto')], longs: Number, defaults: true });
  const Svc = grpc.loadPackageDefinition(def).cash.z.wallet.sdk.rpc.CompactTxStreamer;
  const client = new Svc(url, grpc.credentials.createSsl(), { 'grpc.max_receive_message_length': 64e6 });
  const call = (m, req) => new Promise((res, rej) => client[m](req, (e, v) => (e ? rej(e) : res(v))));
  // Stream blocks as undecoded bytes: decoding happens once, in Rust.
  const rawBlocks = (req) =>
    client.makeServerStreamRequest(`/${SVC}/GetBlockRange`, def[SVC].GetBlockRange.requestSerialize, (buf) => buf, req);
  return { client, call, rawBlocks };
}

/**
 * Scans [from, to] and returns the wallet's transactions.
 * @param {{ufvk: string, from: number, to?: number|'tip', url?: string, onProgress?: (h: number, n: number) => void}} o
 */
export async function scanWallet({ ufvk, from, to = 'tip', url, onProgress }) {
  const scanner = new Scanner(ufvk); // throws on a malformed key
  try {
    url ??= SERVERS[scanner.network];
    const { client, call, rawBlocks } = connect(url);
    try {
      const info = await call('GetLightdInfo', {});
      if (info.chainName !== scanner.network) {
        throw new Error(`network mismatch: key is for ${scanner.network}net but ${url} serves ${info.chainName}net`);
      }
      const end = to === 'tip' ? Number(info.blockHeight) : +to;
      if (!(from >= 0 && end >= from)) throw new Error(`bad range ${from}..${end}`);

      const txs = [];
      let blocks = 0;
      let bytes = 0;
      let scanMs = 0;
      const t0 = performance.now();
      await new Promise((resolve, reject) => {
        const s = rawBlocks({
          start: { height: from }, end: { height: end },
          poolTypes: ['TRANSPARENT', 'SAPLING', 'ORCHARD', 'IRONWOOD'],
        });
        s.on('data', (buf) => {
          const t = performance.now();
          let found;
          try {
            found = scanner.scanBlock(buf);
          } catch (e) {
            s.cancel();
            return reject(e);
          }
          scanMs += performance.now() - t;
          blocks++;
          bytes += buf.length;
          txs.push(...found);
          if (onProgress && blocks % 1000 === 0) onProgress(from + blocks - 1, blocks);
        });
        s.on('end', resolve);
        s.on('error', reject);
      });
      const ms = performance.now() - t0;
      if (blocks !== end - from + 1) throw new Error(`server returned ${blocks} blocks, expected ${end - from + 1}`);

      return {
        network: scanner.network,
        url,
        from,
        to: end,
        blocks,
        stats: {
          ms: Math.round(ms),
          blocksPerSec: Math.round((blocks * 1000) / ms),
          scanMs: Math.round(scanMs),
          scanBlocksPerSec: Math.round((blocks * 1000) / Math.max(scanMs, 1)),
          mbytes: +(bytes / 1e6).toFixed(2),
        },
        notesFound: scanner.notesFound,
        txs: txs.map((t) => ({
          txid: t.txid,
          height: t.height,
          txIndex: t.tx_index,
          pools: [...new Set([...t.received, ...t.spent].map((x) => x.pool))],
          received: t.received,
          spent: t.spent,
        })),
      };
    } finally {
      client.close();
    }
  } finally {
    scanner.free();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opt = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
  );
  const ufvk = opt.ufvk ?? (opt['ufvk-file'] ? fs.readFileSync(opt['ufvk-file'], 'utf8').trim() : process.env.LEAKSCOPE_UFVK);
  if (!ufvk || opt.from === undefined) {
    console.error('usage: node scan-wallet.mjs --ufvk <uview…> --from <height> [--to <height|tip>] [--url host:443]');
    process.exit(2);
  }
  try {
    const r = await scanWallet({
      ufvk, from: +opt.from, to: opt.to ?? 'tip', url: opt.url,
      onProgress: (h, n) => console.error(`… height ${h} (${n} blocks)`),
    });
    console.error(`scanned ${r.blocks} blocks in ${r.stats.ms} ms: ${r.stats.blocksPerSec} blocks/s end-to-end, ` +
      `${r.stats.scanBlocksPerSec} blocks/s trial decryption only; ${r.txs.length} wallet txs`);
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
