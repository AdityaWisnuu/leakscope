/**
 * Wallet-facing API: one call before "Send" that answers "will this leak, and what should I
 * do instead?" in terms a confirmation screen can show directly.
 *
 * Everything runs locally. The only network access is `loadPublishedContext`, which downloads
 * Leakscope's public dataset (the same for every user); nothing about the planned send is sent.
 */
import { fmtZec } from './detect';
import { ChainContext, preflight, type PreflightResult, type Suggestion, type Warning } from './preflight';
import type { Pool, Severity, ValueEvent } from './types';
import { decompose, isDenomination, schedule, type ScheduledPart } from './zip318';

/** Where the live Leakscope site publishes its mainnet dataset. */
export const DEFAULT_DATA_URL = 'https://leakscope-cyan.vercel.app/data';

/** Pool codes used by the published columnar index. */
export const INDEX_POOLS: Pool[] = ['transparent', 'sapling', 'orchard', 'ironwood'];

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
export function eventsFromIndex(ix: EventIndex): ValueEvent[] {
  const n = ix.amount.length;
  const out: ValueEvent[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let id = ix.tx ? ix.tx[i] : i;
    // Older indexes: a shielded-to-shielded crossing is an adjacent out/in pair of one tx.
    if (!ix.tx && i > 0 && ix.from[i] !== 0 && ix.to[i] !== 0 && ix.dir[i] === 1 && ix.dir[i - 1] === 0 &&
        ix.h[i - 1] === ix.h[i] && ix.amount[i - 1] === ix.amount[i]) id = i - 1;
    out[i] = {
      txid: `tx:${id}`,
      h: ix.h[i],
      time: 0,
      dir: ix.dir[i] === 1 ? 'in' : 'out',
      from: INDEX_POOLS[ix.from[i]],
      to: INDEX_POOLS[ix.to[i]],
      amount: ix.amount[i],
      addrs: [],
    };
  }
  return out;
}

/** Builds a wallet context from already-loaded published data (e.g. bundled or cached). */
export function contextFromIndex(ix: EventIndex, boundaryAddresses: Iterable<string> = []): WalletContext {
  const events = eventsFromIndex(ix);
  const chain = new ChainContext({ events });
  return { chain, tip: Math.max(ix.tip, chain.tip), events: events.length, boundaryAddresses: new Set(boundaryAddresses) };
}

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
export async function loadPublishedContext(opts: LoadOptions = {}): Promise<WalletContext> {
  const base = (opts.baseUrl ?? DEFAULT_DATA_URL).replace(/\/+$/, '');
  const f = opts.fetch ?? globalThis.fetch;
  if (!f) throw new Error('No fetch available: pass opts.fetch or use contextFromIndex()');
  const get = async <T>(name: string): Promise<T> => {
    const r = await f(`${base}/${name}`, { signal: opts.signal });
    if (!r.ok) throw new Error(`Leakscope: could not load ${base}/${name} (${r.status})`);
    return r.json() as Promise<T>;
  };
  const [ix, addrs] = await Promise.all([
    get<EventIndex>('event-index.json'),
    opts.addresses === false ? Promise.resolve([] as string[]) : get<string[]>('boundary-addresses.json'),
  ]);
  return contextFromIndex(ix, addrs);
}

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

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Score thresholds: ≥ 75 is a crowd of 11+ look-alikes; < 40 means 3 or fewer, or a hard link. */
export function levelFor(score: number): VerdictLevel {
  return score >= 75 ? 'ok' : score >= 40 ? 'warn' : 'danger';
}

function isWalletContext(c: WalletContext | ChainContext): c is WalletContext {
  // Duck-typed so contexts survive duplicate copies of the package (ESM + CJS).
  return 'chain' in c && 'boundaryAddresses' in c;
}

function crowdOf(chain: ChainContext, amount: number) {
  return new Set(chain.similar(amount).map((e) => e.txid)).size + 1;
}

/** Engine pre-flight plus boundary-address checks against the published address list. */
function runPreflight(req: SendRequest, c: WalletContext | ChainContext): PreflightResult {
  const plan = { from: req.from, to: req.to, amount: req.amountZat, ownTxids: req.ownTxids };
  if (!isWalletContext(c)) return preflight({ ...plan, toAddress: req.toAddress, fromAddresses: req.fromAddresses }, c);
  const r = preflight(plan, c.chain);
  if (!r.revealsAmount) return r;
  const warnings = [...r.warnings];
  let score = r.score;
  const to = req.toAddress?.trim();
  if (to && c.boundaryAddresses.has(to)) {
    score = Math.min(score, 10);
    warnings.push({
      severity: 'high',
      title: 'Destination address already appears on-chain',
      detail: `${to} was already used at a shielded-pool boundary. Reuse ties those transactions to this one. Use a fresh address.`,
    });
  }
  for (const a of req.fromAddresses ?? []) {
    if (!c.boundaryAddresses.has(a.trim())) continue;
    score = Math.min(score, 10);
    warnings.push({
      severity: 'high',
      title: 'Shielding from an address that already touched a shielded pool',
      detail: `${a} appeared at a pool boundary before (for example receiving a deshielding). Shielding from it links both sides of the hop.`,
    });
  }
  return { ...r, score, warnings };
}

/**
 * Checks a planned send before it is signed. Pass a context from `loadPublishedContext()`
 * (or `contextFromIndex()`), or a `ChainContext` built from your own analysis.
 */
export function checkSend(req: SendRequest, c: WalletContext | ChainContext): SendVerdict {
  if (!Number.isSafeInteger(req.amountZat) || req.amountZat <= 0) {
    throw new RangeError('amountZat must be a positive integer number of zatoshis');
  }
  const chain = isWalletContext(c) ? c.chain : c;
  const r = runPreflight(req, c);
  const level = levelFor(r.score);
  const warnings = [...r.warnings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const amt = fmtZec(req.amountZat);
  const crowd = r.anonymitySet;

  let suggestedSplit: SuggestedSplit | undefined;
  if (req.from !== req.to && !isDenomination(req.amountZat)) {
    const { parts, residual } = decompose(req.amountZat);
    if (parts.length > 0) {
      const withCrowd = parts.map((p) => ({ amountZat: p, crowd: crowdOf(chain, p) }));
      suggestedSplit = {
        parts: withCrowd,
        residualZat: residual,
        schedule: (req.currentHeight == null && r.suggestions.find((s) => s.schedule)?.schedule) ||
          schedule(parts, Math.max(req.currentHeight ?? 0, chain.tip)),
        minCrowd: Math.min(...withCrowd.map((p) => p.crowd)),
      };
    }
  }

  const reasons = warnings.filter((w) => w.severity !== 'info' || level === 'ok').map((w) => w.title);
  let headline: string;
  if (!r.revealsAmount) headline = `Private: stays inside the ${req.from} pool`;
  else if (req.from === 'transparent' && req.to === 'transparent') headline = 'Fully public: sender, recipient and amount are visible';
  else if (warnings[0] && RANK[warnings[0].severity] <= RANK.high && warnings[0].title.includes('address')) headline = warnings[0].title;
  else if (warnings.some((w) => w.severity === 'critical')) headline = warnings.find((w) => w.severity === 'critical')!.title;
  else if (crowd === 1) headline = `${amt} would be unique on-chain: anyone matching amounts can single it out`;
  else if (level === 'ok') headline = `${amt} will be public, but it blends in with ${crowd! - 1} recent look-alikes`;
  else headline = `${amt} will be public and only ${crowd! - 1} recent transaction${crowd === 2 ? '' : 's'} look alike`;

  return {
    level,
    score: r.score,
    headline,
    reasons,
    revealsAmount: r.revealsAmount,
    crowd,
    suggestedSplit,
    warnings,
    suggestions: r.suggestions,
  };
}
