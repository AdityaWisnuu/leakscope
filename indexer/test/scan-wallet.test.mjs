// node --test   (from indexer/; needs core/pkg-node, built by core/build-wasm.sh)
//
// Offline tests always run. The ground-truth test scans testnet for the ZECATHON spike
// wallets; it needs network access and their viewing keys, which are NOT in this repo:
// set LEAKSCOPE_KEYS_FILE, or keep the spike checkout next to this repo. Otherwise it skips.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scanWallet } from '../scan-wallet.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { Scanner, parseTxHex } = createRequire(import.meta.url)('../../core/pkg-node/leakscope_core.js');

test('Scanner rejects malformed keys with a clear error', () => {
  assert.throws(() => new Scanner('not a key'), /mainnet \(uview1…\) or testnet/);
  assert.throws(() => new Scanner('uviewtest1qqqqqqqq'), /invalid UFVK/);
  assert.throws(() => new Scanner('uview1qqqqqqqq'), /invalid UFVK/);
});

test('parseTxHex exposes the public tx facts', () => {
  const dir = path.join(here, '../../fixtures/mainnet');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.hex'))) {
    const facts = parseTxHex(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(facts.txid, f.replace('.hex', ''));
    assert.ok(facts.transparent && 'vin' in facts.transparent);
  }
  assert.throws(() => parseTxHex('zz'), /bad hex/);
  assert.throws(() => parseTxHex('00'), /bad transaction/);
});

// Ground truth: spikes/cli-wallet/REPORT.md §6 (testnet, all Ironwood-era v6 txs).
const RANGE = { from: 4491860, to: 4492100 };
const EXPECTED = {
  alice: {
    // txid: [height, received [pool, scope, value][], spent values[]]
    '1d15b95d399d66ce544e69e4a1e986563c9b47d84caaed7a0e4e95c1a7b19bb9': [4492028, [['ironwood', 'internal', 12485000]], []],
    '1b5d6271ca3919705b36d528abca384f91e5b44a786bdb2a31d6de5b3be24bbd': [4492032, [['ironwood', 'internal', 11475000]], [12485000]],
    '4080c7a2fb75d7197fa96ae69d4c4d9a5249a8f41b9a22bb419dca9ed340b5ab': [4492044, [['ironwood', 'internal', 9455000]], [11475000]],
    '9a392e377b62cac9cba5dfa5b4c888d8ef0bb7fe315e81416e003773d9125ef5': [4492051, [['ironwood', 'internal', 6440000]], [9455000]],
    '8225aad03341b047d2a5963ee743e25463d2c36a42aed47bb2ea24a014b90a5f': [4492056, [['ironwood', 'external', 2500000]], []],
    '74217a30af4aa9611606c35d13daf8e25de9a12ad417a382874dab6f05ab299a': [4492062, [['ironwood', 'internal', 1260000]], [2500000]],
  },
  bob: {
    '1b5d6271ca3919705b36d528abca384f91e5b44a786bdb2a31d6de5b3be24bbd': [4492032, [['ironwood', 'external', 1000000]], []],
    '4080c7a2fb75d7197fa96ae69d4c4d9a5249a8f41b9a22bb419dca9ed340b5ab': [4492044, [['sapling', 'external', 2000000]], []],
    '8225aad03341b047d2a5963ee743e25463d2c36a42aed47bb2ea24a014b90a5f': [4492056, [['ironwood', 'internal', 480000]], [1000000, 2000000]],
    '74217a30af4aa9611606c35d13daf8e25de9a12ad417a382874dab6f05ab299a': [4492062, [['ironwood', 'external', 1230000]], []],
  },
};

const keysFile = process.env.LEAKSCOPE_KEYS_FILE
  ?? path.join(here, '../../../spikes/cli-wallet/TESTNET_ONLY_KEYS_DO_NOT_USE_ON_MAINNET.txt');

function ufvkOf(wallet) {
  const text = fs.readFileSync(keysFile, 'utf8');
  const section = text.split(/=== wallet: /).find((s) => s.startsWith(wallet));
  return section?.match(/UFVK:\s*(uviewtest1\S+)/)?.[1];
}

for (const wallet of Object.keys(EXPECTED)) {
  test(`testnet ground truth: ${wallet}`, { skip: !fs.existsSync(keysFile) && 'viewing keys not available' }, async (t) => {
    let r;
    try {
      r = await scanWallet({ ufvk: ufvkOf(wallet), ...RANGE });
    } catch (e) {
      if (e.code === 14 /* UNAVAILABLE */) return t.skip(`network unavailable: ${e.message}`);
      throw e;
    }
    t.diagnostic(`${r.blocks} blocks, ${r.stats.blocksPerSec} blocks/s`);
    const got = Object.fromEntries(r.txs.map((x) => [
      x.txid,
      [x.height, x.received.map((n) => [n.pool, n.scope, n.value]), x.spent.map((s) => s.value).sort((a, b) => a - b)],
    ]));
    assert.deepEqual(got, EXPECTED[wallet]);
  });
}
