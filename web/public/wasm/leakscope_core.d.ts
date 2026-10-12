/* tslint:disable */
/* eslint-disable */

/**
 * Viewing-key wallet scanner. Stateful: it remembers the wallet's notes so that later
 * transactions spending them are reported, so feed blocks in ascending height order.
 */
export class Scanner {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Throws on a malformed key. `uview1…` = mainnet, `uviewtest1…` = testnet.
     */
    constructor(ufvk: string);
    /**
     * Scans one protobuf-encoded lightwalletd `CompactBlock`. Returns OwnedTx[].
     */
    scanBlock(compact_block: Uint8Array): any;
    /**
     * Scans one protobuf-encoded `CompactTx` mined at `height`. Returns OwnedTx | null.
     */
    scanTx(compact_tx: Uint8Array, height: number): any;
    /**
     * "main" | "test" (compare with lightwalletd `GetLightdInfo.chainName`).
     */
    readonly network: string;
    readonly notesFound: number;
    /**
     * Shielded pools the key covers, e.g. ["sapling","orchard","ironwood"].
     */
    readonly pools: any;
}

/**
 * Public facts of a raw transaction (hex). Same output as the `leakscope-parse` binary.
 */
export function parseTxHex(raw_hex: string): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_scanner_free: (a: number, b: number) => void;
    readonly parseTxHex: (a: number, b: number) => [number, number, number];
    readonly scanner_network: (a: number) => [number, number];
    readonly scanner_new: (a: number, b: number) => [number, number, number];
    readonly scanner_notesFound: (a: number) => number;
    readonly scanner_pools: (a: number) => [number, number, number];
    readonly scanner_scanBlock: (a: number, b: number, c: number) => [number, number, number];
    readonly scanner_scanTx: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly rustsecp256k1_v0_14_context_create: (a: number) => number;
    readonly rustsecp256k1_v0_14_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_14_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_14_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
