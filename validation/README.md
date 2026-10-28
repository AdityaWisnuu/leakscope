# Validation: did we catch our own mistakes?

Leakscope's mainnet numbers rest on detectors and on a calibration (the reverse-time null model, see
[docs/FINDINGS.md §3](../docs/FINDINGS.md#3-method)). This folder holds the two pieces of ground truth we
built on 12 Oct 2026, before the mainnet run:

| | Where | What it proves |
|---|---|---|
| **Testnet** | [`testnet/`](testnet/) | Deliberate privacy mistakes, made with our own wallet on the public testnet, are flagged by the same detectors that produced the mainnet report. **Re-checked in CI on every push.** |
| **Regtest** | [`regtest/`](regtest/) | A one-command local chain (Zebra regtest, zcash-devtool, optional Zaino). We used it to confirm, transaction by transaction, which fields each kind of boundary transaction exposes. That is the threat model the detectors are built on. |

No keys, wallet phrases or wallet files are in this folder. The testnet wallets' keys stayed in the spike
workspace. Regtest wallets are generated fresh under `regtest/.data/` (gitignored) on every run.

## Testnet: each mistake and how it was caught

Transactions from [`testnet/GROUND_TRUTH.md`](testnet/GROUND_TRUTH.md), made with zingo-cli on 2026-10-12.
[`testnet/txs_4491800_4492100.jsonl`](testnet/txs_4491800_4492100.jsonl) holds the 485 public transactions
in testnet blocks 4,491,800–4,492,100, as produced by our indexer.

```sh
cd engine && bun install && cd ..
bun validation/testnet/check.ts
```

| Leak class | What we did | txids | Caught as |
|---|---|---|---|
| **Round trip** (`utxo-roundtrip`) | The faucet deshielded 0.125 TAZ to our t-address; we then shielded that exact UTXO. | `85e9872f…df46` → `1d15b95d…9bb9` | **critical**: "Re-shielded coins that had just been deshielded (0.12485 ZEC)" |
| **Exact-amount link** (`quick-roundtrip`) | Moved 0.02 from Ironwood into Sapling, then spent that note back into Ironwood 12 blocks later. The withdrawal plus its own fee equals the deposit. | `4080c7a2…b5ab` → `8225aad0…0a5f` | **high**: "matches exactly one earlier deposit (12 blocks before)" |
| **Turnstile amount** (`pool-crossing`) | The same two moves: each pool's `valueBalance` shows the exact amount crossing. | `4080c7a2…b5ab`, `8225aad0…0a5f` | **medium** ×2: "Exact amount revealed moving ironwood → sapling: 0.02 ZEC", and back |
| *Negative control* | Deshielded 0.03 to the other wallet's t-address, with no matching deposit, and paid a ZIP-321 request z→z. | `9a392e37…5ef5`, `74217a30…299a` | Not linked. No false positive. |

Expected output:

```
PASS  utxo-roundtrip   critical 85e9872f -> 1d15b95d  (faucet deshield to our t-addr, then we shielded that UTXO)
PASS  quick-roundtrip  high     4080c7a2 -> 8225aad0  (0.02 ZEC Ironwood -> Sapling, back 12 blocks later)
PASS  pool-crossing    medium   4080c7a2  (exact 0.02 ZEC turnstile amount (Ironwood -> Sapling))
PASS  pool-crossing    medium   8225aad0  (exact turnstile amount (Sapling -> Ironwood))

485 txs, 4 findings in total
```

The round trip is worth a second look. The faucet and our wallet are different owners, but the round-trip
detector links them correctly: it links coins, not people. That is why the README describes round trips as a
certain link between coins that often comes from a recipient wallet auto-shielding a payment.

To view the same transactions on an explorer, open `https://testnet.zecblock.com/tx/<txid>` with the full txids
in `GROUND_TRUTH.md`. The explorer's own `/linkability` endpoint reported nothing for the Sapling round trip,
because it only looks at t↔z flows.

The viewing-key scanner is also tested against these transactions (`indexer/test/scan-wallet.test.mjs`). That
test needs the testnet viewing keys, which are not published, so it skips in CI.

## Regtest: what each boundary transaction reveals

```sh
cd validation/regtest
./up.sh                      # first run builds zebrad 6.4.2 + zcash-devtool (~20 min), then ~15 s
source .data/ironwood/env.sh
wallet alice send --address $BOB_UA --value 100000000 --memo hi; mine 1
scripts/inspect_tx.py <txid> # the public facts of a transaction, from Zebra's getrawtransaction
./down.sh --clean
```

Profiles: `ironwood` (default, mainnet-like), `orchard` (before NU6.3), `transition` (Orchard until
height 300, then Ironwood), `nu7`. Details, timings and the bugs we hit are in
[`regtest/REPORT.md`](regtest/REPORT.md).

| Boundary | Regtest tx (local chain) | What `getrawtransaction` exposed | Detector built on it |
|---|---|---|---|
| Shield (t → pool) | `f10469bf`, `fd489d1b` | transparent inputs (address and value from the prevout) and the net amount entering the pool | `utxo-roundtrip`, `address-reuse`, deposit side of amount links |
| Deshield (pool → t) | `733ce853`, `e7c18b34` | the recipient t-address and the exact amount (0.7, 0.5) | withdrawal side of amount links |
| Pool crossing | `9ae6db4f` (transition profile, after NU6.3) | Orchard +1.0002 / Ironwood −1.0: the exact amount moved | `pool-crossing` |
| Same-pool shielded | `3c36b3d9`, `30eca6fc` | only action count, nullifiers, anchor, size, expiry and the **exact fee** | `fee-fingerprint` |

The regtest chain is disposable, so these short txids can't be looked up anywhere; `./up.sh --fresh`
reproduces equivalent transactions. Regtest confirmed the threat model. The detectors' end-to-end catches
are the testnet results above.
