// Compact binary packing of boundary events for the Observatory drawing.
// Header (Int32 ×5): version, hMin, hMax, count, stride (1 = every event drawn).
// Then one Uint32 per point: type(2) | from(2) | to(2) | hOffset(18) | amountBucket(8).
// type: 0 shield (transparent → pool), 1 deshield (pool → transparent), 2 pool → pool.

export const SCOPE_VERSION = 1;
export const HEADER_INTS = 5;
const LOG_MAX = 14; // log10 of the largest plausible amount in zatoshis

export const amountToBucket = (zat: number) =>
  Math.max(0, Math.min(255, Math.round((Math.log10(zat + 1) / LOG_MAX) * 255)));
export const bucketToZat = (b: number) => 10 ** ((b / 255) * LOG_MAX) - 1;

export interface ScopePoints {
  hMin: number;
  hMax: number;
  stride: number;
  count: number;
  type: Uint8Array;
  from: Uint8Array;
  to: Uint8Array;
  h: Uint32Array;
  bucket: Uint8Array;
}

export function unpack(buf: ArrayBuffer): ScopePoints {
  const head = new Int32Array(buf, 0, HEADER_INTS);
  if (head[0] !== SCOPE_VERSION) throw new Error('Unknown scope data version');
  const [, hMin, hMax, count, stride] = head;
  const words = new Uint32Array(buf, HEADER_INTS * 4, count);
  const p: ScopePoints = {
    hMin, hMax, stride, count,
    type: new Uint8Array(count), from: new Uint8Array(count), to: new Uint8Array(count),
    h: new Uint32Array(count), bucket: new Uint8Array(count),
  };
  for (let i = 0; i < count; i++) {
    const w = words[i];
    p.type[i] = w >>> 30;
    p.from[i] = (w >>> 28) & 3;
    p.to[i] = (w >>> 26) & 3;
    p.h[i] = hMin + ((w >>> 8) & 0x3ffff);
    p.bucket[i] = w & 0xff;
  }
  return p;
}
