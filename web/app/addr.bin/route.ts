// Emits /addr.bin at build time: hashed membership set of boundary addresses (lib/addrSet.ts).
import { getBoundaryAddresses } from '@/lib/data.server';
import { packAddrSet } from '@/lib/addrSet';

export const dynamic = 'force-static';

export function GET() {
  return new Response(packAddrSet(getBoundaryAddresses()), { headers: { 'content-type': 'application/octet-stream' } });
}
