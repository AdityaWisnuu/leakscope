# Local regtest chain: lab notebook

Date: 2026-10-12. English translation of the spike notebook (the original was written in Indonesian). The chain
is local and disposable, so the txid prefixes below can't be looked up anywhere. `./up.sh --fresh` rebuilds
an equivalent chain from scratch.

## Summary
`./up.sh` starts a local chain from a clean state with two funded wallets in about 15 seconds. `./down.sh`
stops it (`--clean` deletes all data). The first run builds the tools, which takes about 20 minutes.

Stack:
- zebrad 6.4.2 (native, no Docker; regtest plus Zebra's built-in light-wallet gRPC)
- zcash-devtool (`regtest_support`)
- Optional: Zaino 0.10.2 (`--indexer zaino`)

```bash
./up.sh && source .data/ironwood/env.sh
wallet alice send --address $BOB_UA --value 100000000 --memo hi; mine 1
./down.sh
```

Profiles:
- `ironwood` (default)
- `orchard`
- `transition` (Orchard until height 300, then Ironwood)
- `nu7`, with `ZEBRAD=$PWD/.tools7/bin/zebrad`

## 1. Versions
- **zebrad**
  - 6.4.2 stable.
  - 7.0.0-rc.0: NU7 on Testnet at height 4,465,026, branch 0x77190AD9.
  - Prebuilt binaries for Linux only.
- **zainod**: 0.10.2.
- **zcash-devtool**: main@5a26ee8 (zcash_protocol 0.10.5). NU7 is only available behind an unstable flag.
- **Thus Spoke Zakura**: @d80bd85.
- **Zebra constants, mainnet**:
  - NU6.1 at 3,146,400; NU6.2 at 3,364,600; NU6.3 (Ironwood) at 3,428,143.
  - A temporary soft fork disabled Orchard at 3,363,426. NU6.2 lifted it.
- **Zebra constants, testnet**: NU6.3 at 4,134,000.
- **NU6.3 rules** (`zebra-consensus check.rs`):
  - Orchard `enableCrossAddress` must be 0.
  - Orchard `valueBalance` must be ≥ 0.
  - Coinbase may not contain Orchard actions.
- **The code has no NU7 height for mainnet yet.** The "5 Nov" date is unconfirmed.

## 2. Build
| Component | Time | Binary | Target dir |
|---|---|---|---|
| zebrad 6.4.2 | 11m46s | 98 MB | 2.2 GB |
| devtool | 7m07s | 90 MB | 1.4 GB |
| zainod | 15m26s (RocksDB) | 34 MB | 1.5 GB |
| zebrad 7 | 3m12s (cached) | 98 MB | — |
| ths-server | 5m02s | 66 MB | 920 MB |

There were no build errors. The build needs protoc and libclang; Xcode's clang is enough.

## 3. Config and mining
- **zebrad config**:
  - `network="Regtest"`
  - `cache_dir=false` (otherwise Zebra writes a peer cache to ~/Library)
  - Activation heights go in `[network.testnet_parameters.activation_heights]`: upgrades before NU5 at 1, NU5 through NU6.3 at 2.
  - `[rpc]`: port 18232, `enable_cookie_auth=false`, indexer 8230, lightwalletd 9067.
- **Subsidy**:
  - 6.25 ZEC per block, halving every 288 blocks, exhausted after about 10k blocks. That caps a chain at about 3,600 ZEC, so fund wallets early.
  - NU7 divides the subsidy by 3.
- **Timestamps** stay around 2011, and the chain reports its name as `"test"`.

## 4. Coins
- Coinbase paid to a t-addr needs 100 confirmations before it can be spent.
- Coinbase paid to a UA goes straight into a shielded pool: Ironwood after NU6.3, Orchard before.
- Regtest lets transparent coinbase be spent without shielding it first.
- `up.sh` funds wallets with transparent coinbase and then shields it (see bug B2).

## 5. Transactions
| # | Profile | Tx | Result | Fee | Time |
|---|---|---|---|---|---|
| 1 | ironwood | Ironwood coinbase `8156cf8b` | v6, 1 action, vb −6.25 | — | mined in 10.7 s |
| 2 | ironwood | Iw→Iw with memo `3c36b3d9` | bob and bob-view (UFVK only) both see the value and the memo | 0.00015 | 16.7 s |
| 3 | ironwood | Shield `fd489d1b` | 2 t-inputs | 0.0002 | 11.4 s |
| 4 | ironwood (up.sh) | Shield `f10469bf` | 4 UTXOs, vb −24.9996 | 0.0004 | ~6 s |
| 5 | ironwood (up.sh) | Iw→Iw with memo `30eca6fc` | 2 actions, 9,166 B; detected with the viewing key | 0.0001 | 11.4 s |
| 6 | ironwood (up.sh) | Deshield `733ce853` | t-output of 0.7 is public | 0.00015 | 12.1 s |
| 7 | transition, before 300 | Orchard→Orchard with memo `59b969dc` | v5, 4 actions | 0.0002 | 13.5 s |
| 8 | transition, after 300 | Payment from an Orchard note `9ae6db4f` | Orchard +1.0002 / Ironwood −1.0, so **the amount leaks** | 0.0002 | 18.4 s |
| 9 | transition, after 300 | Orchard→t `e7c18b34` | t-output of 0.5 | 0.00015 | 10.3 s |
| 10 | orchard | Orchard→Orchard with memo `ed4df479` | view sync plus memo in 0.75 s | 0.0001 | 9.9 s |
| 11 | zaino | Payment `507a212e` | memo "via zaino" detected | — | 3.2 s |
| 12 | nu7 | Coinbase after NU7 | Ironwood, vb −1.04166666 | — | 2.45 s |
| 13 | nu7 | devtool send after NU7 | **REJECTED**: wrong branch id | — | — |
| 14 | ths-native | Faucet `36cc3db2` + send `aacc24f4` | v6 Ironwood, 2 actions | 0.0001 | 0.63 s including mining |

Memos are not in compact blocks. A wallet has to `enhance` (fetch the full transaction), and that leaks the
txid to the server.

## 6. What is visible on-chain (from `getrawtransaction`, see `scripts/inspect_tx.py`)
| Tx type | Public | Hidden |
|---|---|---|
| Shielded, same pool | Number of actions, one nullifier per action (real and dummy look the same), anchor, exact fee, size, expiry | Sender, receiver, amount, memo |
| Shield | t-inputs (address and value are looked up from the prevout) plus the net amount | Receiver |
| Deshield | Receiving t-addr plus amount | Which note paid |
| Shielded coinbase | Amount | Receiver; Zebra fills in a random 512-byte memo |
| Cross-pool | **The exact amount** that moves | Receiver, memo |
| Light-wallet server | Txids fetched for memos, t-addr queries, IP | — |

Compact block contents per action: `{nullifier, cmx, ephemeralKey, 52-byte ciphertext}`. A wallet's fee
choice becomes a fingerprint.

## 7. Scripts
- `up.sh`: options `--profile`, `--fresh`, `--indexer`, `--wallets`, `FUNDING`, and a `ZEBRAD` override.
- `down.sh`: `--clean` deletes all data.
- `config/heights-*.toml`: shared by Zebra and devtool.
- `scripts/inspect_tx.py`: prints what a transaction reveals.
- `scripts/ths-native.sh`: runs Thus Spoke Zakura without Docker.
- Helpers in `env.sh`: `zrpc`, `mine`, `wallet`, `viewwallet`.

Wallet keys are generated locally under `.data/` on every fresh run and never leave the machine. None are in
this repository.

Test runs:
| Run | Time |
|---|---|
| Clean, default profile | 15 s |
| orchard | 44 s (CPU busy with other processes) |
| transition | 26 s |
| zaino | 28 s |
| nu7 | 14 s |
| Resume | 1.6 s |

## 8. Bugs found
| ID | Bug | Workaround |
|---|---|---|
| B1 | Zebra's gRPC rejects a block id of height 0, so a wallet birthday of 1 fails | Birthday 2 |
| B2 | Zebra's random coinbase memo makes devtool `list-tx` fail with "Invalid UTF-8" | Fund by shielding |
| B3 | devtool `init` reads its wallet phrase from a non-TTY stdin and hangs (about 45 minutes were lost before we realised it wasn't a Zaino/Zebra 7 bug) | `</dev/null` |
| B4 | devtool `init-fvk` ignores the chain's activation heights | `viewwallet` rewrites them |
| B5 | devtool doesn't support NU7 | None |
| B6 | Zaino reports the tip from Zebra but serves blocks from its own lagging index, so after a mining burst the wallet sees a stale tip | `wait_indexer` |
| B7 | Zaino has no gRPC reflection; `generate-config` writes to ~/.config | Use the proto files and `-o` |
| B8 | Zebra cosmetics: chain name "test", a nonsense estimated height, a peer cache in ~/Library | `cache_dir=false` |
| B9 | The docs skip the easy path (`generate`, `generatetoaddress`, built-in gRPC) | — |
| B10 | The stock Python 3.9 has no `tomllib` | Manual parsing |

## 9. Thus Spoke Zakura, natively
Its Docker setup contains:
- zakurad
- lightwalletd (Go)
- ths-server (Rust): 5 accounts plus a treasury, auto-mining, a faucet (5 ZEC max), send with memo, an explorer and a REST `/api/v1`
- a React UI

Natively, zebrad 6.4.2 accepts its config after 3 edits, and Zebra's built-in gRPC replaces lightwalletd.
It starts in 5 s and sends in 0.63 s. It doesn't support NU7.
