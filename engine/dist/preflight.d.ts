import { type Analysis, type DetectOptions } from './detect.js';
import type { Pool, Severity, ValueEvent } from './types.js';
import { type ScheduledPart } from './zip318.js';
/** What the user is about to do. Amounts in zatoshis. */
export interface Plan {
    from: Pool;
    to: Pool;
    amount: number;
    /** Destination transparent address, for deshielding. */
    toAddress?: string;
    /** Source transparent addresses, for shielding. */
    fromAddresses?: string[];
    /** Txids of the user's own earlier transactions (e.g. from a wallet scan). */
    ownTxids?: string[];
}
export interface Warning {
    severity: Severity;
    title: string;
    detail: string;
    txids?: string[];
}
export interface Suggestion {
    title: string;
    detail: string;
    schedule?: ScheduledPart[];
}
export interface PreflightResult {
    /** 0 = certainly linkable, 100 = nothing observable beyond the pool's usual noise. */
    score: number;
    /** How many recent public amounts an observer could confuse this one with (incl. itself). */
    anonymitySet: number | null;
    revealsAmount: boolean;
    warnings: Warning[];
    suggestions: Suggestion[];
}
/** The public history a plan is judged against, built once from an analysis. */
export declare class ChainContext {
    private opts;
    readonly tip: number;
    private byAmount;
    private addrUse;
    constructor(analysis: Pick<Analysis, 'events'>, opts?: DetectOptions);
    /** Recent boundary events whose amount an observer would consider "the same", allowing a fee. */
    similar(amount: number, dir?: 'in' | 'out'): ValueEvent[];
    usesOf(addr: string): ValueEvent[];
    private lowerBound;
}
/**
 * Judges a planned transaction before it is broadcast: what will be public, what it can
 * be linked to, and how to do the same thing without the leak.
 */
export declare function preflight(plan: Plan, ctx: ChainContext): PreflightResult;
