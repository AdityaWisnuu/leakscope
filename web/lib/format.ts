import { BLOCK_SECONDS } from './constants';
import type { Day, Severity } from './types';

export const ZAT = 100_000_000;

/** Exact ZEC string without trailing zeros, e.g. 2.50121076. */
export function zec(zat: number): string {
  return (zat / ZAT).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

const nf = new Intl.NumberFormat('en-US');
export const num = (n: number) => nf.format(n);

export function zecRounded(zat: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(zat / ZAT);
}

export const shortTx = (t: string, n = 8) => `${t.slice(0, n)}…${t.slice(-4)}`;

export const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);

/** Approximate wall-clock time of a block, interpolated from the per-day series. */
export function heightToTime(days: Pick<Day, 'from' | 'time'>[], h: number): number {
  let ref = days[0];
  for (const d of days) if (d.from <= h) ref = d;
  return ref ? ref.time + (h - ref.from) * BLOCK_SECONDS : 0;
}

export function fmtDate(unix: number, withTime = false): string {
  const d = new Date(unix * 1000);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: withTime ? undefined : 'numeric',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
    timeZone: 'UTC',
  }) + (withTime ? ' UTC' : '');
}

export function fmtDuration(blocks: number): string {
  const s = blocks * BLOCK_SECONDS;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400 * 2) {
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${(s / 86400).toFixed(1)} days`;
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const isTxid = (s: string) => /^[0-9a-f]{64}$/.test(s);
