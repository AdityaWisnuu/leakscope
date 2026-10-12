// Per-transaction lookup against the static findings shards (findings/<first byte>.json).
// Only the shard name (first two hex characters, shared by ~1/256 of all transactions)
// is ever requested; the full txid never leaves the browser.
import { DATA } from './constants';
import type { Finding } from './types';

const cache = new Map<string, Promise<Finding[]>>();

/** Mainnet report by default; the testnet report backs the scanner's testnet demo. */
export const DATASETS = { main: DATA, test: '/data-testnet' } as const;
export type Dataset = keyof typeof DATASETS;

export function loadShard(prefix: string, ds: Dataset = 'main'): Promise<Finding[]> {
  const k = prefix.slice(0, 2).toLowerCase();
  const key = `${ds}:${k}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${DATASETS[ds]}/findings/${k}.json`).then((r) => {
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`Could not load findings shard ${k} (${r.status})`);
      return r.json() as Promise<Finding[]>;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export const ALL_PREFIXES = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Downloads every shard, so the set of requests says nothing about which txids you care about. */
export async function loadAllShards(onProgress?: (done: number, total: number) => void, ds: Dataset = 'main') {
  let done = 0;
  const queue = [...ALL_PREFIXES];
  const worker = async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
      await loadShard(k, ds);
      onProgress?.(++done, ALL_PREFIXES.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

export async function findingsFor(txids: string[], ds: Dataset = 'main'): Promise<Map<string, Finding[]>> {
  const want = new Set(txids.map((t) => t.toLowerCase()));
  const prefixes = [...new Set([...want].map((t) => t.slice(0, 2)))];
  const shards = await Promise.all(prefixes.map((k) => loadShard(k, ds)));
  const out = new Map<string, Finding[]>();
  // A finding spanning two txids is stored in both txids' shards: count it once.
  const seen = new Set<string>();
  for (const list of shards) {
    for (const f of list) {
      for (const t of new Set(f.txids)) {
        if (!want.has(t)) continue;
        const key = `${t}|${f.kind}|${f.txids.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.set(t, [...(out.get(t) ?? []), f]);
      }
    }
  }
  return out;
}
