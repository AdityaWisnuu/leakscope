// Shapes of the static files in /public/data (written by engine/scripts/report.ts).
import type { Finding, FindingKind, Pool, Severity } from './engine';

export type { Finding, FindingKind, Pool, Severity };

export interface Summary {
  generatedAt: string;
  range: { from: number; to: number; blocks: number; days: number };
  txs: number;
  boundaryEvents: number;
  deshieldTxs: number;
  shieldTxs: number;
  linkableDeshields: number;
  linkableDeshieldsPct: number;
  roundTrips: number;
  addressReuse: number;
  feeFingerprints: number;
  migrations: { count: number; zec: number; standardDenomination: number; uniqueAmount: number };
  findingsBySeverity: Record<Severity, number>;
  findingsByKind: Partial<Record<FindingKind, number>>;
}

export interface Day {
  day: number;
  from: number;
  time: number;
  txs: number;
  transparentOnly: number;
  mixed: number;
  fullyShielded: number;
  actions: { sapling: number; orchard: number; ironwood: number };
  shields: number;
  deshields: number;
  crossings: number;
  linkedOuts: number;
}

export interface LinkEnd {
  txid: string;
  h: number;
  amount: number;
  from: Pool;
  to: Pool;
}

export interface Link {
  kind: FindingKind;
  severity: Severity;
  set: number;
  a: LinkEnd;
  b: LinkEnd;
  title: string;
}

export type Examples = Partial<Record<FindingKind, Finding[]>>;

/** Columnar boundary events. Pools: 0 transparent, 1 sapling, 2 orchard, 3 ironwood. dir: 1 in, 0 out. */
export interface EventIndex {
  tip: number;
  amount: number[];
  h: number[];
  dir: number[];
  from: number[];
  to: number[];
  /** Transaction ordinal per event (events of one tx share it). Older indexes lack it. */
  tx?: number[];
}

export const POOLS: Pool[] = ['transparent', 'sapling', 'orchard', 'ironwood'];
