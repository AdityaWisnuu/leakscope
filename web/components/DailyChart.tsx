'use client';
import { useState } from 'react';
import { fmtDate, num, pct } from '@/lib/format';
import type { Day } from '@/lib/types';

const W = 640, H = 240, PAD = { l: 40, r: 8, t: 12, b: 26 };

interface Mark {
  from: number;
  to: number;
  label: string;
}

/**
 * The early-September spike, as measured from the raw transactions (blocks ~3,470,300–3,470,960,
 * 3 Sep 2026 09:13–22:42 UTC): ~8,500 two-action Ironwood-only transactions in 13 hours versus
 * ~11 an hour the day before, ~5,500 shieldings into Ironwood (19x normal), 1,548 of them
 * (~3,000 ZEC, ~1,500 distinct amounts) funded from one transparent address.
 */
const BURST: Mark = { from: 36, to: 37, label: 'BURST · 3 SEP' };
const BURST_ADDR = 't1KfwsnwJeNRVjQGBDZhwKskpQbih2qx5Ua';

function ticks(max: number) {
  const step = 10 ** Math.floor(Math.log10(Math.max(1, max)));
  const s = max / step > 5 ? step * 2 : max / step > 2 ? step : step / 2;
  const out: number[] = [];
  for (let v = 0; v <= max; v += s) out.push(Math.round(v));
  return out;
}

function Bars({
  days,
  series,
  label,
  onHover,
  active,
  marks = [],
}: {
  days: Day[];
  series: { key: string; color: string; get: (d: Day) => number }[];
  label: string;
  onHover: (i: number | null) => void;
  active: number | null;
  marks?: Mark[];
}) {
  const totals = days.map((d) => series.reduce((s, x) => s + x.get(d), 0));
  const max = Math.max(1, ...totals) * 1.08;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const bw = iw / days.length;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const every = Math.ceil(days.length / 8);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => onHover(null)}>
      {ticks(max).map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end">
            {t >= 1000 ? `${t / 1000}k` : t}
          </text>
        </g>
      ))}
      {marks.map((m) => {
        const i0 = days.findIndex((d) => d.day === m.from);
        const i1 = days.findIndex((d) => d.day === m.to);
        if (i0 < 0 || i1 < 0) return null;
        const x0 = PAD.l + i0 * bw, x1 = PAD.l + (i1 + 1) * bw;
        return (
          <g key={m.label} className="mark">
            <rect x={x0} y={PAD.t} width={x1 - x0} height={ih} fill="rgba(255,90,44,0.07)" stroke="rgba(255,90,44,0.5)" strokeDasharray="3 3" />
            <text x={x0 - 4} y={PAD.t + 10} textAnchor="end" style={{ fill: 'var(--accent-ink, #ff8a66)' }}>
              {m.label}
            </text>
          </g>
        );
      })}
      {days.map((d, i) => {
        let acc = 0;
        const x = PAD.l + i * bw + Math.min(2, bw * 0.15);
        const w = Math.max(1, bw - Math.min(4, bw * 0.3));
        return (
          <g key={d.day} opacity={active == null || active === i ? 1 : 0.45}>
            {series.map((s) => {
              const v = s.get(d);
              const y0 = y(acc), y1 = y(acc + v);
              acc += v;
              return <rect key={s.key} x={x} y={y1} width={w} height={Math.max(0, y0 - y1)} fill={s.color} />;
            })}
            {i % every === 0 && (
              <text x={x + w / 2} y={H - 8} textAnchor="middle" className={(i / every) % 2 ? 'x-odd' : undefined}>
                {fmtDate(d.time).slice(0, 6).toUpperCase()}
              </text>
            )}
            <rect className="bar-hit" x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} onPointerEnter={() => onHover(i)} />
          </g>
        );
      })}
    </svg>
  );
}

export function DailyChart({ days }: { days: Day[] }) {
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const da = a != null ? days[a] : null;
  const db = b != null ? days[b] : null;
  return (
    <div className="chart-grid">
      <figure className="panel" style={{ margin: 0 }}>
        <div className="panel-head">
          <span className="label">
            Fig. 02 — <b>Withdrawals per day</b>
          </span>
          <span className="label">
            <i className="sw" style={{ background: 'var(--accent)', borderRadius: 0, marginRight: 6 }} />
            amount matches exactly one deposit
          </span>
        </div>
        <div className="panel-body">
          <p className="chart-readout" aria-live="polite">
            {da ? (
              <>
                <span className="mono">{fmtDate(da.time)}</span> — {num(da.deshields)} deshielding txs,{' '}
                <span className="accent">{num(da.linkedOuts)}</span> ({pct(da.linkedOuts, da.deshields).toFixed(1)}%) point
                back to a single deposit.
                {da.day >= BURST.from && da.day <= BURST.to && <> Part of the 3 Sep burst (see note below).</>}
              </>
            ) : (
              'Hover or tap a day.'
            )}
          </p>
          <Bars
            days={days}
            label="Deshielding transactions per day, with the share whose amount matches exactly one earlier deposit"
            active={a}
            onHover={setA}
            marks={[BURST]}
            series={[
              { key: 'linked', color: '#ff5a2c', get: (d) => d.linkedOuts },
              { key: 'rest', color: '#3a423f', get: (d) => Math.max(0, d.deshields - d.linkedOuts) },
            ]}
          />
        </div>
      </figure>
      <figure className="panel" style={{ margin: 0 }}>
        <div className="panel-head">
          <span className="label">
            Fig. 03 — <b>Shielded actions per day</b>
          </span>
          <span className="label">
            <i className="sw" style={{ background: '#a9c3cc', marginRight: 4 }} /> IW{' '}
            <i className="sw" style={{ background: '#b3a47f', margin: '0 4px 0 8px' }} /> ORC{' '}
            <i className="sw" style={{ background: '#86a596', margin: '0 4px 0 8px' }} /> SAP
          </span>
        </div>
        <div className="panel-body">
          <p className="chart-readout" aria-live="polite">
            {db ? (
              <>
                <span className="mono">{fmtDate(db.time)}</span> — Ironwood {num(db.actions.ironwood)}, Orchard{' '}
                {num(db.actions.orchard)}, Sapling {num(db.actions.sapling)} actions.
                {db.day >= BURST.from && db.day <= BURST.to && <> Part of the 3 Sep burst (see note below).</>}
              </>
            ) : (
              'Orchard drains, Ironwood fills. Hover or tap a day.'
            )}
          </p>
          <Bars
            days={days}
            label="Shielded actions per day by pool"
            active={b}
            onHover={setB}
            marks={[BURST]}
            series={[
              { key: 'iw', color: '#a9c3cc', get: (d) => d.actions.ironwood },
              { key: 'orc', color: '#b3a47f', get: (d) => d.actions.orchard },
              { key: 'sap', color: '#86a596', get: (d) => d.actions.sapling },
            ]}
          />
        </div>
      </figure>
      <p className="chart-note small dim">
        <b className="accent">The 3 Sep burst.</b> In about 13 hours (09:00–23:00 UTC) the chain carried ~8,500
        two-action transactions that stayed entirely inside Ironwood, about 60 times the usual hourly rate, and ~5,500
        shieldings into Ironwood, 19 times normal. 1,548 of those shieldings (~3,000 ZEC in ~1,500 different amounts)
        were funded from a single transparent address, <span className="mono">{BURST_ADDR.slice(0, 10)}…{BURST_ADDR.slice(-4)}</span>.
        That looks like one automated operator, not a crowd; since its amounts don&rsquo;t repeat, it barely moves the
        amount-match counts. Activity rises again 14–22 Sep; we have not attributed that wave.
      </p>
      <div className="sr-only" style={{ left: 0, top: 0 }}>
      <table>
        <caption>Daily series</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Deshielding txs</th>
            <th>Linked to one deposit</th>
            <th>Shielding events</th>
            <th>Pool crossings</th>
            <th>Ironwood actions</th>
            <th>Orchard actions</th>
            <th>Sapling actions</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{fmtDate(d.time)}</td>
              <td>{d.deshields}</td>
              <td>{d.linkedOuts}</td>
              <td>{d.shields}</td>
              <td>{d.crossings}</td>
              <td>{d.actions.ironwood}</td>
              <td>{d.actions.orchard}</td>
              <td>{d.actions.sapling}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
