// Build-time access to the static report (server components and static route handlers only).
import fs from 'node:fs';
import path from 'node:path';
import type { Day, EventIndex, Examples, Summary } from './types';

const dir = path.join(process.cwd(), 'public', 'data');
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as T;

export const getSummary = () => read<Summary>('summary.json');
export const getDays = () => read<Day[]>('days.json');
export const getExamples = () => read<Examples>('examples.json');
export const getEventIndex = () => read<EventIndex>('event-index.json');
export const fileSize = (name: string) => {
  try {
    return fs.statSync(path.join(dir, name)).size;
  } catch {
    return 0;
  }
};
export const getBoundaryAddresses = () => read<string[]>('boundary-addresses.json');

/**
 * What the published data covers, as heights and as UTC dates of the first and last block
 * (interpolated from the per-day series at 75 s per block). Use these everywhere a date range is shown.
 */
export function getCoverage() {
  const s = getSummary();
  const days = getDays();
  const first = days[0], last = days.at(-1)!;
  const fromTime = first.time + (s.range.from - first.from) * 75;
  const toTime = last.time + (s.range.to - last.from) * 75;
  const d = (t: number, year = true) =>
    new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: year ? 'numeric' : undefined, timeZone: 'UTC' });
  return {
    from: s.range.from,
    to: s.range.to,
    fromTime,
    toTime,
    /** e.g. "28 Jul 2026" */
    fromDate: d(fromTime),
    /** e.g. "12 Oct 2026" */
    toDate: d(toTime),
    /** e.g. "28 Jul – 12 Oct 2026" */
    span: `${d(fromTime, false)} – ${d(toTime)}`,
  };
}
export type Coverage = ReturnType<typeof getCoverage>;
