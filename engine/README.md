# @leakscope/engine

Pre-flight privacy checks for Zcash wallets. Before the user presses **Send**, ask Leakscope:
*will this transaction be linkable, and how do I do the same thing without the leak?*

- Measures how many recent public transactions look like the planned one (its crowd).
- Flags addresses that already showed up at a shielded-pool boundary.
- Suggests a [ZIP-318](https://zips.z.cash/zip-0318) split into standard denominations with a random,
  exponentially spaced broadcast schedule.
- Runs entirely locally, in Node (18+) and browsers. One self-contained ESM bundle (~32 KiB), no
  runtime dependencies, no `node:` imports. CommonJS build and TypeScript types included.

## Install

```sh
npm install @leakscope/engine
```

Until it is published to npm, install from the repository:

```sh
git clone https://github.com/AdityaWisnuu/leakscope && cd leakscope/engine
bun install && bun run build && npm pack      # -> leakscope-engine-0.1.0.tgz
npm install /path/to/leakscope-engine-0.1.0.tgz   # in your wallet project
```

## Quick start

```js
import { checkSend, loadPublishedContext } from '@leakscope/engine';

const ctx = await loadPublishedContext();            // public mainnet dataset, load once
const v = checkSend(
  { from: 'orchard', to: 'transparent', amountZat: 1_234_560_000, toAddress: 't1...' },
  ctx,
);
console.log(v.level, v.score, v.headline);           // 'danger' 5 '12.3456 ZEC would be unique on-chain: ...'
if (v.suggestedSplit) console.log(v.suggestedSplit.parts); // [{ amountZat: 1e9, crowd: 501 }, ...]
```

Runnable examples: [`examples/node-preflight`](../examples/node-preflight) (CLI wallet prompt) and
[`examples/wallet-confirm`](../examples/wallet-confirm) (a wallet "Confirm send" screen, plain HTML).

## API

### `loadPublishedContext(opts?) => Promise<WalletContext>`

Downloads Leakscope's published dataset and indexes it in memory (about 7 MB + 3 MB of JSON; a few hundred ms to build).

| option | default | |
|---|---|---|
| `baseUrl` | `https://leakscope-cyan.vercel.app/data` | Folder containing `event-index.json` and `boundary-addresses.json`. Self-host it if you prefer. |
| `addresses` | `true` | Set `false` to skip the address list (no address-reuse checks). |
| `fetch` | global `fetch` | Custom fetch: a Tor-routed client, a cache, or reading local files. |
| `signal` | | `AbortSignal`. |

### `contextFromIndex(index, boundaryAddresses?) => WalletContext`

Same, from data you already have (bundled with the app, cached on disk). `index` is the `EventIndex` shape:
parallel columns `tip`, `amount` (zat), `h` (height), `dir` (1 in, 0 out), `from`/`to` (0 transparent,
1 sapling, 2 orchard, 3 ironwood), `tx` (transaction ordinal).

### `checkSend(request, ctx) => SendVerdict`

```ts
interface SendRequest {
  from: Pool;              // 'transparent' | 'sapling' | 'orchard' | 'ironwood'
  to: Pool;                // 'transparent' for a t-address recipient
  amountZat: number;       // positive integer, 1 ZEC = 100_000_000
  toAddress?: string;      // recipient t-address (deshielding)
  fromAddresses?: string[];// t-addresses being spent (shielding)
  currentHeight?: number;  // wallet's chain height; split schedule starts here
  ownTxids?: string[];     // with a full ChainContext: flags withdrawals matching your own deposit
}

interface SendVerdict {
  level: 'ok' | 'warn' | 'danger';
  score: number;           // 0..100
  headline: string;        // one line for the confirmation screen
  reasons: string[];       // short, most serious first
  revealsAmount: boolean;
  crowd: number | null;    // recent public look-alikes incl. this one; null if the amount stays private
  suggestedSplit?: {       // when the amount is revealed and not already a standard denomination
    parts: { amountZat: number; crowd: number }[];  // ZIP-318 denominations, largest first
    residualZat: number;   // below 0.01 ZEC, stays where it is
    schedule: { amount: number; height: number }[]; // random, exponentially spaced (mean 66 blocks)
    minCrowd: number;
  };
  warnings: Warning[];     // full engine output
  suggestions: Suggestion[];
}
```

`ctx` may also be a `ChainContext` you built yourself from `analyze(records)` over raw transactions; then
address checks use the real per-direction history and `ownTxids` works.

### Lower level

- `preflight(plan, chainContext)`: the engine's pre-flight with `{ score, anonymitySet, revealsAmount, warnings, suggestions }`.
- `analyze(records, opts)`: every detector over indexer `TxRecord`s (round trips, address reuse, amount links, pool crossings, fee fingerprints).
- ZIP-318 helpers: `isDenomination`, `decompose`, `decomposeRandomized`, `schedule`, `drawDelay`, `secureRandom`.
- `levelFor(score)`, `fmtZec(zat)`, `CALIBRATION`, `DEFAULT_DATA_URL`.

## What the score means

Any amount that crosses a pool boundary (shielding, deshielding, Orchard to Ironwood) is public. An observer
who matches amounts can link it to a deposit or withdrawal of the same value, so privacy comes down to how
many other recent transactions (last 30 days, allowing for a fee) share that amount:

| crowd (incl. yours) | score | level |
|---|---|---|
| amount stays inside one shielded pool | 100 | ok |
| more than 50 | 90 | ok |
| 11 to 50 | 75 | ok |
| 4 to 10 | 50 | warn |
| 2 to 3 | 25 | danger |
| unique | 5 | danger |
| reused / boundary-touching address | at most 10 | danger |
| fully transparent | 0 | danger |

The score is about linkability through public data. It says nothing about network-level metadata (IP
addresses, timing of your node's broadcasts) and cannot see off-chain information an observer may hold.

## Calibration

The links Leakscope reports were measured on mainnet blocks 3,428,143 to 3,515,250 by applying the same rule
backwards in time (matches that can only be coincidences) to estimate false links:

| tier | rule | precision |
|---|---|---|
| `fast` | non-round amount, withdrawn within 100 blocks | about 99% (2,535 links, 1 coincidence) |
| `day` | non-round amount, within a day | about 85% (128 links, 19 coincidences) |
| `fast-round` | round amount (multiple of 0.001 ZEC), within 10 blocks | about 90% (13 links, 0 coincidences; small sample) |

Beyond a day, unique non-round matches were coincidences more often than not, so they are not reported.
`checkSend` crowd counts are a conservative view of the same data: a larger crowd means more candidates an
observer has to choose between.

## Privacy

Everything runs on the user's device. The only network traffic is `loadPublishedContext` downloading the
public dataset, which is the same file for every user and carries nothing about the planned send: no amount,
no address, no txid. To avoid even revealing that a user runs Leakscope, bundle the dataset, self-host it, or
pass a `fetch` that goes through Tor.

The bundled dataset is a snapshot (its `tip` height). Crowds for very recent activity are not included until the
dataset is refreshed.

## Develop

```sh
bun install
bun test           # 28 tests
bun run build      # dist/: index.js (ESM), index.cjs, .d.ts/.d.cts
```

License: MIT OR Apache-2.0.
