# Testnet ground truth: our own wallet, our own mistakes

Excerpt from the spike notebook of 2026-10-12 (10:59–11:52 UTC). It covers only what is needed to check
Leakscope's findings. Keys, wallet phrases and wallet files were never committed. Everything here is public
testnet data (TAZ, no value).

- **Wallets:** zingo-cli (zingolib `dev` @dd7c80a), built with `--no-default-features --features
  nakednet-test-mode`. zcash-devtool `main` @5a26ee8 could sync but not broadcast on testnet, because the node
  rejected it with `incorrect consensus branch id` (NU7, branch `0x77190ad9`, is active on testnet).
- **Server:** `testnet.zec.rocks:443` (lightwalletd v0.5.4).
- **Funding:** the Valar faucet (`faucet.testnet.valargroup.dev`), 0.125 TAZ, paid to a transparent address on
  purpose so that shielding could be tested.
- **Anonymity set:** 67 non-coinbase transactions in 100 blocks, 7 of them ours. Testnet crowds are tiny.

## Transactions

Fees were checked against ZIP-317 (`5000 × max(2, logical_actions)`). Every fee matched exactly.

| # | What | txid | Fee (zat) | Block |
|---|---|---|---|---|
| 0 | Faucet → our t-addr `tmNUA38u…` (Ironwood → t, a deshield) | `85e9872f6584ca79f3d7ac22f1d8aacaa5207966a49dc954bcc3d1a1f102df46` | 15000 | 4491970 |
| a | **Shield** that same UTXO, t → Ironwood | `1d15b95d399d66ce544e69e4a1e986563c9b47d84caaed7a0e4e95c1a7b19bb9` | 15000 | 4492028 |
| b | Ironwood → Ironwood with memo, 0.01 | `1b5d6271ca3919705b36d528abca384f91e5b44a786bdb2a31d6de5b3be24bbd` | 10000 | 4492032 |
| c1 | **Ironwood → Sapling**, 0.02, memo | `4080c7a2fb75d7197fa96ae69d4c4d9a5249a8f41b9a22bb419dca9ed340b5ab` | 20000 | 4492044 |
| d | Deshield Ironwood → t, 0.03 | `9a392e377b62cac9cba5dfa5b4c888d8ef0bb7fe315e81416e003773d9125ef5` | 15000 | 4492051 |
| c2 | **Sapling + Ironwood → Ironwood**, 0.025, memo (spends the c1 note) | `8225aad03341b047d2a5963ee743e25463d2c36a42aed47bb2ea24a014b90a5f` | 20000 | 4492056 |
| f | ZIP-321 request paid, 0.0123, memo "Invoice #42 ZECATHON" | `74217a30af4aa9611606c35d13daf8e25de9a12ad417a382874dab6f05ab299a` | 10000 | 4492062 |

Explorer: `https://testnet.zecblock.com/tx/<txid>`, or the JSON API at
`https://api.testnet.zecblock.com/v1/transactions/<txid>`.

## What anyone could see (from the explorer API)

| Tx | Visible to everyone | Hidden |
|---|---|---|
| 0 faucet | Recipient t-addr and the amount 0.125. `valueBalanceIronwood +12515000`, so the amount leaving the shielded pool is public. | Sender inside Ironwood |
| a shield | **Input t-addr and its 0.125 UTXO**, which is the faucet's output. `valueBalanceIronwood −12485000`. | Which Ironwood note now holds it |
| b z→z | `ironwoodActions: 2`, `valueBalance = fee`, size 9166 B. Nothing else. | Sender, receiver, amount, memo |
| c1 Ironwood→Sapling | **`valueBalanceSapling −2000000`, `valueBalanceIronwood +2020000`**: the exact amount crossing between pools leaks. | Addresses, memo |
| c2 Sapling→Ironwood | **`valueBalanceSapling +2000000`**: exactly the 2,000,000 that entered Sapling 12 blocks earlier. With about 67 transactions per 100 blocks, the round trip is trivially linkable by amount and timing. The explorer's own `/linkability` endpoint reported "no shielding or deshielding activity" for both, so it ignores pool-to-pool turnstile flows. | Addresses |
| d deshield | **Recipient t-addr and the amount 0.03.** | The shielded sender |
| f z→z | Same as b | Everything |

All of these were v6 transactions with `orchardActions: 0`. Payments to Orchard receivers land in Ironwood
after NU6.3.

## Viewing-key detection

Watching with only bob's UFVK, zingo-cli saw the ZIP-321 payment (f) in the mempool, memo included, about
20 s after broadcast. It also saw bob's outgoing transaction c2 and his t-address receipt from d. Neither
zingo-cli nor zcash-devtool accepted an incoming-only UIVK. Leakscope's own WASM scanner
(`indexer/test/scan-wallet.test.mjs`) is checked against these transactions when the testnet viewing keys
are available locally. The keys are not in this repository, so that test skips in CI.
