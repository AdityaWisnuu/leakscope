// In-browser pre-flight: rebuilds the engine's ChainContext from the static event index.
import { ChainContext, preflight, type Plan, type PreflightResult, type ValueEvent } from './engine';
import { DATA } from './constants';
import { POOLS, type EventIndex } from './types';

export interface LocalChain {
  ctx: ChainContext;
  tip: number;
  events: number;
  /** Transparent addresses ever seen at a pool boundary (direction not recorded). */
  boundaryAddresses: Set<string>;
}

let pending: Promise<LocalChain> | null = null;

/** Loads the public boundary history once. Nothing about the user's plan is sent anywhere. */
export function loadLocalChain(): Promise<LocalChain> {
  pending ??= (async () => {
    const [ix, addrs] = await Promise.all([
      fetch(`${DATA}/event-index.json`).then((r) => r.json() as Promise<EventIndex>),
      fetch(`${DATA}/boundary-addresses.json`).then((r) => r.json() as Promise<string[]>),
    ]);
    return { ...fromIndex(ix), boundaryAddresses: new Set(addrs) };
  })();
  pending.catch(() => (pending = null));
  return pending;
}

/**
 * The index carries no txids or addresses. Events of one transaction get one synthetic id
 * (from the `tx` column, or by pairing a crossing's adjacent out/in events in older indexes),
 * so look-alikes are counted per transaction exactly as the engine does.
 */
export function eventsFromIndex(ix: EventIndex): ValueEvent[] {
  const n = ix.amount.length;
  const out: ValueEvent[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let id = ix.tx ? ix.tx[i] : i;
    if (!ix.tx && i > 0 && ix.from[i] !== 0 && ix.to[i] !== 0 && ix.dir[i] === 1 && ix.dir[i - 1] === 0 &&
        ix.h[i - 1] === ix.h[i] && ix.amount[i - 1] === ix.amount[i]) id = i - 1;
    out[i] = {
      txid: `tx:${id}`,
      h: ix.h[i],
      time: 0,
      dir: ix.dir[i] === 1 ? 'in' : 'out',
      from: POOLS[ix.from[i]],
      to: POOLS[ix.to[i]],
      amount: ix.amount[i],
      addrs: [],
    };
  }
  return out;
}

/** Recent transactions whose boundary amount an observer would confuse with this one (incl. itself). */
export function crowd(chain: LocalChain, amount: number) {
  return new Set(chain.ctx.similar(amount).map((e) => e.txid)).size + 1;
}

export function fromIndex(ix: EventIndex) {
  const events = eventsFromIndex(ix);
  return { ctx: new ChainContext({ events }), tip: Math.max(ix.tip, ctx0(events)), events: events.length };
}
const ctx0 = (events: ValueEvent[]) => events.reduce((m, e) => Math.max(m, e.h), 0);

/**
 * Runs the engine's pre-flight, then the address checks. The static index only says which
 * addresses ever touched a pool boundary (not in which direction), so both address checks
 * use that set; the engine itself checks deshield-direction for source addresses.
 */
export function runPreflight(plan: Plan, chain: LocalChain): PreflightResult {
  const r = preflight({ ...plan, toAddress: undefined, fromAddresses: undefined }, chain.ctx);
  if (!r.revealsAmount && plan.from === plan.to) return r;
  const warnings = [...r.warnings];
  let score = r.score;
  const to = plan.toAddress?.trim();
  if (to && chain.boundaryAddresses.has(to)) {
    score = Math.min(score, 10);
    warnings.push({
      severity: 'high',
      title: 'Destination address already appears on-chain',
      detail: `${to} was already used at a shielded-pool boundary in the indexed range. Reuse ties those transactions to this one. Use a fresh address.`,
    });
  }
  for (const a of plan.fromAddresses ?? []) {
    if (!chain.boundaryAddresses.has(a)) continue;
    score = Math.min(score, 10);
    warnings.push({
      severity: 'high',
      title: 'Shielding from an address that already touched a shielded pool',
      detail: `${a} appeared at a pool boundary before (for example receiving a deshielding). Shielding from it links both sides of the hop.`,
    });
  }
  return { ...r, score, warnings };
}
