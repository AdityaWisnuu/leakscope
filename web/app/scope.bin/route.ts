// Emits /scope.bin at build time: every boundary event, packed to 4 bytes, for the
// Observatory drawing. Derived from event-index.json so the data contract stays unchanged.
import { getEventIndex } from '@/lib/data.server';
import { HEADER_INTS, SCOPE_VERSION, amountToBucket } from '@/lib/scopePack';

export const dynamic = 'force-static';

const MAX_POINTS = 160_000;

export function GET() {
  const ix = getEventIndex();
  const keep: number[] = [];
  for (let i = 0; i < ix.h.length; i++) {
    const crossing = ix.from[i] !== 0 && ix.to[i] !== 0;
    if (crossing && ix.dir[i] === 0) continue; // a crossing is recorded twice (out + in): draw it once
    keep.push(i);
  }
  const stride = Math.max(1, Math.ceil(keep.length / MAX_POINTS));
  const picked = keep.filter((_, k) => k % stride === 0);
  const hMin = picked.reduce((m, i) => Math.min(m, ix.h[i]), Infinity);
  const hMax = picked.reduce((m, i) => Math.max(m, ix.h[i]), 0);
  const buf = new ArrayBuffer(HEADER_INTS * 4 + picked.length * 4);
  new Int32Array(buf, 0, HEADER_INTS).set([SCOPE_VERSION, hMin, hMax, picked.length, stride]);
  const words = new Uint32Array(buf, HEADER_INTS * 4);
  picked.forEach((i, k) => {
    const type = ix.from[i] === 0 ? 0 : ix.to[i] === 0 ? 1 : 2;
    const off = Math.min(0x3ffff, ix.h[i] - hMin);
    words[k] = ((type << 30) | (ix.from[i] << 28) | (ix.to[i] << 26) | (off << 8) | amountToBucket(ix.amount[i])) >>> 0;
  });
  return new Response(buf, { headers: { 'content-type': 'application/octet-stream' } });
}
