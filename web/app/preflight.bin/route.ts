// Emits /preflight.bin at build time: the 30-day window of boundary events that pre-flight
// needs, packed (see lib/preflightPack.ts). Derived from event-index.json.
import { getEventIndex } from '@/lib/data.server';
import { packPreflight } from '@/lib/preflightPack';

export const dynamic = 'force-static';

export function GET() {
  const bytes = packPreflight(getEventIndex());
  return new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
}
