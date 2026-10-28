// Viewing-key wallet scan, entirely in the browser.
//
// The viewing key is handed to the WASM scanner (core/, built with `--features wasm`) and
// never leaves this tab. Compact blocks come from a public lightwalletd gRPC-web proxy; the
// only thing that proxy learns is which block range was requested.
import { compactBlocks, latestHeight } from './grpcweb';

export type Network = 'main' | 'test';

export const PROXIES: Record<Network, string> = {
  main: 'https://zcash-mainnet.chainsafe.dev',
  test: 'https://zcash-testnet.chainsafe.dev',
};

export interface ScanProgress {
  height: number;
  from: number;
  to: number;
  notes: number;
  txs: number;
}

/** Mirrors core/src/scan.rs `OwnedTx` as serialized by serde-wasm-bindgen. */
export interface OwnedTx {
  txid: string;
  height: number;
  tx_index: number;
  received: { pool: string; scope: 'external' | 'internal'; value: number; index: number }[];
  spent: { pool: string; scope: 'external' | 'internal'; value: number; note_txid: string }[];
}

export interface ScanResult {
  txids: string[];
  owned: OwnedTx[];
  network: Network;
  pools: string[];
}

/** The scanner contract the UI depends on. Swap implementations freely. */
export type ScanWallet = (
  ufvk: string,
  from: number,
  to: number | 'tip',
  onProgress: (p: ScanProgress) => void,
  signal?: AbortSignal,
) => Promise<ScanResult>;

// ─────────────────────────────────────────────────────────────────────────────────────────
// WASM HOOK — the scanner from core/ (core/src/wasm.rs), built by core/build-wasm.sh.
// web/public/wasm/ holds a committed copy of core/pkg-web so hosted builds need no Rust:
//   core/build-wasm.sh && cp core/pkg-web/leakscope_core{.js,_bg.wasm,.d.ts} web/public/wasm/
// It is loaded at runtime from /wasm/, so the Next build never bundles or resolves it.
// ─────────────────────────────────────────────────────────────────────────────────────────
export const WASM_URL = '/wasm/leakscope_core.js';

interface WasmScanner {
  readonly network: string;
  readonly pools: string[];
  readonly notesFound: number;
  scanBlock(compactBlock: Uint8Array): OwnedTx[];
  free(): void;
}
interface WasmCore {
  default: (input?: unknown) => Promise<unknown>;
  Scanner: new (ufvk: string) => WasmScanner;
}

let corePromise: Promise<WasmCore> | null = null;

/** Loads and instantiates the WASM scanner (≈540 KB, once). */
export function loadCore(): Promise<WasmCore> {
  corePromise ??= (async () => {
    // A runtime URL import the bundler must not try to resolve. A plain dynamic import (no
    // eval/new Function) so a strict Content-Security-Policy can allow it.
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ WASM_URL)) as WasmCore;
    await mod.default();
    return mod;
  })();
  corePromise.catch(() => (corePromise = null));
  return corePromise;
}

/** Validates a key and reports its network and pools, without scanning. Throws on a bad key. */
export async function inspectKey(ufvk: string): Promise<{ network: Network; pools: string[] }> {
  const core = await loadCore();
  const s = new core.Scanner(ufvk.trim());
  try {
    return { network: s.network === 'test' ? 'test' : 'main', pools: [...s.pools] };
  } finally {
    s.free();
  }
}

const CHUNK = 1000;
/**
 * Requests start at a multiple of this, so the block proxy sees a coarse start height rather
 * than the wallet's exact birthday. Results are filtered back to the requested range locally.
 */
export const START_GRANULARITY = 1000;
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

export const scanWallet: ScanWallet = async (ufvk, from, to, onProgress, signal) => {
  const core = await loadCore();
  const scanner = new core.Scanner(ufvk.trim()); // throws on a malformed key
  try {
    const network: Network = scanner.network === 'test' ? 'test' : 'main';
    const proxy = PROXIES[network];
    const end = to === 'tip' ? await latestHeight(proxy, signal) : to;
    if (end < from) throw new Error(`Start height ${from} is above the end height ${end}.`);
    const fetchFrom = Math.max(1, Math.floor(from / START_GRANULARITY) * START_GRANULARITY);
    const all: OwnedTx[] = [];
    let done = 0, last = 0;
    for (let start = fetchFrom; start <= end; start += CHUNK) {
      const stop = Math.min(end, start + CHUNK - 1);
      for await (const block of compactBlocks(proxy, start, stop, signal)) {
        all.push(...scanner.scanBlock(block));
        done++;
        const now = performance.now();
        if (now - last > 120) {
          last = now;
          onProgress({ height: fetchFrom + done - 1, from: fetchFrom, to: end, notes: scanner.notesFound, txs: all.filter((t) => t.height >= from).length });
          await yieldToUi();
        }
      }
    }
    const owned = all.filter((t) => t.height >= from);
    onProgress({ height: end, from: fetchFrom, to: end, notes: scanner.notesFound, txs: owned.length });
    const txids = [...new Set(owned.map((t) => t.txid))];
    return { txids, owned, network, pools: [...scanner.pools] };
  } finally {
    scanner.free();
  }
};

/**
 * Public testnet demo: the "alice" wallet from our own testnet experiments. Viewing key only
 * (it can see, not spend), published on purpose so anyone can reproduce the report.
 */
export const TESTNET_DEMO = {
  ufvk: 'uviewtest1xwhaavt0g3ssld0kyjn2lq88zmp5cfzs498xquqyjzdc99mcsvkpyuzxnjqdy95aw5ys639jrd4gx0us3fc9a3kf63hr7neq5da94mv32qvm9l0su09ne508xhdyl656r25dg43c5mdlsl7jv6xkxt45kvmngapuuervg3v2zq47g9pkxyzk9wvln7hhaqp79kqpxshmt70cn4kkref2nwnlksml42waadtysardduc6fcn28h6762t9dr2razfeaj94pq6nyaw8ag4ehhupgrn3daa3smsm5tjj8a33e47ggh4y9nt823nf3ntz6xuza6eg03d6mh4c0glhy5w5ns68r9csthah6d53tmlujs82vgmqpcm790wa94qhaw9hfddxg6mhpdvdvvdkjuaz64y83e7s9944qe9njakra0yyrx7dn4a3tldcep5xyshe5u88h6x2c2he4ld8ds3lr6jxm0c0d56qgw9k2pzv88l7zfq9y5m5xsty',
  from: 4_491_860,
  to: 4_492_100,
};
