import type { Finding, Severity, TxRecord, ValueEvent } from './types.cjs';
export interface DetectOptions {
    /** How far back (in blocks) an observer looks for a matching deposit. Mainnet: ~1152 blocks/day. */
    windowBlocks: number;
    /** Largest fee gap tolerated between what went in and what came out, in zatoshis. */
    maxFeeGap: number;
    network: 'main' | 'test';
}
export declare const DEFAULTS: DetectOptions;
export declare const ZEC = 100000000;
export declare const fmtZec: (z: number) => string;
/**
 * Could this deposit be the note this withdrawal spent in full?
 *
 * When a withdrawal empties one note, deposit = amount out + the withdrawal's own fee, exactly.
 * That fee is public, so the match is pinned to a single value. Only when the fee can't be
 * computed do we fall back to "some plausible ZIP-317 fee", which matches far more by chance.
 */
export declare function depositMatches(depositAmount: number, out: ValueEvent, maxFeeGap?: number): boolean;
export type LinkTier = 'fast' | 'day' | 'fast-round';
/**
 * How often a unique amount match is a real link, by tier. Measured on mainnet blocks
 * 3,428,143–3,515,250 with scripts/evaluate.ts: the same rule applied backwards in time
 * (deposits AFTER the withdrawal) can only find coincidences, which estimates false links.
 */
export declare const CALIBRATION: Record<LinkTier, {
    severity: Severity;
    precision: number;
    label: string;
}>;
/** Round amounts (multiples of 0.001 ZEC) collide by chance, so they only count when nearly immediate. */
export declare function linkTier(blocks: number, amount: number): LinkTier | null;
export interface Analysis {
    findings: Finding[];
    events: ValueEvent[];
    /** For every 'out' event: how many deposits it could plausibly be (its anonymity set). */
    outSets: {
        event: ValueEvent;
        candidates: ValueEvent[];
    }[];
}
/**
 * Runs every detector over a chronologically ordered set of transactions.
 *
 * Each detector models a concrete observer: someone with only the public chain who wants
 * to link a withdrawal back to a deposit, or two transactions to one owner.
 */
export declare function analyze(records: Iterable<TxRecord>, opts?: Partial<DetectOptions>): Analysis;
