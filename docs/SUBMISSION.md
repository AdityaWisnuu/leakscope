# ZECATHON 2026 submission: Leakscope

Ready-to-paste text for the submission form.

## Project name

Leakscope

## Tagline (≤100 characters)

Pre-flight privacy SDK for Zcash wallets: warn before a send leaks at a pool boundary.

## Short description (~50 words)

Leakscope is privacy tooling for Zcash wallets: an SDK whose `checkSend()` warns before a send leaks at a pool boundary, a ZIP-318 planner, a WASM viewing-key scanner, and the indexer and Rust parser behind them. The evidence is 75.6 days of post-Ironwood mainnet: 24.6% of deshields are linked, 6.2% by amount at a measured ≈99% precision.

## Long description (~300 words)

Shielded Zcash hides sender, receiver and amount, but the edges of the pools are public. Shielding, deshielding and moving between Sapling, Orchard and Ironwood put exact amounts, addresses and timing on chain. Since NU6.3 made Orchard withdraw-only, every Orchard holder has to cross one of these boundaries, and wallets give no warning before they do. Leakscope is the tooling for that moment:

- **Wallet SDK** `@leakscope/engine` 0.1.0 ([release](https://github.com/AdityaWisnuu/leakscope/releases/tag/engine-v0.1.0); npm registry publish pending): `checkSend()` returns ok / warn / danger, a score and a ZIP-318 split before the user signs. It runs locally in Node and browsers, and the dataset can be self-hosted.
- **Pre-flight planner** (`/plan`, CLI `plan`): scores a move by the crowd its amount hides in and proposes ZIP-318 denominations with randomized delays.
- **Viewing-key scanner**: Rust (Sapling/Orchard/Ironwood) compiled to WASM (~281 KB brotli). It finds your own leaks in the browser, and the key never leaves the tab.
- **Indexer and parser**: a Rust v4–v6 transaction parser and a lightwalletd/Zaino indexer that fetches raw transactions only where a boundary can leak. CI runs the Rust, engine and web tests.

The evidence behind the warnings: we indexed mainnet from Ironwood activation (block 3,428,143) for 75.6 days, 584,497 transactions after a 30-day warm-up. An observer with only the public chain can link 24.6% of deshielding transactions (20,343 of 82,581). 5,128 (6.2%) are linked back to their deposit by exact amount plus their own fee. A further 15,215 (18.4%) are linked forward by round trips: the same coins were re-shielded, often by a recipient wallet that auto-shields, so the coins are linked but not necessarily the person. We measured precision instead of assuming it. Running each rule against deposits made *after* each withdrawal can only find coincidences, which estimates the false-link rate on the chain's real amounts. The fast tier scored 2,535 links against 1 coincidence (≈99%). The naive rule was wrong about half the time, so failing rules are not reported. Prior work (Quesnelle 2017; Kappos et al., USENIX Security 2018) showed round-trip linkage in the Sprout era; this is the first calibrated measurement after Ironwood. Our own deliberate testnet mistakes are caught by the same detectors, and CI re-checks this on every push.

## Suggested track(s)

- **Primary: Core & Tooling** (final). A wallet SDK and pre-flight API, a WASM viewing-key scanner, a Rust transaction parser and an indexer, with the mainnet research as the evidence for what the SDK warns about.
- **Grand Prize candidacy.** It turns the judging criterion "leaks are disqualifying" into a product, with original mainnet research behind it.
- Alternative fits: **Wildcard** (privacy research / observatory); **Shielded Payments** (pre-flight checks for payment flows that touch transparent addresses); **Cross-Chain** (the same boundary analysis applies to transparent deposit addresses used by bridges and swaps).

## What's novel

- **Prior work, extended.** Quesnelle ([arXiv:1712.01210](https://arxiv.org/abs/1712.01210), 2017) and Kappos, Yousaf, Maller and Meiklejohn ([USENIX Security 2018](https://www.usenix.org/conference/usenixsecurity18/presentation/kappos)) measured round-trip linkage before Sapling. Leakscope measures it after Ironwood, with calibrated precision, and turns it into a wallet-side check.
- **Measured, not asserted, precision.** A reverse-time null model gives a false-link rate for every rule on real chain data; rules that fail it are not reported.
- **First post-Ironwood measurement** of boundary privacy: deshield linkability, round trips by pool path, and the 3.27M ZEC Orchard→Ironwood migration (74% in standard ZIP-318 denominations).
- **Exact-fee matching.** A deposit matches a withdrawal only if it equals the amount plus that withdrawal's own public fee, which pins whole-note withdrawals to one value.
- **Client-side everything.** Viewing-key scanning in WASM in the browser, sharded lookups that narrow a checked txid only to 1 of 256 shards (or reveal nothing in paranoid mode), and a static site with no Leakscope backend or analytics. Disclosed metadata: the static host sees IPs and file requests, and the `/scan` lightwalletd proxy (ChainSafe) sees the block range and IP.
- **Ground truth.** Deliberate mistakes with our own testnet wallet are caught by the same detectors (`validation/testnet/check.ts`, run in CI). A local regtest harness (`validation/regtest/`) reproduces what each boundary transaction reveals.
- **Responsible publication.** Public chain data only; aggregate statistics plus illustrative examples; no off-chain identity data.

## Tech stack

- Rust: `zcash_primitives`, `zcash_keys`, `orchard`, `sapling-crypto`, `zcash_note_encryption`; `wasm-bindgen` builds for Node and the browser.
- Node indexer over lightwalletd/Zaino gRPC (`@grpc/grpc-js`).
- TypeScript engine (Bun for tests and scripts), ZIP-317 fees and ZIP-318 denominations.
- Next.js static export (React, GSAP), gRPC-web for in-browser compact block fetching, deployed on Vercel.
- Data: public mainnet, testnet and regtest.

## Links

- Repository: https://github.com/AdityaWisnuu/leakscope
- Live site: https://leakscope-cyan.vercel.app
- Findings write-up: https://github.com/AdityaWisnuu/leakscope/blob/main/docs/FINDINGS.md
- Demo video (1:57): https://leakscope-cyan.vercel.app/demo.mp4
- Pitch deck: https://leakscope-cyan.vercel.app/deck.pdf
- SDK release: https://github.com/AdityaWisnuu/leakscope/releases/tag/engine-v0.1.0

## Team

- Adit ([@AdityaWisnuu](https://github.com/AdityaWisnuu)): design, research and implementation.

## How judges can evaluate in 5 minutes

1. **(1 min)** Open https://leakscope-cyan.vercel.app. Read the headline number and the linked pairs on the observatory.
2. **(1 min)** Open https://leakscope-cyan.vercel.app/check#c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd: a 2.50121076 ZEC shielding linked to a 2.50106076 ZEC deshielding seven blocks later (difference = the 15,000-zatoshi fee). Verify on any explorer.
3. **(1 min)** Open `/plan`, enter Orchard → Ironwood with an odd amount (e.g. 13.37 ZEC). See the score and the ZIP-318 split with delays.
4. **(1 min)** Open `/scan`, click **Use testnet demo key**, run the scan. Open devtools → Network: the key is never sent; only compact block ranges are requested.
5. **(1 min)** SDK: `npm install https://github.com/AdityaWisnuu/leakscope/releases/download/engine-v0.1.0/leakscope-engine-0.1.0.tgz`, then run the 3-line `checkSend` from the README. Or open `/method` for every rule and check `web/public/data/evaluation.json` for the null-model numbers.
