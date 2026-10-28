import { ChainContext, type Suggestion, type Warning } from './preflight.js';
import type { Pool, ValueEvent } from './types.js';
import { type ScheduledPart } from './zip318.js';
/** Where the live Leakscope site publishes its mainnet dataset. */
export declare const DEFAULT_DATA_URL = "https://leakscope-cyan.vercel.app/data";
/** Pool codes used by the published columnar index. */
export declare const INDEX_POOLS: Pool[];
/**
 * The published `event-index.json`: every public amount that crossed a pool boundary, as
 * parallel columns. Pools: 0 transparent, 1 sapling, 2 orchard, 3 ironwood. dir: 1 in, 0 out.
 */
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
/** Public history a wallet checks sends against. Build it once and reuse it. */
export interface WalletContext {
    chain: ChainContext;
    /** Highest indexed block height. */
    tip: number;
    /** Number of boundary events indexed. */
    events: number;
    /** Transparent addresses ever seen at a pool boundary (direction not recorded). */
    boundaryAddresses: Set<string>;
}
/** Expands the columnar index into engine events (synthetic txids `tx:<n>`, no addresses). */
export declare function eventsFromIndex(ix: EventIndex): ValueEvent[];
/** Builds a wallet context from already-loaded published data (e.g. bundled or cached). */
export declare function contextFromIndex(ix: EventIndex, boundaryAddresses?: Iterable<string>): WalletContext;
export interface LoadOptions {
    /** Base URL of a Leakscope dataset (folder holding event-index.json). Default: the live site. */
    baseUrl?: string;
    /** Also download the ~3 MB list of boundary addresses for address-reuse checks. Default true. */
    addresses?: boolean;
    /** Custom fetch (tests, proxies, Tor-routed clients). Default: global fetch. */
    fetch?: typeof fetch;
    signal?: AbortSignal;
}
/**
 * Downloads Leakscope's public mainnet dataset and builds a context from it. The requests
 * are identical for every user and carry nothing about what the user plans to send.
 */
export declare function loadPublishedContext(opts?: LoadOptions): Promise<WalletContext>;
/** A send the user is about to confirm. */
export interface SendRequest {
    /** Pool the funds come from. */
    from: Pool;
    /** Pool the funds land in ('transparent' for a t-address recipient). */
    to: Pool;
    /** Amount in zatoshis (1 ZEC = 100,000,000). */
    amountZat: number;
    /** Recipient transparent address, when deshielding. */
    toAddress?: string;
    /** Transparent addresses being spent from, when shielding. */
    fromAddresses?: string[];
    /** Txids of the wallet's own earlier transactions (only useful with a full ChainContext). */
    ownTxids?: string[];
    /** The wallet's current chain height; the split schedule starts from it. Default: the dataset tip. */
    currentHeight?: number;
}
export type VerdictLevel = 'ok' | 'warn' | 'danger';
export interface SplitPart {
    amountZat: number;
    /** Recent boundary transactions with this same amount (incl. this one): the crowd it hides in. */
    crowd: number;
}
export interface SuggestedSplit {
    /** ZIP-318 standard denominations, largest first. */
    parts: SplitPart[];
    /** Left behind: below the smallest denomination (0.01 ZEC). */
    residualZat: number;
    /** Random, exponentially spaced broadcast heights (ZIP-318), in shuffled order. */
    schedule: ScheduledPart[];
    /** Smallest crowd among the parts, versus `crowd` for the exact amount. */
    minCrowd: number;
}
export interface SendVerdict {
    level: VerdictLevel;
    /** 0 = certainly linkable, 100 = nothing observable beyond the pool's usual noise. */
    score: number;
    /** One line for the confirmation screen. */
    headline: string;
    /** Short plain-language reasons, most serious first. */
    reasons: string[];
    /** Whether the amount becomes public. */
    revealsAmount: boolean;
    /** How many recent public transactions look like this one (incl. itself); null when the amount stays private. */
    crowd: number | null;
    /** Present when the amount is revealed and is not already a standard denomination. */
    suggestedSplit?: SuggestedSplit;
    /** Full engine output, for wallets that want the details. */
    warnings: Warning[];
    suggestions: Suggestion[];
}
/** Score thresholds: ≥ 75 is a crowd of 11+ look-alikes; < 40 means 3 or fewer, or a hard link. */
export declare function levelFor(score: number): VerdictLevel;
/**
 * Checks a planned send before it is signed. Pass a context from `loadPublishedContext()`
 * (or `contextFromIndex()`), or a `ChainContext` built from your own analysis.
 */
export declare function checkSend(req: SendRequest, c: WalletContext | ChainContext): SendVerdict;
