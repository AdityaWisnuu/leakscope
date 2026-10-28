# ZECATHON 2026 submission: Leakscope

Ready-to-paste text for the submission form.

## Project name

Leakscope

## Tagline (≤100 characters)

A privacy linter for Zcash: see what your transactions leak at pool boundaries, before you send.

## Short description (~50 words)

Leakscope models an observer who has only the public Zcash chain and shows what they can link at pool boundaries: shielding, deshielding and pool crossings. On 75.6 days of post-Ironwood mainnet it links 24.6% of deshielding transactions, with precision measured by a reverse-time null model. It also plans safer transactions and scans wallets locally.

## Long description (~300 words)

Shielded Zcash hides sender, receiver and amount, but the edges of the pools are public. Shielding, deshielding and moving between Sapling, Orchard and Ironwood put exact amounts, addresses and timing on chain. Since NU6.3 froze Orchard, every Orchard holder has to cross one of these boundaries. Leakscope measures what that reveals and helps people stop leaking.

We indexed mainnet from Ironwood activation (block 3,428,143) for 75.6 days: 584,497 transactions after a 30-day warm-up. An observer with only the public chain can link 24.6% of deshielding transactions (20,343 of 82,581): 5,128 by exact-amount matches back to their deposit, and the rest by round trips that re-shield the very coins just deshielded. We did not assume precision, we measured it. Running the same matching rule against deposits made *after* each withdrawal can only find coincidences, which estimates the false-link rate on the chain's real amount distribution. The fastest tier scored 2,535 links against 1 coincidence (≈99%). The naive rule was wrong about half the time, so rules that failed the test were dropped. Our own deliberate testnet mistakes were caught, and mainnet examples were spot-checked on an independent explorer.

Leakscope is a working toolchain:
- **Observatory**: the state of boundary privacy since Ironwood, with linked pairs and examples.
- **Check**: what any transaction reveals. The txid stays in the URL fragment and only a 1/256 shard is fetched.
- **Plan**: pre-flight scoring of a move by the crowd its amount hides in, plus a ZIP-318 denomination split with randomized delays.
- **Scan**: a Rust viewing-key scanner compiled to WASM (~281 KB brotli) finds your own leaks in the browser. The key never leaves the tab.

Everything is open, static and reproducible, with a CLI (`leakscope check | plan | scan`) and a TypeScript engine that wallets can embed.

## Suggested track(s)

- **Primary: Core & Tooling.** Developer and user tooling: a parser, a WASM wallet scanner, a detector engine, a CLI and a pre-flight checker for wallets.
- **Grand Prize candidacy.** It turns the judging criterion "leaks are disqualifying" into a product, with original mainnet research behind it.
- Alternative fits: **Wildcard** (privacy research / observatory); **Shielded Payments** (pre-flight checks for payment flows that touch transparent addresses); **Cross-Chain** (the same boundary analysis applies to transparent deposit addresses used by bridges and swaps).

## What's novel

- **Measured, not asserted, precision.** A reverse-time null model gives a false-link rate for every rule on real chain data; rules that fail it are not reported.
- **First post-Ironwood measurement** of boundary privacy: deshield linkability, round trips by pool path, and the 3.27M ZEC Orchard→Ironwood migration (74% in standard ZIP-318 denominations).
- **Exact-fee matching.** A deposit matches a withdrawal only if it equals the amount plus that withdrawal's own public fee, which pins whole-note withdrawals to one value.
- **Client-side everything.** Viewing-key scanning in WASM in the browser, sharded lookups that hide which transaction you checked, and a static site with no backend or analytics.
- **Ground truth.** Each leak class reproduced on regtest and on testnet with our own wallet, and caught by the same pipeline.

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

## Team

- Adit ([@AdityaWisnuu](https://github.com/AdityaWisnuu)): design, research and implementation.

## How judges can evaluate in 5 minutes

1. **(1 min)** Open https://leakscope-cyan.vercel.app. Read the headline number and the linked pairs on the observatory.
2. **(1 min)** Open https://leakscope-cyan.vercel.app/check#c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd: a 2.50121076 ZEC shielding linked to a 2.50106076 ZEC deshielding seven blocks later (difference = the 15,000-zatoshi fee). Verify on any explorer.
3. **(1 min)** Open `/plan`, enter Orchard → Ironwood with an odd amount (e.g. 13.37 ZEC). See the score and the ZIP-318 split with delays.
4. **(1 min)** Open `/scan`, click **Use testnet demo key**, run the scan. Open devtools → Network: the key is never sent; only compact block ranges are requested.
5. **(1 min)** Open `/method` for every rule and the validation; check `engine/scripts/evaluate.ts` and `web/public/data/evaluation.json` for the null-model numbers. Optional: follow the README's Reproduce section.
