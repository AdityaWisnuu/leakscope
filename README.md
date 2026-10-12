# Leakscope

Finds where Zcash transactions leak, before and after you send them.

Shielded Zcash transactions hide sender, receiver, amount and memo. But the edges of the
shielded pools are public: shielding, deshielding and moving between pools (Sapling,
Orchard, Ironwood) reveal exact amounts, addresses and timing. Leakscope models an observer
with nothing but the public chain and shows which of your transactions it can link.

- `core/` — Rust: parses raw v4–v6 transactions (incl. Ironwood) into public facts, and a
  viewing-key wallet scanner (Sapling, Orchard, Ironwood). Both compile to WASM
  (`core/build-wasm.sh` → `core/pkg-node`, `core/pkg-web`) so a user's key never leaves their machine.
- `indexer/` — Node: builds a dataset from any lightwalletd/Zaino server;
  `scan-wallet.mjs` finds a wallet's own transactions from its UFVK (`npm test` validates it).
- `engine/` — TypeScript: leak detectors and scoring (Node + browser).
- `web/` — the interactive UI.

Status: work in progress for ZECATHON 2026.
