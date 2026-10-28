# Leakscope

[![CI](https://github.com/AdityaWisnuu/leakscope/actions/workflows/ci.yml/badge.svg)](https://github.com/AdityaWisnuu/leakscope/actions/workflows/ci.yml)

**Pre-flight privacy tooling for Zcash wallets: a wallet SDK and a pre-flight API that warn before a send leaks, a WASM viewing-key scanner, and the indexer and Rust parser behind them.**

Live: **https://leakscope-cyan.vercel.app** · Demo video (1:58): [demo.mp4](https://leakscope-cyan.vercel.app/demo.mp4) · Pitch deck: [deck.pdf](https://leakscope-cyan.vercel.app/deck.pdf) · SDK: [`@leakscope/engine` 0.1.0](https://github.com/AdityaWisnuu/leakscope/releases/tag/engine-v0.1.0) · Findings: [docs/FINDINGS.md](docs/FINDINGS.md) · Validation: [validation/](validation/) · License: MIT OR Apache-2.0

## The problem

Shielded Zcash transactions hide sender, receiver, amount and memo. The *edges* of the shielded pools are public, though. Shielding (t→pool), deshielding (pool→t) and moving between Sapling, Orchard and Ironwood (the turnstile `valueBalance`) all put exact amounts, addresses and timing on chain. NU6.3 made Orchard withdraw-only at block 3,428,143, so every Orchard holder now has to cross a boundary. Wallets give users no warning before they do it.

## Use it in a wallet

```sh
npm install https://github.com/AdityaWisnuu/leakscope/releases/download/engine-v0.1.0/leakscope-engine-0.1.0.tgz
```

```js
import { checkSend, loadPublishedContext } from '@leakscope/engine';
const ctx = await loadPublishedContext();                       // at app start; or { baseUrl } to self-host
const v = checkSend({ from: 'orchard', to: 'transparent', amountZat: 1_234_560_000, toAddress: 't1...' }, ctx);
// v.level 'danger', v.headline '12.3456 ZEC would be unique on-chain: ...', v.suggestedSplit: ZIP-318 parts + delays
```

The release tarball installs as `@leakscope/engine`. Publishing to the npm registry is pending. The check runs
locally; the only network traffic is two static dataset files that are the same for every user (see
[engine/README.md](engine/README.md)).

## Headline

Over the first **75.6 days of Ironwood** (mainnet blocks 3,428,143–3,515,250, 28 Jul – 12 Oct 2026, 584,497
transactions, after a 30-day warm-up), an observer with nothing but the public chain can link
**24.6% of deshielding transactions (20,343 of 82,581)**.[^counts]

- **5,128 (6.2%) are linked backwards to their deposit** by exact amount plus their own public fee. Precision is
  measured, not assumed: in the fast tier (within 100 blocks) a reverse-time null model found **1 coincidence
  against 2,535 links (≈99%)**.
- **15,215 (18.4%) are linked forwards by round trips.** The deshielded output is itself spent straight back into
  a shielded pool, so the same coins are followed out and back in. The link between the coins is certain. It does
  not necessarily mean the same person: a common cause is a payment to a transparent address whose wallet
  auto-shields it. Our own testnet ground truth is an example: a faucet paid our t-address, and we shielded that
  UTXO ([validation/](validation/)).
- Orchard→Ironwood migrations revealed **3.27M ZEC** in 24,725 transactions. 74% used standard ZIP-318
  denominations; 3,763 amounts were unique in their window.

Full numbers, method and caveats: [docs/FINDINGS.md](docs/FINDINGS.md).

[^counts]: The counts are per deshielding transaction. The tier counts (4,813 + 406 + 20 = 5,239) count amount
    links, and one deshielding with several transparent outputs can carry more than one, so they cover 5,128
    distinct deshielding transactions. Likewise there are 15,668 round-trip findings, one per re-shielding
    transaction. Some deshieldings are re-shielded more than once or are already amount-linked; the 15,215 are the
    deshieldings linked *only* by a round trip. A re-shielding can spend outputs sent to several addresses, which
    is why those 15,668 findings involve 17,326 distinct addresses. The window table in FINDINGS §3 (round amounts,
    10 blocks, 12.5% false) counts every match that is unique within 10 blocks. The tier table applies the
    detector's own rule (unique within 30 days, then tiered by delay), which leaves 13 links and 0 coincidences.

## What's new vs prior work

Round-trip linkage in Zcash is not new. Quesnelle (["On the linkability of Zcash transactions"](https://arxiv.org/abs/1712.01210), arXiv:1712.01210, 2017) linked 31.5% of coins sent into the shielded pool by matching round trips of roughly equal value. Kappos, Yousaf, Maller and Meiklejohn (["An Empirical Analysis of Anonymity in Zcash"](https://www.usenix.org/conference/usenixsecurity18/presentation/kappos), USENIX Security 2018) used similar heuristics, plus founder and miner behaviour, to shrink the shielded anonymity set. Both studied the Sprout era, before Sapling, Orchard and Ironwood.

Leakscope adds:

- **A post-NU6.3 (Ironwood) measurement**, including the Orchard→Ironwood turnstile migration and the Orchard→t→Ironwood path (756 transactions, ~101k ZEC).
- **Measured precision.** Each matching rule is run backwards in time with a reverse-time null model, giving a false-link rate on the chain's real amount distribution. Rules that fail the test are not reported.
- **Exact-fee matching.** A withdrawal matches a deposit only if the deposit equals the withdrawal plus that withdrawal's own public fee.
- **Prevention, not just measurement:** a pre-flight check and a ZIP-318 denomination planner with randomized delays.
- **An in-browser viewing-key scan.** A Rust Sapling/Orchard/Ironwood scanner compiled to WASM; the key stays in the tab.
- **A wallet SDK**, `@leakscope/engine`, with `checkSend()`.

## Responsible publication

- Everything Leakscope shows is derived from **public chain data only**: heights, transparent addresses and values, action counts, fees and value balances. Any full node or explorer sees the same.
- We publish **aggregate statistics plus illustrative examples**. The site's shards make individual findings searchable by txid so people can check their own transactions; they contain nothing a node operator could not compute.
- We add **no off-chain identity data**: no exchange, KYC, IP or social-media attribution, and no attempt to name the owners of addresses.
- The goal is for wallets to fix the defaults that cause these links (round trips, auto-shielding from reused addresses, unique migration amounts), and the SDK exists so they can.

| Observatory | Check a transaction |
|---|---|
| ![Observatory](web/screenshots/observatory-desktop.png) | ![Check](web/screenshots/check-desktop.png) |
| **Pre-flight planner** | **Wallet scan (in-browser, WASM)** |
| ![Plan](web/screenshots/plan-desktop.png) | ![Scan](web/screenshots/scan-desktop.png) |

## Try it in 5 minutes

| Step | What to do |
|---|---|
| 1. [Check `/check`](https://leakscope-cyan.vercel.app/check#c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd) | The fee arithmetic: a 2.50121076 ZEC shielding linked to a 2.50106076 ZEC deshielding 7 blocks later (difference = its 15,000-zatoshi fee). `/check` covers the indexed range. The txid stays in the URL fragment; only a 1/256 shard is fetched, or every shard in paranoid mode. |
| 2. [Observatory `/`](https://leakscope-cyan.vercel.app/) | Boundary privacy over the study window: daily series, linked pairs, round trips, the worst examples. |
| 3. [Plan `/plan`](https://leakscope-cyan.vercel.app/plan) | Pre-flight: enter Orchard → Ironwood, 13.37 ZEC. Get a score, the crowd that amount hides in, and a ZIP-318 split with delays. |
| 4. [Scan `/scan`](https://leakscope-cyan.vercel.app/scan) | Click **Use testnet demo key**, then scan, with devtools → Network open: the key is never sent; only compact block ranges are requested. |
| 5. SDK | `npm install` the release tarball above and run the 3-line `checkSend`, or `examples/node-preflight`. |
| [Method `/method`](https://leakscope-cyan.vercel.app/method) | Every rule, its assumptions, how we validated it, and where it can be wrong. |

## What's inside

```
                 lightwalletd / Zaino (gRPC)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   indexer/  (Node)                core/  (Rust)
   compact blocks → txs_*.jsonl    tx parser (v4–v6, incl. Ironwood)
   raw tx fetched only where   ◄── viewing-key scanner (Sapling/Orchard/Ironwood)
   a boundary can leak             → native binary + WASM (~281 KB brotli)
              │                           │
              ▼                           │
   engine/  (TypeScript, Node + browser)  │
   detectors · calibration · ZIP-318      │
   planner · pre-flight checker           │
        │                │                │
        ▼                ▼                ▼
   cli/  leakscope   web/  Next.js static site
   check|plan|scan   / · /check · /plan · /scan (WASM, key stays in tab) · /method
```

- `core/` — Rust. Parses raw transactions into public facts (transparent ins/outs, per-pool action counts, value balances, fee) and scans compact blocks with a UFVK. Builds a native `leakscope-parse` binary and WASM packages (`pkg-node`, `pkg-web`).
- `indexer/` — Node. Builds a dataset from any lightwalletd-compatible server. `scan-wallet.mjs` finds a wallet's own transactions from its UFVK.
- `engine/` — TypeScript leak detectors, calibration, ZIP-318 denomination planner and pre-flight scoring. Runs unchanged in Node and the browser. Released as the wallet SDK `@leakscope/engine` 0.1.0 ([release tarball](https://github.com/AdityaWisnuu/leakscope/releases/tag/engine-v0.1.0); npm registry publish pending), with runnable [examples](examples/).
- `cli/` — `leakscope check | plan | scan`.
- `validation/` — testnet ground truth (checked in CI) and the local regtest harness.
- `web/` — Next.js static export. No server code, no analytics, no cookies, no third-party scripts at runtime.

## How detection works

Leakscope models one adversary: someone who runs a full node or reads an explorer. They see heights, transparent addresses and values, action counts, fees and each pool's value balance. They cannot break any cryptography. Each pool boundary is a *boundary event*; nothing inside the pools is analysed.

| Detector | Rule | Severity |
|---|---|---|
| `utxo-roundtrip` | A shielding spends a transparent output created by an earlier deshielding. | critical (deterministic) |
| `address-reuse` | A shielding comes from an address that earlier received a deshielding. | high (deterministic) |
| `quick-roundtrip` / `amount-link` | A deshielding whose amount + its own (public) fee equals exactly one earlier deposit into the same pool. Tiered by delay: non-round within 100 blocks (≈99%), non-round within a day (≈85%), round amounts within 10 blocks (≈90%). | high / medium |
| `pool-crossing` | Every turnstile move, scored by how many same-amount moves happened in the window (the crowd). | medium → info |
| `fee-fingerprint` | Fee differs from the ZIP-317 conventional fee for that transaction shape. | low |

**How we measured accuracy.** An amount match can be a coincidence. To measure how often, `engine/scripts/evaluate.ts` runs the exact same matching rule *backwards in time*, against deposits made **after** each withdrawal. Money cannot leave before it arrives, so every backward match is a coincidence, and it estimates the false-link rate on the chain's real amount distribution. Results that set the tiers:

| Tier | Forward links | Reverse coincidences | Measured precision | Stated |
|---|---|---|---|---|
| non-round, ≤100 blocks | 2,535 | 1 | 100.0% | ≈99% |
| non-round, ≤1 day | 128 | 19 | 85.2% | ≈85% |
| round (0.001 ZEC multiples), ≤10 blocks | 13 | 0 | 100.0% (small sample) | ≈90% |

The naive rule ("the only matching deposit in 30 days") is wrong about half the time: 2,284 coincidences against 4,133 links (≈55% false). Links older than a day, and round amounts more than 10 blocks apart, failed this test and are **not reported**.

Ground truth ([validation/](validation/)): we made deliberate mistakes with our own testnet wallet, and the same detectors catch them: a round trip (`85e9872f…` → `1d15b95d…`, critical), a quick round trip (`4080c7a2…` → `8225aad0…`, high) and both exact-amount pool crossings. `bun validation/testnet/check.ts` re-runs this on the public testnet blocks, and CI runs it on every push. A local regtest chain (`validation/regtest/up.sh`) reproduced what each kind of boundary transaction reveals (shield, deshield, pool crossing, fees). Mainnet findings were spot-checked against an independent explorer (zecblock.com). The engine has unit tests for every detector and the planner.

## Reproduce

Requirements: Rust (+ `wasm32-unknown-unknown`, `wasm-bindgen-cli`, Homebrew `llvm` for the WASM build), Node 20+, Bun.

```sh
# 1. Core: native parser (used by indexer and CLI) and WASM packages
cd core && cargo build --release && ./build-wasm.sh && cd ..

# 2. Index mainnet: 30-day warm-up (34,560 blocks) before Ironwood activation, up to the report tip
cd indexer && npm install
FROM=3393583 TO=3515250 ./index-all.sh          # writes ../data/txs_<from>_<to>.jsonl in 10k-block chunks
# single range / other server: node build-dataset.mjs --from <h> --to <h|tip> [--url zec.rocks:443] [--out ../data]
cd ..

# 3. Report: findings, summary and site data (blocks before --report-from only warm up the observer)
cd engine && bun install
bun scripts/report.ts --report-from 3428143 ../data/report-final ../data/txs_*.jsonl

# 4. Evaluate: reverse-time null model
bun scripts/evaluate.ts --report-from 3428143 ../data/txs_*.jsonl --json ../data/report-final/evaluation.json
bun test                                          # engine unit tests
cd ..

# 5. Site: copy data/report-final/* to web/public/data/, then
cd web && npm install && npm run build            # static export in web/out
```

## CLI

```sh
cd cli && bun install
bun src/main.ts check <txid> [--testnet] [--data ../data]
bun src/main.ts plan --from orchard --to ironwood --amount 13.37 [--to-address t1…] [--data ../data]
LEAKSCOPE_UFVK=uview… bun src/main.ts scan --from <birthday height> [--to <height>] [--data ../data]
#   or --ufvk-file <path>, to keep the key out of shell history and `ps`
```

`check` fetches the full transaction from the public lightwalletd server `zec.rocks:443` (or `testnet.zec.rocks:443`), parses it locally and prints what anyone can see plus findings. With `--data` it also matches against the indexed history. **That server learns the txid you checked and your IP.** To avoid that, run your own lightwalletd or Zaino and point the CLI at it (the endpoint is currently set in `cli/src/main.ts`; a `--server` flag is on the roadmap). Pools: `transparent`, `sapling`, `orchard`, `ironwood`.

Pass a viewing key through `LEAKSCOPE_UFVK` or `--ufvk-file`, not on the command line: arguments end up in shell history and are visible in `ps`. The same applies to `indexer/scan-wallet.mjs`, which also accepts `--ufvk` but should be given the env var or the file.

## Privacy model

- **There is no Leakscope backend.** The site is a static export on Vercel: no server code, no analytics, no cookies, no runtime third-party scripts or fonts. Like any static host, Vercel sees your IP and which files you download.
- **Your viewing key never leaves your machine.** On `/scan` it lives inside a WASM module in the tab, and trial decryption is local. Compact blocks come from a public lightwalletd gRPC-web proxy run by ChainSafe (`zcash-mainnet.chainsafe.dev`), which learns the block range you scan and your IP, not your key or your transactions.
- **Check** downloads one shard named by the first byte of the txid. That narrows the txid to about 1 in 256 transactions; it does not hide it completely. Paranoid mode downloads every shard and reveals nothing. The txid stays in the URL fragment, which browsers never send.
- **Plan** and the **SDK** download the same public event index for everyone and compute locally. Randomness for ZIP-318 splits comes from the CSPRNG. Wallets should load the dataset at app start, not right before a send, so the timing of the download does not reveal intent, and can self-host it.
- **The CLI** `check` command asks a lightwalletd server for the transaction (see [CLI](#cli)).
- **Explorer links are opt-in** and labelled.

## Limitations and honest caveats

- Amount links are probabilistic. "Anonymity set of 1" means no other deposit fits, not proof. Precision figures are estimates from a null model, measured on the first part of the range where a full reverse window exists.
- These are **lower bounds**: a real observer adds network metadata, wallet fingerprints and off-chain knowledge (exchange records, KYC).
- Address reuse is concentrated: 66% of the 16,510 reuse findings come from a single address, very likely a service, not an individual.
- Custodians batch users; a link may connect a user to an exchange rather than to a person.
- Fees (and hence exact-fee matches) are only computed when every input value is known.
- Fully shielded transactions are not analysed beyond existence, timing and shape. `/check` covers the indexed range only; the CLI checks any transaction live.
- Round trips link coins, not necessarily people: a deshielding paid to someone else's transparent address that their wallet auto-shields produces the same pattern.
- The data is a snapshot: the study window and the pre-flight crowds end at block 3,515,250 (12 Oct 2026).
- NU7 is expected on mainnet soon after this submission. The parser targets v4–v6 transactions; our testnet ground-truth transactions were made on the current testnet, but mainnet behaviour after NU7 will need re-validation.

## Roadmap

- Publish `@leakscope/engine` to the npm registry (0.1.0 is available as a [release tarball](https://github.com/AdityaWisnuu/leakscope/releases/tag/engine-v0.1.0)).
- PCZT input for pre-flight (lint the exact transaction a wallet is about to sign).
- Continuous indexing so the observatory and pre-flight crowds stay current (the published data ends at block 3,515,250), and NU7 support.
- A `--server` option for the CLI, so `check` can use your own lightwalletd or Zaino.
- Wallet-side defaults informed by the data: ZIP-318 denominations and randomized delays for migrations, and no auto-shielding of deshielded outputs.

## Build log

Research spikes (a testnet light wallet, a local regtest chain, mainnet indexing up to block 3,515,250) were done on 12 Oct 2026 in a scratch folder outside this repository. The code was moved into the repository and committed in logical chunks that evening (UTC+7), which is why many commits are minutes apart. The 28 Oct commits add the SDK packaging and release, docs, validation, CI, the video and the deck. Every commit and spike falls inside the hackathon build window (28 Sep – 28 Oct 2026).

## License

Dual-licensed under MIT OR Apache-2.0, at your option. See [LICENSE](LICENSE), [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE).

Built by Adit ([@AdityaWisnuu](https://github.com/AdityaWisnuu)) for ZECATHON 2026.
