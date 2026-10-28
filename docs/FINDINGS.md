# State of Zcash boundary privacy after Ironwood

*Leakscope research note · mainnet blocks 3,428,143–3,515,250 (28 July – 12 October 2026) · data generated 2026-10-12*

## Summary

Shielded Zcash works: inside a pool, sender, receiver and amount are hidden. But money has to enter and leave, and since NU6.3 froze Orchard it also has to move between pools. Those boundaries are public. We indexed the first 75.6 days of Ironwood and asked one question: what can an observer with nothing but the public chain link?

- **24.6% of deshielding transactions (20,343 of 82,581)** are linked.[^counts]
  - **5,128 (6.2%) backwards to their deposit**, by exact amount plus the withdrawal's own public fee. These links are **calibrated**: the fast tier was measured at ≈99% precision with a reverse-time null model (2,535 links vs 1 coincidence).
  - **15,215 (18.4%) forwards by round trips**: the deshielded output was spent straight back into a pool. The link between the coins is certain, but it need not be the same person. Often a payment to a transparent address is auto-shielded by the recipient's wallet (§4.2).
- There are **15,668 round-trip findings** (one per re-shielding transaction). Almost half of them (7,370) happened within 10 blocks.
- **3.27M ZEC** of Orchard→Ironwood migration amounts are public. Most migrations did the right thing (74% standard ZIP-318 denominations), but 3,763 used amounts that were unique in their window.

None of this breaks cryptography. It is what the transaction format reveals by design at the edges, measured.

[^counts]: Counts are per deshielding transaction. The amount-link tier counts in §4.1 (4,813 + 406 + 20 = 5,239) count links, and a deshielding with several transparent outputs can carry more than one, so they cover 5,128 distinct deshieldings. The 15,668 round-trip findings are one per re-shielding transaction. Some deshieldings are re-shielded more than once or are already amount-linked; 15,215 is the number linked *only* by a round trip. 5,128 + 15,215 = 20,343.

## Prior work

Round-trip linkage in Zcash was measured before Sapling existed. Quesnelle, ["On the linkability of Zcash transactions"](https://arxiv.org/abs/1712.01210) (arXiv:1712.01210, 2017), linked 31.5% of coins sent into the shielded pool by matching round trips of roughly equal value. Kappos, Yousaf, Maller and Meiklejohn, ["An Empirical Analysis of Anonymity in Zcash"](https://www.usenix.org/conference/usenixsecurity18/presentation/kappos) (USENIX Security 2018), used similar usage-pattern heuristics, together with founder and miner behaviour, to shrink the effective anonymity set of the shielded pool. Both studied the Sprout era.

This note measures the same boundary after NU6.3 (Ironwood). It adds a measured false-link rate for every rule (the reverse-time null model, §3), exact-fee matching, and the pool-crossing analysis that NU6.3 made central: the Orchard→Ironwood turnstile and the Orchard→t→Ironwood path.

## Responsible publication

Every number and example here is computed from public chain data that any full node sees. We publish aggregate statistics plus illustrative examples. We add no off-chain identity data: no exchange records, KYC, IP addresses or attribution of addresses to owners. The point is to show wallet developers which defaults cause links, so they can change them.

## 1. Threat model

The observer runs a full node or reads a block explorer. For each transaction they see height and time, transparent inputs and outputs (addresses and values), the number of Sapling spends/outputs and Orchard/Ironwood actions, the fee, and each shielded pool's value balance (the net amount entering or leaving it). They cannot see shielded senders, recipients, amounts or memos. They have unlimited patience and no off-chain data.

Three moves put an exact amount on chain. We call each a **boundary event**:

1. **Shielding** (t → pool): transparent inputs and the net value entering the pool.
2. **Deshielding** (pool → t): each transparent output, its address and value.
3. **Pool crossing** (the turnstile): one pool's balance falls by exactly what another's rises. Since NU6.3 (block 3,428,143) Orchard is withdraw-only, so every Orchard holder crosses a boundary at least once.

## 2. Data

| | |
|---|---|
| Range | blocks 3,428,143–3,515,250 (87,108 blocks, 75.6 days) |
| Warm-up | 34,560 blocks (30 days) before activation, so early withdrawals see full history |
| Transactions | 584,497 |
| Boundary events | 241,314 |
| Shielding txs | 84,131 |
| Deshielding txs | 82,581 |
| Source | public lightwalletd servers, parsed by our own Rust transaction parser |

## 3. Method

**Detectors.** Two are deterministic: they follow the actual coins.

- *Round trip* (`utxo-roundtrip`, critical): a shielding spends a transparent output created by an earlier deshielding.
- *Address reuse* (`address-reuse`, high): a shielding comes from an address that earlier received a deshielding.

Two are probabilistic:

- *Amount link* (`quick-roundtrip`, `amount-link`): a candidate deposit for a withdrawal is an earlier boundary event into the same pool the withdrawal leaves, whose amount equals the withdrawal **plus that withdrawal's own fee**. The fee is public, so this pins the match to one exact value: it is what you see when someone withdraws a whole note they deposited. The number of candidates is the anonymity set; a set of 1 means the observer has exactly one guess.
- *Pool crossing*: every turnstile move, scored by how many same-amount moves happened within the window.

And one weak signal: *fee fingerprint*, a fee that differs from the ZIP-317 conventional fee for the transaction's shape (5,011 cases).

**Calibration with a reverse-time null model.** A unique amount match can still be a coincidence. To measure how often, we run the exact same rule backwards: against deposits made *after* each withdrawal. Money cannot leave before it arrives, so every backward match is a coincidence, and it occurs at the same rate as coincidences among forward matches. This estimates the false-discovery rate on the chain's real amount distribution rather than on a model of it. We only evaluate withdrawals whose reverse window lies entirely inside the data, so both directions see the same amount of chain.

Estimated false links by window (unique match, exact-fee rule):

| Withdrawals | Window | Forward unique | Reverse unique | Est. false links |
|---|---|---|---|---|
| all | 100 blocks | 5,586 | 356 | 6.4% |
| all | 1 day | 6,626 | 1,485 | 22.4% |
| all | 7 days | 8,876 | 4,283 | 48.3% |
| all | 30 days | 4,133 | 2,284 | 55.3% |
| non-round | 100 blocks | 5,440 | 256 | 4.7% |
| non-round | 1 day | 5,839 | 747 | 12.8% |
| round (0.001 ZEC multiples) | 10 blocks | 48 | 6 | 12.5% |
| round (0.001 ZEC multiples) | 100 blocks | 146 | 100 | 68.5% |
| round (0.001 ZEC multiples) | 1 day | 787 | 738 | 93.8% |

The naive rule, "the only matching deposit in 30 days", is about a coin flip. That is why we calibrated. Applying the detector's own decision (unique within 30 days, then tiered by delay):

| Tier | Links | Coincidences | Measured precision | We state |
|---|---|---|---|---|
| non-round, ≤100 blocks | 2,535 | 1 | 100.0% | ≈99% |
| non-round, ≤1 day | 128 | 19 | 85.2% | ≈85% |
| round, ≤10 blocks | 13 | 0 | 100.0% | ≈90% (small sample) |

Unique non-round matches more than a day apart produced more coincidences than links (603 vs 447), so they are **not reported at all**. Neither are round amounts more than 10 blocks apart.

The window table above counts every withdrawal whose match is unique within that window. The tier table applies the detector's own decision (unique within 30 days, then tiered by delay), which is stricter. That is why round amounts within 10 blocks show 12.5% false links above (48 vs 6) but 13 links and 0 coincidences here.

**Ground truth** ([`validation/`](../validation/)). On testnet we made deliberate mistakes with our own wallet and ran the same detectors over those blocks. A round trip (`85e9872f…` → `1d15b95d…`) was flagged critical, a quick round trip (`4080c7a2…` → `8225aad0…`) high, and both exact-amount pool crossings medium. `bun validation/testnet/check.ts` reproduces this, and CI runs it on every push. On a local regtest chain (`validation/regtest/up.sh`) we reproduced what each kind of boundary transaction reveals: shield, deshield, pool crossing and fee. On mainnet we spot-checked findings against an independent explorer (zecblock.com).

## 4. Results

### 4.1 Deshielding linkability

| | Count | Share of deshields |
|---|---|---|
| Deshielding transactions | 82,581 | 100% |
| Linked backwards by calibrated amount link | 5,128 | 6.2% |
| Linked forwards by round trip (additional) | 15,215 | 18.4% |
| **Linked either way** | **20,343** | **24.6%** |

Amount links by tier, over the full range:

| Tier | Links | Precision |
|---|---|---|
| non-round amount, within 100 blocks | 4,813 | ≈99% |
| non-round amount, within a day | 406 | ≈85% |
| round amount, within 10 blocks | 20 | ≈90% |

### 4.2 Round trips

15,668 shieldings spent a transparent output created by an earlier deshielding. One shielding can spend outputs sent to several addresses, so these findings involve 17,326 distinct addresses; the most frequent address accounts for only 0.3%. This is not one actor: it is common wallet behaviour. 7,370 (47%) re-entered a pool within 10 blocks.

What is certain is the coin link: the deshielding and the re-shielding share a transparent output, so anyone can follow the coins out and back in. It is not proof that one person did both. A very plausible cause, especially for the fast ironwood → t → ironwood hops, is a payment to a transparent receiver whose wallet automatically shields incoming funds. Our own testnet ground truth has exactly this shape: a faucet paid our t-address and our wallet shielded it. For the payer, the result is the same either way: the recipient's shielding ties their withdrawal to a later shielded deposit.

| Path | Round trips | ZEC |
|---|---|---|
| ironwood → t → ironwood | 14,729 | ~96,440 |
| orchard → t → ironwood | 756 | ~101,348 |
| sapling → t → ironwood | 145 | ~3,219 |
| ironwood → t → sapling | 22 | ~226 |
| sapling → t → sapling | 10 | ~282 |
| orchard → t → sapling | 6 | ~74 |

The orchard → t → ironwood path stands out: 756 transactions moved ~101k ZEC out of frozen Orchard via a transparent hop instead of the turnstile, publishing an address as well as the amount.

### 4.3 Address reuse

16,510 shieldings came from an address that had earlier received a deshielding, across 1,442 addresses. **66.3% of these come from a single address**, very likely a service (exchange, pool or bridge) rather than an individual, so this number says more about one operator than about users in general.

### 4.4 Orchard → Ironwood migrations

| | |
|---|---|
| Migration transactions | 24,725 |
| ZEC moved (and therefore revealed) | ~3,268,327 |
| Standard ZIP-318 denominations | 18,389 (74%) |
| Amounts unique in their window | 3,763 |

Pool-crossing findings overall: 31,842 (unique → medium, ≤10 same-amount moves → low, otherwise info).

### 4.5 Examples (verifiable on any explorer)

**Exact-amount link, 7 blocks apart.** [`c6b771a7…`](https://leakscope-cyan.vercel.app/check#c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd) shielded 2.50121076 ZEC into Sapling at block 3,428,153. Seven blocks later [`57d7d945…`](https://leakscope-cyan.vercel.app/check#57d7d945f70c88853f800519dd3d2b8a2fd8cff990aa02e16e8f81472e34fe3d) deshielded 2.50106076 ZEC from Sapling: the same amount minus its own 15,000-zatoshi fee, with no other candidate in the window.

**Round trip in one block.** [`28534e9f…`](https://leakscope-cyan.vercel.app/check#28534e9fca9fed194359c042db5f4cdad3a0772115ba163ea85ed1931e7731eb) deshielded 7 ZEC from Orchard to a transparent address at block 3,428,291; [`485926df…`](https://leakscope-cyan.vercel.app/check#485926df8278e0a9407a1d641aecb24726fd13327179d4efff659cbfc2b2b565), in the same block, spent that output into Ironwood (6.99985 ZEC after the fee). The coins on both shielded sides are now linked, and the address is on record.

**Large round trip.** `bb6f212a…` → `8f5d8309…` (around block 3,456,672) re-shielded 67,532.03 ZEC that had just been deshielded through a single transparent address.

Full txids: `web/public/data/examples.json` and `links.json`.

## 5. Caveats

- **Probabilistic links.** An anonymity set of 1 means no other deposit fits, not proof. Precision figures are null-model estimates, measured on the part of the range where a full reverse window exists; the full-range tier counts (4,813 / 406 / 20) are larger than the calibration sample.
- **Lower bound.** A real adversary adds network metadata (light-wallet servers see IPs), wallet fingerprints and off-chain data such as exchange KYC. We use none.
- **Services.** Exchanges and other custodians batch users. A link may connect a user to a service rather than to a person, and one service dominates address reuse.
- **Fee coverage.** Exact-fee matching requires every input value to be known; otherwise a looser ZIP-317 fee-gap rule is used.
- **Scope.** Fully shielded transactions are counted but not analysed beyond existence, timing and shape. Arity and timing fingerprints inside the pools are future work.
- **Round trips are coin links.** They show that the same coins left and re-entered, not that the same person moved them (§4.2).
- **Range edges.** The 30-day warm-up removes the early-range bias; the late edge limits how many withdrawals could be calibrated.

## 6. Recommendations

**For users**

1. **Never deshield and re-shield the same coins.** A pool → t → pool hop links the coins on both shielded sides deterministically. To move between pools, cross the turnstile directly, not through a transparent address.
2. **Don't withdraw the exact note you deposited, soon after.** Within 100 blocks a unique amount is a ≈99% link. Beyond a day our matching no longer beats chance, and spending only part of a note avoids the exact match altogether.
3. **Use a fresh transparent address** for every deshielding, and never shield from an address that received a deshielding.
4. **Migrate out of Orchard in standard denominations** ({1, 2, 5} × 10^k ZEC), spread over time. Leakscope's `/plan` page generates such a schedule locally.
5. **Check before you send.** `/plan` scores a planned move by the crowd it would hide in.

**For wallet developers**

1. **Refuse or warn on round trips**: a shielding that would spend a UTXO created by a deshielding.
2. **Default to ZIP-318 denominations and randomized delays** for pool migrations. Our planner splits into {1, 2, 5} × 10^k pieces, shuffles them, aligns the start to a 144-block bucket and spaces them with exponential delays (mean 66 blocks).
3. **Rotate transparent addresses** and never auto-shield from an address that received a deshielding. Auto-shielding a payment that came straight out of a pool completes a round trip for the payer.
4. **Use the ZIP-317 conventional fee** so the fee is not a fingerprint.
5. **Integrate pre-flight.** `@leakscope/engine` ([0.1.0 release](https://github.com/AdityaWisnuu/leakscope/releases/tag/engine-v0.1.0)) runs in the browser and Node; the same detectors that produced this report can lint a transaction before broadcast.

## 7. Reproducibility

Everything here comes from public chain data and open code. Index blocks 3,393,583–3,515,250 with `indexer/index-all.sh`, generate the report with `engine/scripts/report.ts --report-from 3428143`, and rerun the null model with `engine/scripts/evaluate.ts --report-from 3428143 --json evaluation.json`. Exact commands are in the [README](../README.md#reproduce). The published outputs (`summary.json`, `evaluation.json`, `examples.json`, `links.json`, sharded findings) are in `web/public/data/` and browsable at https://leakscope-cyan.vercel.app.
