'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PrivacyNote, Sev } from '@/components/Bits';
import { BLOCK_SECONDS } from '@/lib/constants';
import { crowd, loadLocalChain, runPreflight, type LocalChain } from '@/lib/chain';
import { decompose, decomposeRandomized, isDenomination, schedule, type PreflightResult, type ScheduledPart } from '@/lib/engine';
import { num, zec } from '@/lib/format';
import type { Pool } from '@/lib/types';

const POOLS: { id: Pool; label: string }[] = [
  { id: 'transparent', label: 'Transp.' },
  { id: 'sapling', label: 'Sapling' },
  { id: 'orchard', label: 'Orchard' },
  { id: 'ironwood', label: 'Ironwood' },
];

function parseZec(s: string): number | null {
  const m = /^\s*(\d{0,9})(?:\.(\d{0,8}))?\s*$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  const z = Number(m[1] || '0') * 1e8 + Number((m[2] ?? '').padEnd(8, '0'));
  return z > 0 ? z : null;
}

const fmtClock = (d: Date) => d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function PlanClient({ tip, tipTime, eventCount, indexKB }: { tip: number; tipTime: number; eventCount: number; indexKB: number }) {
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
  const amountRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLocalChain().then(setChain, (e) => setLoadErr(String(e?.message ?? e)));
  }, []);

  const result: PreflightResult | null = useMemo(() => {
    if (!chain || !submitted) return null;
    return runPreflight(
      { from: submitted.from, to: submitted.to, amount: submitted.amount, toAddress: submitted.toAddr, fromAddresses: submitted.fromAddrs },
      chain,
    );
  }, [chain, submitted]);

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
      setErr('Enter an amount in ZEC, up to 8 decimals.');
      amountRef.current?.focus();
      return;
    }
    if (to === 'orchard' && from !== 'orchard') {
      setErr('Orchard is frozen since NU6.3: it can only be withdrawn from.');
      return;
    }
    setErr(null);
    setSubmitted({
      from,
      to,
      amount: z,
      toAddr: to === 'transparent' ? toAddr.trim() || undefined : undefined,
      fromAddrs: from === 'transparent' ? fromAddrs.split(/[\s,]+/).filter(Boolean) : [],
    });
    requestAnimationFrame(() => resultRef.current?.focus({ preventScroll: true }));
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" onClick={() => preset('orchard', 'ironwood', '37.2814')}>
              Migrate my Orchard balance
            </button>
            <button type="button" className="btn ghost sm" onClick={() => preset('ironwood', 'transparent', '12.5')}>
              Withdraw to an exchange
            </button>
            <button type="button" className="btn ghost sm" onClick={() => preset('transparent', 'ironwood', '5')}>
              Shield from an exchange
            </button>
          </div>
          <PoolPick legend="From" name="from" value={from} onChange={setFrom} />
          <PoolPick legend="To" name="to" value={to} onChange={setTo} disable={(p) => p === 'orchard' && from !== 'orchard'} />
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
            <span>Randomized ZIP-318 split (instead of the deterministic one)</span>
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
              ? `Could not load the event index: ${loadErr}`
              : chain
                ? `${num(chain.events)} public boundary events and ${num(chain.boundaryAddresses.size)} addresses loaded · tip ${num(chain.tip)}`
                : `Loading ${num(eventCount)} public boundary events (${indexKB} KB)…`}
          </p>
        </div>
      </form>

      <div className="stack">
        <PrivacyNote>
          <strong>Runs entirely in your browser.</strong> The page downloads the same public history for everyone,
          then judges your plan locally. Amounts and addresses you type are never sent anywhere.
        </PrivacyNote>
        <div ref={resultRef} tabIndex={-1} aria-live="polite" className="stack" style={{ outline: 'none' }}>
          {result && submitted ? (
            <Result r={result} amount={submitted.amount} plan={plan} onReshuffle={() => setSeed((s) => s + 1)} />
          ) : (
            <div className="empty">
              <h2>Before you broadcast.</h2>
              <p style={{ margin: 0 }}>
                Describe a transfer that crosses a pool boundary. Pre-flight tells you what will be public, how many
                recent transactions it would hide among, and how to do the same thing without the leak: a ZIP-318 split
                into standard amounts, spread over time.
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

function Result({
  r,
  amount,
  plan,
  onReshuffle,
}: {
  r: PreflightResult;
  amount: number;
  plan: { nowTip: number; residual: number; sched: ScheduledPart[]; crowd: Map<number, number> } | null;
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
              {r.anonymitySet == null
                ? 'Staying inside one pool keeps the amount encrypted.'
                : r.anonymitySet === 1
                  ? 'No other recent boundary event has this amount (allowing for fees). It would be unique.'
                  : `${num(r.anonymitySet - 1)} other recent boundary events share this amount, allowing for fees. An observer cannot tell them apart.`}
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
      {r.suggestions.map((s, i) => (
        <article key={i} className="finding">
          <div className="finding-top">
            <span className="label">Suggestion</span>
          </div>
          <h3>{s.title}</h3>
          <p style={{ margin: s.schedule ? '0 0 12px' : 0 }}>{s.detail}</p>
          {s.schedule && plan && <Timeline plan={plan} onReshuffle={onReshuffle} />}
        </article>
      ))}
    </>
  );
}

function Timeline({
  plan,
  onReshuffle,
}: {
  plan: { nowTip: number; residual: number; sched: ScheduledPart[]; crowd: Map<number, number> };
  onReshuffle: () => void;
}) {
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
      let row = rows.findIndex((end) => end < px - 4);
      if (row < 0) row = rows.length;
      rows[row] = px + 64;
      return { ...p, px, row };
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
          Schedule · from est. height <b>{num(nowTip)}</b> (now) · 75 s per block
        </span>
        <button type="button" className="btn ghost sm" onClick={onReshuffle}>
          Draw a new schedule
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 560 }} role="img" aria-label={`${sched.length} transfers spread over about ${Math.round(hours)} hours`}>
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
              <rect x={p.px - 2} y={y - 8} width={66} height={16} fill="var(--bg)" stroke="var(--line-2)" />
              <text x={p.px + 4} y={y + 3} style={{ fill: 'var(--ink)', fontSize: 10 }}>
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
              <span className="amt">{zec(p.amount)} ZEC</span>
              <span className="dim mono">
                #{num(p.height)} · {fmtClock(timeAt(p.height))}
              </span>
              <br />
              <span className="dim">crowd: {num(plan.crowd.get(p.amount) ?? 1)} recent look-alikes</span>
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
