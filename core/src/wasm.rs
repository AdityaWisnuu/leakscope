//! JavaScript bindings (browser and Node). Build with `--features wasm`.
//!
//! Everything runs locally: the viewing key passed to `new Scanner(ufvk)` stays inside
//! this WASM instance and is never sent anywhere.

use serde::Serialize;
use wasm_bindgen::prelude::*;

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsError> {
    // Plain objects (not Maps), `null` for None, numbers for u64 (values fit in 2^53).
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Public facts of a raw transaction (hex). Same output as the `leakscope-parse` binary.
#[wasm_bindgen(js_name = parseTxHex)]
pub fn parse_tx_hex(raw_hex: &str) -> Result<JsValue, JsError> {
    to_js(&crate::parse_hex(raw_hex).map_err(|e| JsError::new(&e))?)
}

/// Viewing-key wallet scanner. Stateful: it remembers the wallet's notes so that later
/// transactions spending them are reported, so feed blocks in ascending height order.
#[wasm_bindgen]
pub struct Scanner(crate::scan::Scanner);

#[wasm_bindgen]
impl Scanner {
    /// Throws on a malformed key. `uview1…` = mainnet, `uviewtest1…` = testnet.
    #[wasm_bindgen(constructor)]
    pub fn new(ufvk: &str) -> Result<Scanner, JsError> {
        crate::scan::Scanner::new(ufvk).map(Scanner).map_err(|e| JsError::new(&e))
    }

    /// "main" | "test" (compare with lightwalletd `GetLightdInfo.chainName`).
    #[wasm_bindgen(getter)]
    pub fn network(&self) -> String {
        self.0.network().into()
    }

    /// Shielded pools the key covers, e.g. ["sapling","orchard","ironwood"].
    #[wasm_bindgen(getter)]
    pub fn pools(&self) -> Result<JsValue, JsError> {
        to_js(&self.0.pools())
    }

    #[wasm_bindgen(getter, js_name = notesFound)]
    pub fn notes_found(&self) -> usize {
        self.0.notes_found()
    }

    /// Scans one protobuf-encoded lightwalletd `CompactBlock`. Returns OwnedTx[].
    #[wasm_bindgen(js_name = scanBlock)]
    pub fn scan_block(&mut self, compact_block: &[u8]) -> Result<JsValue, JsError> {
        to_js(&self.0.scan_block_bytes(compact_block).map_err(|e| JsError::new(&e))?)
    }

    /// Scans one protobuf-encoded `CompactTx` mined at `height`. Returns OwnedTx | null.
    #[wasm_bindgen(js_name = scanTx)]
    pub fn scan_tx(&mut self, compact_tx: &[u8], height: u32) -> Result<JsValue, JsError> {
        to_js(&self.0.scan_tx_bytes(compact_tx, height).map_err(|e| JsError::new(&e))?)
    }
}
