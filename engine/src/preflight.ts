import { DEFAULTS, fmtZec, type Analysis, type DetectOptions } from './detect';
import type { Pool, Severity, ValueEvent } from './types';
import { decompose, isDenomination, MAX_RESIDUAL_VALUE, schedule, type ScheduledPart } from './zip318';

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
export class ChainContext {
  readonly tip: number;
  private byAmount: ValueEvent[];
  private addrUse = new Map<string, ValueEvent[]>();

  constructor(analysis: Pick<Analysis, 'events'>, private opts: DetectOptions = DEFAULTS) {
    this.byAmount = [...analysis.events].sort((a, b) => a.amount - b.amount);
    this.tip = analysis.events.reduce((m, e) => Math.max(m, e.h), 0);
    for (const e of analysis.events) {
      for (const a of e.addrs) {
        const list = this.addrUse.get(a) ?? [];
        list.push(e);
        this.addrUse.set(a, list);
      }
    }
  }

  /** Recent boundary events whose amount an observer would consider "the same", allowing a fee. */
  similar(amount: number, dir?: 'in' | 'out'): ValueEvent[] {
    const lo = amount - this.opts.maxFeeGap, hi = amount + this.opts.maxFeeGap;
    let i = this.lowerBound(lo);
    const out: ValueEvent[] = [];
    for (; i < this.byAmount.length && this.byAmount[i].amount <= hi; i++) {
      const e = this.byAmount[i];
      const gap = Math.abs(e.amount - amount);
      if (this.tip - e.h > this.opts.windowBlocks || gap % 5000 !== 0) continue;
      if (dir && e.dir !== dir) continue;
      out.push(e);
    }
    return out;
  }

  usesOf(addr: string) {
    return this.addrUse.get(addr) ?? [];
  }

  private lowerBound(x: number) {
    let lo = 0, hi = this.byAmount.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.byAmount[mid].amount < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/** A pool crossing yields two events (out of one pool, into another); count transactions. */
function uniqueTxs(events: ValueEvent[]) {
  const seen = new Set<string>();
  return events.filter((e) => !seen.has(e.txid) && seen.add(e.txid));
}

function scoreForSet(n: number) {
  return n <= 1 ? 5 : n <= 3 ? 25 : n <= 10 ? 50 : n <= 50 ? 75 : 90;
}

/**
 * Judges a planned transaction before it is broadcast: what will be public, what it can
 * be linked to, and how to do the same thing without the leak.
 */
export function preflight(plan: Plan, ctx: ChainContext): PreflightResult {
  const warnings: Warning[] = [];
  const suggestions: Suggestion[] = [];
  const own = new Set(plan.ownTxids ?? []);
  const revealsAmount = plan.from !== plan.to;

  if (!revealsAmount) {
    if (plan.from === 'transparent') {
      warnings.push({
        severity: 'critical',
        title: 'Fully transparent transaction',
        detail: 'Sender, recipient and amount are all public. Shield first.',
      });
      return { score: 0, anonymitySet: 1, revealsAmount: true, warnings, suggestions };
    }
    return {
      score: 100,
      anonymitySet: null,
      revealsAmount: false,
      warnings: [
        {
          severity: 'info',
          title: `Stays inside the ${plan.from} pool`,
          detail:
            'Sender, recipient, amount and memo stay encrypted. Still visible: that a transaction happened, ' +
            'when, its number of actions and its fee. Use the standard ZIP-317 fee so it looks like every other wallet.',
        },
      ],
      suggestions,
    };
  }

  // Amount crossing a boundary: how many look-alikes exist?
  const lookalikes = uniqueTxs(ctx.similar(plan.amount).filter((e) => !own.has(e.txid)));
  const anonymitySet = lookalikes.length + 1;
  let score = scoreForSet(anonymitySet);
  const dir = plan.to === 'transparent' ? 'leaving' : plan.from === 'transparent' ? 'entering' : 'moving between';
  warnings.push({
    severity: anonymitySet === 1 ? 'high' : anonymitySet <= 10 ? 'medium' : 'low',
    title: `The amount ${fmtZec(plan.amount)} will be public`,
    detail:
      `Value ${dir} the shielded pools is visible on-chain. In the last ` +
      `${Math.round(DEFAULTS.windowBlocks / 1152)} days, ${lookalikes.length} other transaction` +
      `${lookalikes.length === 1 ? '' : 's'} crossed a pool boundary with the same amount (allowing for fees).` +
      (anonymitySet === 1 ? ' It would be unique: anyone matching amounts can single it out.' : ''),
  });

  // Withdrawal pointing back at the user's own deposit.
  if (plan.to === 'transparent' || plan.from !== 'transparent') {
    const deposits = ctx.similar(plan.amount, 'in').filter((e) => e.amount >= plan.amount);
    const mine = deposits.filter((e) => own.has(e.txid));
    if (mine.length > 0 && deposits.length <= 3) {
      score = Math.min(score, 5);
      warnings.push({
        severity: 'critical',
        title: 'This withdrawal points straight back at your own deposit',
        detail:
          `Your earlier transaction moved almost exactly this amount into the pool, and only ${deposits.length} ` +
          'deposit(s) of that size exist in the window. An observer links the two without breaking any cryptography.',
        txids: mine.map((e) => e.txid),
      });
    }
  }

  if (plan.toAddress) {
    const uses = ctx.usesOf(plan.toAddress);
    if (uses.length > 0) {
      score = Math.min(score, 10);
      warnings.push({
        severity: 'high',
        title: 'Destination address already appears on-chain',
        detail: `${plan.toAddress} was used at a pool boundary ${uses.length} time(s) before. Reuse ties those transactions to this one. Use a fresh address.`,
        txids: uses.map((e) => e.txid),
      });
    }
  }
  for (const a of plan.fromAddresses ?? []) {
    const deshieldedHere = ctx.usesOf(a).filter((e) => e.dir === 'out');
    if (deshieldedHere.length > 0) {
      score = Math.min(score, 10);
      warnings.push({
        severity: 'high',
        title: 'Shielding from an address that received shielded funds',
        detail: `${a} received a deshielding before. Shielding from it links both sides of the hop.`,
        txids: deshieldedHere.map((e) => e.txid),
      });
    }
  }

  if (!isDenomination(plan.amount)) {
    const { parts, residual } = decompose(plan.amount);
    const plan318 = schedule(parts, ctx.tip);
    const minSet = Math.min(...parts.map((p) => uniqueTxs(ctx.similar(p)).length + 1));
    suggestions.push({
      title: `Split into ${parts.length} standard ZIP-318 amount${parts.length === 1 ? '' : 's'}, spread over time`,
      detail:
        `${parts.map(fmtZec).join(' + ')}${residual >= 1 ? ` (leaving ${fmtZec(residual)} behind)` : ''}. ` +
        `Standard amounts are shared by every compliant wallet: the smallest crowd among these parts is ` +
        `${minSet} recent look-alikes, versus ${anonymitySet} for the exact amount. Broadcasting them at ` +
        `random, exponentially spaced heights (mean 66 blocks ≈ 82 min) breaks timing correlation too.`,
      schedule: plan318,
    });
  }
  if (plan.to === 'transparent') {
    suggestions.push({
      title: 'Withdraw to a fresh address you never reuse',
      detail: 'A new transparent address per withdrawal keeps observers from clustering your exits.',
    });
  }
  if (plan.amount < MAX_RESIDUAL_VALUE) {
    suggestions.push({
      title: 'Consider whether this needs to leave the pool at all',
      detail: 'Paying a shielded address directly reveals nothing about the amount.',
    });
  }

  return { score, anonymitySet, revealsAmount, warnings, suggestions };
}
