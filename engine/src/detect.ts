import { conventionalFee, OutputIndex, paidFee, valueEvents } from './events';
import { isDenomination } from './zip318';
import type { Finding, Severity, TxRecord, ValueEvent } from './types';

export interface DetectOptions {
  /** How far back (in blocks) an observer looks for a matching deposit. Mainnet: ~1152 blocks/day. */
  windowBlocks: number;
  /** Largest fee gap tolerated between what went in and what came out, in zatoshis. */
  maxFeeGap: number;
  network: 'main' | 'test';
}

export const DEFAULTS: DetectOptions = { windowBlocks: 1152 * 30, maxFeeGap: 250_000, network: 'main' };

export const ZEC = 100_000_000;
export const fmtZec = (z: number) => `${(z / ZEC).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} ZEC`;

/**
 * Could this deposit be the note this withdrawal spent in full?
 *
 * When a withdrawal empties one note, deposit = amount out + the withdrawal's own fee, exactly.
 * That fee is public, so the match is pinned to a single value. Only when the fee can't be
 * computed do we fall back to "some plausible ZIP-317 fee", which matches far more by chance.
 */
export function depositMatches(depositAmount: number, out: ValueEvent, maxFeeGap = DEFAULTS.maxFeeGap) {
  const gap = depositAmount - out.amount;
  if (out.fee != null) return gap === out.fee;
  return gap > 0 && gap <= maxFeeGap && gap % 5000 === 0;
}

export type LinkTier = 'fast' | 'day' | 'fast-round';

/**
 * How often a unique amount match is a real link, by tier. Measured on mainnet blocks
 * 3,428,143–3,515,250 with scripts/evaluate.ts: the same rule applied backwards in time
 * (deposits AFTER the withdrawal) can only find coincidences, which estimates false links.
 */
export const CALIBRATION: Record<LinkTier, { severity: Severity; precision: number; label: string }> = {
  // 2,535 links, 1 coincidence.
  fast: { severity: 'high', precision: 99, label: 'non-round amount, within 100 blocks' },
  // 128 links, 19 coincidences.
  day: { severity: 'medium', precision: 85, label: 'non-round amount, within a day' },
  // 13 links, 0 coincidences: small sample, so stated conservatively.
  'fast-round': { severity: 'medium', precision: 90, label: 'round amount, within 10 blocks' },
};
// Beyond a day, a unique non-round match was a coincidence more often than not (447 links vs
// 603 coincidences), so it is not reported at all.

/** Round amounts (multiples of 0.001 ZEC) collide by chance, so they only count when nearly immediate. */
export function linkTier(blocks: number, amount: number): LinkTier | null {
  const round = amount % 100_000 === 0;
  if (round) return blocks <= 10 ? 'fast-round' : null;
  return blocks <= 100 ? 'fast' : blocks <= 1152 ? 'day' : null;
}

export interface Analysis {
  findings: Finding[];
  events: ValueEvent[];
  /** For every 'out' event: how many deposits it could plausibly be (its anonymity set). */
  outSets: { event: ValueEvent; candidates: ValueEvent[] }[];
}

/**
 * Runs every detector over a chronologically ordered set of transactions.
 *
 * Each detector models a concrete observer: someone with only the public chain who wants
 * to link a withdrawal back to a deposit, or two transactions to one owner.
 */
export function analyze(records: Iterable<TxRecord>, opts: Partial<DetectOptions> = {}): Analysis {
  const o = { ...DEFAULTS, ...opts };
  const outputs = new OutputIndex(o.network);
  const findings: Finding[] = [];
  const events: ValueEvent[] = [];
  const deshieldTxs = new Set<string>();
  const deshieldedTo = new Map<string, ValueEvent>();
  const crossings: ValueEvent[] = [];

  for (const r of records) {
    outputs.add(r);
    const evs = valueEvents(r, outputs);
    events.push(...evs);

    for (const e of evs) {
      if (e.dir === 'out' && e.to === 'transparent') {
        deshieldTxs.add(e.txid);
        for (const a of e.addrs) if (!deshieldedTo.has(a)) deshieldedTo.set(a, e);
      }
      if (e.dir === 'in' && e.from === 'transparent') {
        // Coins that left the shielded pool and are shielded again: the hop hid nothing.
        const spent = r.vin.map(([t, i]) => outputs.get(t, i)).filter((x) => x && deshieldTxs.has(x.txid));
        if (spent.length > 0) {
          findings.push({
            kind: 'utxo-roundtrip',
            severity: 'critical',
            txids: [spent[0]!.txid, r.txid],
            title: `Re-shielded coins that had just been deshielded (${fmtZec(e.amount)})`,
            detail:
              'This shielding spends a transparent output created by an earlier deshielding. ' +
              'Anyone can follow the coins out of the shielded pool and back in, so both ends are linked.',
            anonymitySet: 1,
            amount: e.amount,
            h: r.h,
            addresses: [...new Set(spent.map((x) => x!.addr))],
          });
        } else {
          const reused = e.addrs.map((a) => deshieldedTo.get(a)).find((x) => x && x.txid !== r.txid);
          if (reused) {
            findings.push({
              kind: 'address-reuse',
              severity: 'high',
              txids: [reused.txid, r.txid],
              title: `Shielded from an address that earlier received deshielded funds`,
              detail:
                `Address ${e.addrs[0]} received a withdrawal from the shielded pool and later shielded again. ` +
                'Reusing a transparent address ties both shielded activities to one owner.',
              anonymitySet: 1,
              amount: e.amount,
              h: r.h,
              addresses: [e.addrs[0]],
            });
          }
        }
      }
      if (e.dir === 'in' && e.from !== 'transparent') crossings.push(e);
    }

    const fee = paidFee(r, outputs);
    if (fee !== null && fee > 0 && fee !== conventionalFee(r)) {
      findings.push({
        kind: 'fee-fingerprint',
        severity: 'low',
        txids: [r.txid],
        title: `Non-standard fee ${fee} zat (ZIP-317 would be ${conventionalFee(r)})`,
        detail:
          'Most wallets pay exactly the ZIP-317 fee. A distinctive fee narrows down which wallet ' +
          'software made this transaction and can connect it to others with the same quirk.',
        h: r.h,
      });
    }
  }

  // Turnstile amounts: a migration hides only among other migrations of the same amount.
  const sameAmount = new Map<number, number[]>();
  for (const c of crossings) sameAmount.set(c.amount, [...(sameAmount.get(c.amount) ?? []), c.h]);
  for (const c of crossings) {
    const n = sameAmount.get(c.amount)!.filter((h) => Math.abs(h - c.h) <= o.windowBlocks).length;
    const standard = isDenomination(c.amount);
    findings.push({
      kind: 'pool-crossing',
      severity: n === 1 ? 'medium' : n <= 10 ? 'low' : 'info',
      txids: [c.txid],
      title: `Exact amount revealed moving ${c.from} → ${c.to}: ${fmtZec(c.amount)}`,
      detail:
        'Moving value between shielded pools passes through a public turnstile, so the exact amount is visible. ' +
        (n === 1
          ? 'No other move of this amount happened nearby: it acts as a fingerprint that later amounts can be matched against.'
          : `${n} moves of this amount happened within the window, so it blends in` +
            (standard ? ' (it is a standard ZIP-318 denomination).' : '.')),
      anonymitySet: n,
      amount: c.amount,
      h: c.h,
    });
  }

  // Amount correlation: for each withdrawal, which earlier deposits could it be?
  const ins = events.filter((e) => e.dir === 'in').sort((a, b) => a.amount - b.amount);
  const outSets: Analysis['outSets'] = [];
  for (const out of events) {
    if (out.dir !== 'out') continue;
    const candidates: ValueEvent[] = [];
    // ins sorted by amount: scan [out.amount, out.amount + maxFeeGap].
    let lo = 0, hi = ins.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ins[mid].amount < out.amount) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < ins.length && ins[i].amount <= out.amount + o.maxFeeGap; i++) {
      const cand = ins[i];
      if (cand.txid === out.txid || cand.h >= out.h || out.h - cand.h > o.windowBlocks) continue;
      if (cand.to !== out.from) continue;
      if (depositMatches(cand.amount, out, o.maxFeeGap)) candidates.push(cand);
    }
    if (candidates.length === 0) continue;
    outSets.push({ event: out, candidates });
    // Only a single plausible source is a link; with several, the observer is guessing.
    if (candidates.length !== 1) continue;
    const src = candidates[0];
    const blocks = out.h - src.h;
    const tier = linkTier(blocks, out.amount);
    if (!tier) continue;
    const t = CALIBRATION[tier];
    findings.push({
      kind: blocks <= 100 ? 'quick-roundtrip' : 'amount-link',
      severity: t.severity,
      txids: [src.txid, out.txid],
      title: `Withdrawal of ${fmtZec(out.amount)} matches exactly one earlier deposit (${blocks} blocks before)`,
      detail:
        `Only one value entered the ${out.from} pool in the previous ${Math.round(o.windowBlocks / 1152)} days ` +
        `that equals this withdrawal plus its own fee. Measured on mainnet, links of this kind ` +
        `(${t.label}) are right about ${t.precision}% of the time — no cryptography is broken, only amounts are matched.`,
      anonymitySet: 1,
      amount: out.amount,
      h: out.h,
    });
  }

  return { findings, events, outSets };
}
