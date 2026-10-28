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
