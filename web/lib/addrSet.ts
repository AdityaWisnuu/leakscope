// Compact membership set of boundary addresses (/addr.bin): the first 8 bytes of
// sha256(address) for each, sorted. A lookup hashes the typed address locally and binary-
// searches the set, so the address itself is never sent. With ~90k entries and 64-bit keys a
// false match has odds around 1 in 10^14.
import { sha256 } from '@noble/hashes/sha256';

export const ADDR_KEY_BYTES = 8;

export function addrKey(addr: string): bigint {
  const d = sha256(new TextEncoder().encode(addr));
  let k = 0n;
  for (let i = 0; i < ADDR_KEY_BYTES; i++) k = (k << 8n) | BigInt(d[i]);
  return k;
}

export function packAddrSet(addrs: Iterable<string>): Uint8Array<ArrayBuffer> {
  const keys = [...new Set([...addrs].map(addrKey))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out = new Uint8Array(keys.length * ADDR_KEY_BYTES);
  const v = new DataView(out.buffer);
  keys.forEach((k, i) => v.setBigUint64(i * ADDR_KEY_BYTES, k));
  return out;
}

export class AddrSet {
  private v: DataView;
  readonly size: number;
  constructor(buf: ArrayBuffer | Uint8Array) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    this.size = Math.floor(b.byteLength / ADDR_KEY_BYTES);
  }
  has(addr: string) {
    const k = addrKey(addr);
    let lo = 0, hi = this.size;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = this.v.getBigUint64(mid * ADDR_KEY_BYTES);
      if (m === k) return true;
      if (m < k) lo = mid + 1;
      else hi = mid;
    }
    return false;
  }
}
