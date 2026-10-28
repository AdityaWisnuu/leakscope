/**
 * ZIP 318 (Draft, 2026-06-16): Orchard → Ironwood migration.
 *
 * Splitting a balance into canonical denominations, spread over time, is the only way to
 * cross a pool boundary without revealing a linkable amount. These are the ZIP's parameters
 * and decomposition rules, so plans made here look like every other compliant wallet's.
 */
export declare const ZAT_PER_ZEC = 100000000;
/** Smallest denomination: remainders below it stay where they are. */
export declare const MAX_RESIDUAL_VALUE: number;
/** Largest single pool-crossing denomination. */
export declare const DENOM_CAP: number;
export declare const MEAN_DELAY = 66;
export declare const MAX_DELAY = 576;
export declare const BOUNDARY_MODULUS = 144;
/** Every value of the form {1,2,5} × 10^k between 0.01 and 10000 ZEC. */
export declare function isDenomination(zat: number): boolean;
export interface Decomposition {
    parts: number[];
    /** Left unmigrated: below the smallest denomination. */
    residual: number;
}
/** The ZIP's deterministic decomposition: repeated caps, then each decimal digit greedily. */
export declare function decompose(value: number): Decomposition;
export type Rng = () => number;
/** Cryptographically secure uniform [0, 1), as the ZIP requires for all schedule randomness. */
export declare const secureRandom: Rng;
/** The ZIP's randomized decomposition: at each step pick among {1,2,5} × 10^k that fit. */
export declare function decomposeRandomized(value: number, rng?: Rng): Decomposition;
/** Exponential delay in whole blocks, mean `mean`, redrawn above `max`. */
export declare function drawDelay(rng?: Rng, mean?: number, max?: number): number;
export interface ScheduledPart {
    amount: number;
    height: number;
}
/**
 * A full migration schedule: shuffled parts, exponentially spaced, starting one bucket
 * interval after the next boundary.
 */
export declare function schedule(parts: number[], tip: number, rng?: Rng): ScheduledPart[];
