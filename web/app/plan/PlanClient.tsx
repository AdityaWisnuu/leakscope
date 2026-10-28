'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PrivacyNote, Sev } from '@/components/Bits';
import { BLOCK_SECONDS } from '@/lib/constants';
import { crowd, loadBoundaryAddresses, loadLocalChain, runPreflight, type LocalChain } from '@/lib/chain';
import type { AddrSet } from '@/lib/addrSet';
import { decompose, decomposeRandomized, isDenomination, schedule, type PreflightResult, type ScheduledPart } from '@/lib/engine';
import { num, zec, zecRounded } from '@/lib/format';

/** Amount for reading: 10,000 rather than 10000, all decimals kept. */
const zecRead = (z: number) => zecRounded(z, 8);
import type { Pool } from '@/lib/types';

const POOLS: { id: Pool; label: string }[] = [
  { id: 'transparent', label: 'Transp.' },
  { id: 'sapling', label: 'Sapling' },
  { id: 'orchard', label: 'Orchard' },
  { id: 'ironwood', label: 'Ironwood' },
];

function parseZec(s: string): number | null {
  // Accept "1,5" as well as "1.5" (comma decimals), but not thousands separators like "1,000.5".
  const t = s.trim().replace(/\s*zec$/i, '');
  const norm = /^\d*,\d+$/.test(t) ? t.replace(',', '.') : t;
  const m = /^(\d{0,9})(?:\.(\d{0,8}))?$/.exec(norm);
  if (!m || (!m[1] && !m[2])) return null;
  const z = Number(m[1] || '0') * 1e8 + Number((m[2] ?? '').padEnd(8, '0'));
  return z > 0 ? z : null;
}

const fmtClock = (d: Date) => d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export function PlanClient({ tip, tipTime, indexKB }: { tip: number; tipTime: number; indexKB: number }) {
  const [chain, setChain] = useState<LocalChain | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [from, setFrom] = useState<Pool>('orchard');
  const [to, setTo] = useState<Pool>('ironwood');
  const [amount, setAmount] = useState('');
  const [toAddr, setToAddr] = useState('');
  const [fromAddrs, setFromAddrs] = useState('');
  const [randomized, setRandomized] = useState(false);
  const [seed, setSeed] = useState(0);
  const [submitted, setSubmitted] = useState<{ from: Pool; to: Pool; amount: number; toAddr?: string; fromAddrs: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addrSet, setAddrSet] = useState<AddrSet | null>(null);
  const [addrBusy, setAddrBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLocalChain().then(setChain, (e) => setLoadErr(String(e?.message ?? e)));
    // The boundary-address set is fetched on page load for every visitor, so the request says
    // nothing about whether (or when) someone typed an address.
    wantAddrs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result: PreflightResult | null = useMemo(() => {
    if (!chain || !submitted) return null;
    const needsAddrs = !!submitted.toAddr || submitted.fromAddrs.length > 0;
    if (needsAddrs && !addrSet) return null;
    return runPreflight(
      { from: submitted.from, to: submitted.to, amount: submitted.amount, toAddress: submitted.toAddr, fromAddresses: submitted.fromAddrs },
      addrSet ? { ...chain, boundaryAddresses: addrSet } : chain,
    );
  }, [chain, submitted, addrSet]);

  // The address set is only needed once an address is typed: fetch all of it then, never per address.
  const wantAddrs = () => {
    if (addrSet || addrBusy) return;
    setAddrBusy(true);
    loadBoundaryAddresses().then(setAddrSet, (e) => setLoadErr(`Could not load the address set: ${String(e?.message ?? e)}`)).finally(() => setAddrBusy(false));
  };

  // The schedule, re-anchored to today's estimated chain height rather than the index tip.
  const plan = useMemo(() => {
    if (!submitted || !chain || submitted.from === submitted.to || isDenomination(submitted.amount)) return null;
    const nowTip = tip + Math.max(0, Math.floor((Date.now() / 1000 - tipTime) / BLOCK_SECONDS));
    const { parts, residual } = randomized ? decomposeRandomized(submitted.amount) : decompose(submitted.amount);
    if (!parts.length) return null;
    const sched = schedule(parts, nowTip);
    return { nowTip, residual, sched, crowd: new Map(parts.map((p) => [p, crowd(chain, p)])) };
    // seed forces a fresh random draw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, chain, randomized, seed, tip, tipTime]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const z = parseZec(amount);
    if (z == null) {
      setSubmitted(null);
      setErr('Enter an amount like 7.7 or 12.3456 ZEC (up to 8 decimals).');
      amountRef.current?.focus();
      return;
    }
    if (to === 'orchard' && from !== 'orchard') {
      setSubmitted(null);
      setErr('Orchard is frozen since NU6.3: you can only move funds out of it.');
      return;
    }
    setErr(null);
    const next = {
      from,
      to,
      amount: z,
      toAddr: to === 'transparent' ? toAddr.trim() || undefined : undefined,
      fromAddrs: from === 'transparent' ? fromAddrs.split(/[\s,]+/).filter(Boolean) : [],
    };
    if (next.toAddr || next.fromAddrs.length) wantAddrs();
    setSubmitted(next);
    // On narrow screens the result sits below the form: bring it into view.
    requestAnimationFrame(() => {
      const el = resultRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.6 || r.top < 0) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    });
  };

  const preset = (f: Pool, t: Pool, amt: string) => {
    setFrom(f);
    setTo(t);
    if (!amount) setAmount(amt);
    requestAnimationFrame(() => amountRef.current?.focus());
  };

  return (
    <div className="tool-grid">
      <form className="panel" onSubmit={submit} noValidate>
        <div className="panel-head">
          <span className="label">
            Planned transfer · <b>nothing is sent</b>
          </span>
        </div>
        <div className="panel-body form-stack">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Common transfers">
            {(
              [
                ['ironwood', 'transparent', '12.5', 'Withdraw to an exchange'],
                ['transparent', 'ironwood', '5', 'Shield from an exchange'],
                ['orchard', 'ironwood', '37.2814', 'Migrate my Orchard balance'],
              ] as const
            ).map(([f, t, amt, label]) => {
              const on = from === f && to === t;
              return (
                <button key={label} type="button" className={`btn sm${on ? '' : ' ghost'}`} aria-pressed={on} onClick={() => preset(f, t, amt)}>
                  {label}
                </button>
              );
            })}
          </div>
          <PoolPick legend="From" name="from" value={from} onChange={setFrom} />
          <PoolPick legend="To" name="to" value={to} onChange={setTo} disable={(p) => p === 'orchard' && from !== 'orchard'} />
          <p className="hint small dim" style={{ margin: '-8px 0 0' }}>
            Transp. = a public transparent (t1…) address, such as an exchange. Orchard is frozen: you can only move funds
            out of it.
          </p>
          <label className="field">
            <span>Amount (ZEC)</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 37.2814"
              aria-invalid={!!err}
              aria-describedby="amount-err"
            />
          </label>
          {to === 'transparent' && (
            <label className="field">
              <span>Destination t-address (optional)</span>
              <input type="text" value={toAddr} onChange={(e) => setToAddr(e.target.value)} placeholder="t1…" spellCheck={false} autoComplete="off" />
              <span className="hint">Checked against every address seen at a pool boundary.</span>
            </label>
          )}
          {from === 'transparent' && (
            <label className="field">
              <span>Source t-addresses (optional)</span>
              <textarea value={fromAddrs} onChange={(e) => setFromAddrs(e.target.value)} placeholder="t1… t1…" spellCheck={false} autoComplete="off" rows={2} />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={randomized} onChange={(e) => setRandomized(e.target.checked)} />
            <span>Shuffle the split (harder to predict than the standard digit-by-digit one)</span>
          </label>
          {err && (
            <p id="amount-err" role="alert" className="small" style={{ color: 'var(--accent-ink)', margin: 0 }}>
              {err}
            </p>
          )}
          <button className="btn" type="submit" disabled={!chain}>
            {chain ? 'Run pre-flight' : 'Loading chain history…'}
          </button>
          <p className="status" style={{ margin: 0 }} aria-live="polite">
            {loadErr
              ? loadErr.startsWith('Could not') ? loadErr : `Could not load the event index: ${loadErr}`
              : chain
                ? `${num(chain.events)} boundary events from the last 30 days loaded · tip ${num(chain.tip)}` +
                  (addrSet ? ` · ${num(addrSet.size)} boundary addresses` : addrBusy ? ' · loading address set…' : '')
                : `Loading recent public boundary events (${indexKB} KB)…`}
          </p>
        </div>
      </form>

      <div className="stack">
        <PrivacyNote>
          <strong>Runs entirely in your browser.</strong> The page downloads the same public history for everyone,
          including the full list of boundary addresses, then judges your plan locally. Amounts and addresses you type
          are never sent anywhere.
        </PrivacyNote>
        <div ref={resultRef} tabIndex={-1} aria-live="polite" className="stack" style={{ outline: 'none', scrollMarginTop: 96 }}>
          {submitted && !result && chain && addrBusy ? (
            <div className="empty">
              <p style={{ margin: 0 }}>Checking addresses against the boundary set…</p>
            </div>
          ) : result && submitted ? (
            <Result r={result} amount={submitted.amount} plan={plan} to={submitted.to} onReshuffle={() => setSeed((s) => s + 1)} />
          ) : (
            <div className="empty">
              <h2>Before you broadcast.</h2>
              <p style={{ margin: 0 }}>
                Describe a transfer that crosses a pool boundary. Pre-flight tells you what will be public, how many
                recent transactions it would hide among, and how to do the same thing without the leak: a ZIP-318 split
                into standard amounts, spread over time. ZIP 318 is a Zcash standard: everyone uses the same set of
                amounts (1, 2, 5, 10… ZEC), so no single transfer stands out.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PoolPick({ legend, name, value, onChange, disable }: { legend: string; name: string; value: Pool; onChange: (p: Pool) => void; disable?: (p: Pool) => boolean }) {
  return (
    <fieldset className="pool-pick field">
      <legend>{legend}</legend>
      {POOLS.map((p) => (
        <label key={p.id}>
          <input type="radio" name={name} value={p.id} checked={value === p.id} disabled={disable?.(p.id)} onChange={() => onChange(p.id)} />
          <span>{p.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function verdict(score: number, revealsAmount: boolean) {
  if (!revealsAmount && score === 100) return 'Nothing about the amount becomes public.';
  if (score <= 10) return 'An observer can link this.';
  if (score <= 25) return 'Easy to single out.';
  if (score <= 50) return 'Hides in a small crowd.';
  if (score <= 75) return 'Hides in a fair crowd.';
  return 'Blends in.';
}

function Gauge({ score }: { score: number }) {
  const R = 84, cx = 100, cy = 100;
  const a = (v: number) => Math.PI * (1 - v / 100);
  const pt = (v: number, r = R) => [cx + r * Math.cos(a(v)), cy - r * Math.sin(a(v))];
  const [ex, ey] = pt(score);
  const bad = score < 50;
  return (
    <svg className="gauge" viewBox="0 0 200 120" role="img" aria-label={`Privacy score ${score} out of 100`}>
      <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="var(--line-2)" strokeWidth="10" />
      {score > 0 && (
        <path
          d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${ex} ${ey}`}
          fill="none"
          stroke={bad ? 'var(--accent)' : 'var(--ink)'}
          strokeWidth="10"
        />
      )}
      {[0, 25, 50, 75, 100].map((v) => {
        const [x1, y1] = pt(v, R + 9), [x2, y2] = pt(v, R + 14);
        return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-3)" />;
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="44" fill={bad ? 'var(--accent)' : 'var(--ink)'}>
        {score}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="var(--ink-3)" letterSpacing="1.5">
        PRIVACY SCORE / 100
      </text>
    </svg>
  );
}

type PlanView = { nowTip: number; residual: number; sched: ScheduledPart[]; crowd: Map<number, number> };

/** Plain-language line under the gauge. Never claims "cannot tell them apart" for a small crowd. */
function crowdText(set: number | null) {
  if (set == null) return 'Staying inside one pool keeps the amount encrypted.';
  const others = set - 1;
  if (others === 0) return 'No other recent boundary event has this amount (allowing for fees). It would be unique.';
  if (set < 10)
    return `Only ${plural(others, 'other recent transfer')} used this amount (allowing for fees), so an observer has just ${num(set)} candidates to choose from.`;
  return `${plural(others, 'other recent boundary event')} share this amount, allowing for fees. An observer cannot easily tell them apart.`;
}

function Result({
  r,
  amount,
  plan,
  to,
  onReshuffle,
}: {
  r: PreflightResult;
  amount: number;
  to: Pool;
  plan: PlanView | null;
  onReshuffle: () => void;
}) {
  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <span className="label">
            Pre-flight · <b>{zec(amount)} ZEC</b>
          </span>
          {r.anonymitySet != null && (
            <span className="label">
              anonymity set <b className="num">{num(r.anonymitySet)}</b>
            </span>
          )}
        </div>
        <div className="panel-body gauge-row">
          <Gauge score={r.score} />
          <div>
            <p className="verdict">{verdict(r.score, r.revealsAmount)}</p>
            <p className="ink2" style={{ margin: 0 }}>
              {crowdText(r.anonymitySet)}
            </p>
          </div>
        </div>
      </div>
      {r.warnings.map((w, i) => (
        <article key={i} className={`finding s-${w.severity}`}>
          <div className="finding-top">
            <Sev s={w.severity} />
          </div>
          <h3>{w.title}</h3>
          <p style={{ margin: 0 }}>{w.detail}</p>
        </article>
      ))}
      {r.suggestions.map((s, i) =>
        s.schedule && plan ? (
          <SplitCard key={i} plan={plan} exactSet={r.anonymitySet ?? 1} to={to} onReshuffle={onReshuffle} />
        ) : (
          <article key={i} className="finding">
            <div className="finding-top">
              <span className="label">Suggestion</span>
            </div>
            <h3>{s.title}</h3>
            <p style={{ margin: 0 }}>{s.detail}</p>
          </article>
        ),
      )}
    </>
  );
}

/**
 * The ZIP-318 split, written here rather than taken from the engine's text so the numbers match
 * the schedule actually shown (which may be the shuffled split), and so a split that does not
 * help is called what it is.
 */
function SplitCard({ plan, exactSet, to, onReshuffle }: { plan: PlanView; exactSet: number; to: Pool; onReshuffle: () => void }) {
  const parts = plan.sched.map((p) => p.amount);
  const crowds = parts.map((p) => plan.crowd.get(p) ?? 1);
  const minSet = Math.min(...crowds);
  const weakest = parts[crowds.indexOf(minSet)];
  const helps = minSet > exactSet;
  const n = parts.length;
  if (!helps) {
    return (
      <article className="finding">
        <div className="finding-top">
          <span className="label">Suggestion</span>
        </div>
        <h3>Splitting won&apos;t hide this amount.</h3>
        <p style={{ margin: 0 }}>
          A ZIP-318 split would need a {zecRead(weakest)} ZEC piece, and{' '}
          {minSet <= 1 ? 'no one else' : `only ${plural(minSet - 1, 'other transfer')}`} moved that amount recently, so
          the parts would stand out about as much as the whole. Consider spreading it over several days in smaller
          standard amounts (1, 2, 5, 10… ZEC), or accept that this transfer will be visible.
        </p>
      </article>
    );
  }
  return (
    <article className="finding">
      <div className="finding-top">
        <span className="label">Suggestion</span>
      </div>
      <h3>Split into {plural(n, 'standard ZIP-318 amount')}, spread over time</h3>
      <p>
        {parts
          .slice()
          .sort((a, b) => b - a)
          .map((p) => zecRead(p))
          .join(' + ')}{' '}
        ZEC. Standard amounts are shared by every wallet that follows ZIP 318: the smallest crowd among these parts is{' '}
        {num(minSet)}, versus {num(exactSet)} for the exact amount. Sending them at random, spaced-out times (about 82
        minutes apart on average) breaks the timing link too.
      </p>
      <div className="callout">
        <p>
          <strong>How to do this in your wallet:</strong> send the amounts below as separate transactions
          {to === 'transparent' ? ', each to a fresh address,' : ''} roughly at the times shown. Don&apos;t send them all
          at once; spacing them out is half the protection. Wallets that support ZIP 318 natively can do this for you.
        </p>
      </div>
      <Timeline plan={plan} onReshuffle={onReshuffle} />
    </article>
  );
}

function Timeline({ plan, onReshuffle }: { plan: PlanView; onReshuffle: () => void }) {
  const { sched, nowTip } = plan;
  const now = Date.now();
  const timeAt = (h: number) => new Date(now + (h - nowTip) * BLOCK_SECONDS * 1000);
  const h0 = nowTip, h1 = Math.max(...sched.map((p) => p.height)) + 20;
  const W = 640, PADX = 16;
  const x = (h: number) => PADX + ((h - h0) / Math.max(1, h1 - h0)) * (W - 2 * PADX);
  // Stack chips into rows so labels never collide.
  const rows: number[] = [];
  const placed = [...sched]
    .sort((a, b) => a.height - b.height)
    .map((p) => {
      const px = x(p.height);
      const cx = Math.min(px - 2, W - 67); // where the label box actually starts
      let row = rows.findIndex((end) => end < cx - 4);
      if (row < 0) row = rows.length;
      rows[row] = cx + 66;
      return { ...p, px, cx, row };
    });
  const H = 56 + rows.length * 22;
  const hours = ((h1 - h0) * BLOCK_SECONDS) / 3600;
  const stepH = hours > 48 ? 12 : hours > 16 ? 4 : hours > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= hours; t += stepH) ticks.push(t);
  return (
    <div className="timeline">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="label">
          Schedule · starting now (est. block <b>{num(nowTip)}</b>) · times in your time zone
        </span>
        <button type="button" className="btn ghost sm" onClick={onReshuffle}>
          Draw a new schedule
        </button>
      </div>
      <div className="timeline-svg">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${sched.length} transfers spread over about ${Math.round(hours)} hours`}>
        <line x1={PADX} x2={W - PADX} y1={24} y2={24} stroke="var(--line-2)" />
        {ticks.map((t) => {
          const tx = x(h0 + (t * 3600) / BLOCK_SECONDS);
          return (
            <g key={t}>
              <line x1={tx} x2={tx} y1={20} y2={28} stroke="var(--ink-3)" />
              <text x={tx} y={12} textAnchor="middle">
                {t === 0 ? 'now' : `+${t}h`}
              </text>
            </g>
          );
        })}
        {placed.map((p, i) => {
          const y = 48 + p.row * 22;
          return (
            <g key={i}>
              <line x1={p.px} x2={p.px} y1={24} y2={y - 8} stroke="var(--accent)" strokeOpacity="0.5" />
              <circle cx={p.px} cy={24} r={3} fill="var(--accent)" />
              <rect x={p.cx} y={y - 8} width={66} height={16} fill="var(--bg)" stroke="var(--line-2)" />
              <text x={p.cx + 6} y={y + 3} style={{ fill: 'var(--ink)', fontSize: 10 }}>
                {zec(p.amount)}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <ol className="parts" style={{ listStyle: 'none', padding: 0 }}>
        {[...sched]
          .sort((a, b) => a.height - b.height)
          .map((p, i) => (
            <li key={i} className="part">
              <span className="amt">{zecRead(p.amount)} ZEC</span>
              <span className="dim mono">
                #{num(p.height)} · {fmtClock(timeAt(p.height))}
              </span>
              <br />
              <span className="dim">
                hides among {plural((plan.crowd.get(p.amount) ?? 1) - 1, 'recent look-alike')}
              </span>
            </li>
          ))}
      </ol>
      {plan.residual > 0 && (
        <p className="small dim" style={{ margin: '10px 0 0' }}>
          {zec(plan.residual)} ZEC is below the smallest denomination (0.01) and stays where it is.
        </p>
      )}
    </div>
  );
}
