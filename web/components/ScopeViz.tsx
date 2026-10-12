'use client';
// The Observatory: every public boundary event as an observer sees it, and the threads the
// detectors can draw through the "opaque" shielded pools.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { DATA } from '@/lib/constants';
import { fmtDate, fmtDuration, heightToTime, num, zec } from '@/lib/format';
import { amountToBucket, unpack, type ScopePoints } from '@/lib/scopePack';
import type { Day, FindingKind, Link, LinkEnd, Pool } from '@/lib/types';
import { EXPLORER_NOTE, Sev, TxRef } from './Bits';
import { KIND_LABEL } from './FindingCard';

const POOL_COLOR: Record<Pool, string> = {
  transparent: '#ebe8e1',
  sapling: '#86a596',
  orchard: '#b3a47f',
  ironwood: '#a9c3cc',
};
const POOL_BY_CODE: Pool[] = ['transparent', 'sapling', 'orchard', 'ironwood'];
const ACCENT = '#ff5a2c';
const LINK_KINDS: FindingKind[] = ['utxo-roundtrip', 'quick-roundtrip', 'amount-link', 'address-reuse'];
const KIND_HELP: Partial<Record<FindingKind, string>> = {
  'utxo-roundtrip': 'The same coins left the shielded pool and came straight back in: the hop is visible on the transparent side.',
  'quick-roundtrip': 'The withdrawal equals exactly one recent deposit minus a standard fee, within 100 blocks.',
  'amount-link': 'The withdrawal equals exactly one deposit (minus a standard fee) in the 30-day window.',
  'address-reuse': 'A transparent address received a withdrawal and later shielded again.',
};

interface Layout {
  w: number;
  h: number;
  x0: number;
  x1: number;
  tIn: [number, number];
  tOut: [number, number];
  lanes: Record<'sapling' | 'orchard' | 'ironwood', [number, number]>;
  poolMid: number;
}

function makeLayout(w: number, h: number): Layout {
  const top = 30, bottom = h - 12;
  const H = bottom - top;
  const y = (f: number) => top + f * H;
  return {
    w, h,
    x0: 14,
    x1: w - 14,
    tIn: [y(0.02), y(0.27)],
    tOut: [y(0.73), y(0.98)],
    lanes: { sapling: [y(0.33), y(0.4)], orchard: [y(0.4), y(0.535)], ironwood: [y(0.535), y(0.67)] },
    poolMid: y(0.5),
  };
}

type Pt = { x: number; y: number };

export function ScopeViz({ days, from, to, flagship }: { days: Day[]; from: number; to: number; flagship?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const staticLayer = useRef<HTMLCanvasElement | null>(null);
  const sweep = useRef({ p: 0 });
  const geom = useRef<{ layout: Layout; ends: [Pt, Pt][]; samples: Pt[][] } | null>(null);

  const [points, setPoints] = useState<ScopePoints | null>(null);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Set<FindingKind>>(() => new Set(LINK_KINDS));
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Data: fetched after first paint, never blocking the headline.
  useEffect(() => {
    let dead = false;
    Promise.all([
      fetch('/scope.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`scope.bin ${r.status}`)))),
      fetch(`${DATA}/links.json`).then((r) => (r.ok ? (r.json() as Promise<Link[]>) : Promise.reject(new Error(`links ${r.status}`)))),
    ])
      .then(([buf, l]) => {
        if (dead) return;
        setPoints(unpack(buf));
        setLinks(l.sort((a, b) => a.b.h - b.b.h));
      })
      .catch((e) => !dead && setError(String(e.message ?? e)));
    return () => {
      dead = true;
    };
  }, []);

  // Size tracking.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(() => (links ?? []).map((l) => kinds.has(l.kind)), [links, kinds]);

  const xOf = useCallback((L: Layout, h: number) => L.x0 + ((h - from) / Math.max(1, to - from)) * (L.x1 - L.x0), [from, to]);

  const endPos = useCallback(
    (L: Layout, e: LinkEnd): Pt => {
      const x = xOf(L, e.h);
      const f = amountToBucket(e.amount) / 255;
      if (e.from === 'transparent') return { x, y: L.tIn[1] - f * (L.tIn[1] - L.tIn[0]) };
      if (e.to === 'transparent') return { x, y: L.tOut[0] + f * (L.tOut[1] - L.tOut[0]) };
      return { x, y: L.poolMid };
    },
    [xOf],
  );

  // Static layer: lanes, axis and every boundary event. Drawn once per size.
  useEffect(() => {
    if (!size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const L = makeLayout(size.w, size.h);
    const off = staticLayer.current ?? document.createElement('canvas');
    staticLayer.current = off;
    off.width = Math.round(size.w * dpr);
    off.height = Math.round(size.h * dpr);
    const c = off.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size.w, size.h);

    // Transparent bands.
    c.fillStyle = 'rgba(235,232,225,0.025)';
    c.fillRect(L.x0, L.tIn[0], L.x1 - L.x0, L.tIn[1] - L.tIn[0]);
    c.fillRect(L.x0, L.tOut[0], L.x1 - L.x0, L.tOut[1] - L.tOut[0]);
    // Pool lanes.
    for (const p of ['sapling', 'orchard', 'ironwood'] as const) {
      const [a, b] = L.lanes[p];
      c.fillStyle = POOL_COLOR[p] + '14';
      c.fillRect(L.x0, a, L.x1 - L.x0, b - a);
      if (p === 'orchard') {
        // Frozen: hatch it.
        c.save();
        c.beginPath();
        c.rect(L.x0, a, L.x1 - L.x0, b - a);
        c.clip();
        c.strokeStyle = 'rgba(179,164,127,0.09)';
        c.lineWidth = 1;
        for (let x = L.x0 - (b - a); x < L.x1; x += 7) {
          c.beginPath();
          c.moveTo(x, b);
          c.lineTo(x + (b - a), a);
          c.stroke();
        }
        c.restore();
      }
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.beginPath();
      c.moveTo(L.x0, a + 0.5);
      c.lineTo(L.x1, a + 0.5);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath();
    const [poolTop, poolBot] = [L.lanes.sapling[0], L.lanes.ironwood[1]];
    c.moveTo(L.x0, poolTop + 0.5);
    c.lineTo(L.x1, poolTop + 0.5);
    c.moveTo(L.x0, poolBot + 0.5);
    c.lineTo(L.x1, poolBot + 0.5);
    c.stroke();

    // Day ticks.
    c.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    c.textBaseline = 'alphabetic';
    const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(size.w / 90))));
    days.forEach((d, i) => {
      const x = Math.round(xOf(L, d.from)) + 0.5;
      c.strokeStyle = 'rgba(255,255,255,0.05)';
      c.beginPath();
      c.moveTo(x, 22);
      c.lineTo(x, L.tOut[1]);
      c.stroke();
      if (i % every === 0) {
        c.fillStyle = '#868c86';
        c.fillText(fmtDate(d.time).slice(0, 6).toUpperCase(), x + 4, 16);
      }
    });

    // Events.
    if (points) {
      const n = points.count;
      const r = n > 60_000 ? 1.1 : 1.7;
      for (let pool = 1; pool <= 3; pool++) {
        c.fillStyle = POOL_COLOR[POOL_BY_CODE[pool]];
        c.globalAlpha = n > 60_000 ? 0.45 : 0.7;
        for (let i = 0; i < n; i++) {
          const t = points.type[i];
          const colorPool = t === 1 ? points.from[i] : points.to[i];
          if (colorPool !== pool) continue;
          const x = xOf(L, points.h[i]);
          const f = points.bucket[i] / 255;
          let y: number;
          if (t === 0) y = L.tIn[1] - f * (L.tIn[1] - L.tIn[0]);
          else if (t === 1) y = L.tOut[0] + f * (L.tOut[1] - L.tOut[0]);
          else {
            const lane = L.lanes[POOL_BY_CODE[points.to[i]] as 'sapling' | 'orchard' | 'ironwood'];
            y = lane[1] - f * (lane[1] - lane[0]);
          }
          c.fillRect(x - r / 2, y - r / 2, r, r);
        }
      }
      c.globalAlpha = 1;
    }

    // Link geometry for drawing + hit testing.
    const ends: [Pt, Pt][] = [];
    const samples: Pt[][] = [];
    for (const l of links ?? []) {
      const a = endPos(L, l.a), b = endPos(L, l.b);
      ends.push([a, b]);
      const s: Pt[] = [];
      for (let k = 0; k <= 16; k++) s.push(bez(a, b, L.poolMid, k / 16));
      samples.push(s);
    }
    geom.current = { layout: L, ends, samples };

    const base = baseRef.current!, top = topRef.current!;
    for (const cv of [base, top]) {
      cv.width = off.width;
      cv.height = off.height;
    }
    drawBase();
    drawTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, points, links, days, xOf, endPos]);

  const drawBase = useCallback(() => {
    const base = baseRef.current, off = staticLayer.current;
    if (!base || !off) return;
    const c = base.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, base.width, base.height);
    const sx = Math.round(off.width * sweep.current.p);
    if (sx > 0) c.drawImage(off, 0, 0, sx, off.height, 0, 0, sx, off.height);
  }, []);

  const drawTop = useCallback(() => {
    const top = topRef.current, g = geom.current;
    if (!top || !g) return;
    const dpr = top.width / Math.max(1, g.layout.w);
    const c = top.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, top.width, top.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = g.layout;
    const sweepX = L.x0 + sweep.current.p * (L.w - L.x0);
    const list = links ?? [];
    const sel = hover?.i ?? pinned;
    c.lineWidth = 0.8;
    c.strokeStyle = ACCENT;
    // Keep thousands of threads legible: fainter as there are more of them.
    const k = Math.min(1, Math.sqrt(600 / Math.max(1, list.length)) * Math.min(1, Math.sqrt(L.w / 1300)));
    for (let i = 0; i < list.length; i++) {
      if (!visible[i] || i === sel) continue;
      const [a, b] = g.ends[i];
      if (Math.max(a.x, b.x) > sweepX) continue;
      const l = list[i];
      c.globalAlpha = k * (l.severity === 'critical' ? 0.32 : l.set === 1 ? 0.22 : 0.1);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.bezierCurveTo(a.x, L.poolMid, b.x, L.poolMid, b.x, b.y);
      c.stroke();
    }
    c.globalAlpha = 1;
    // Lane labels sit above the threads.
    const tag = (text: string, y: number, color: string) => {
      c.font = '10px "IBM Plex Mono", ui-monospace, monospace';
      const w = c.measureText(text).width;
      c.fillStyle = 'rgba(11,13,12,0.85)';
      c.fillRect(L.x0, y - 11, w + 12, 16);
      c.fillStyle = color;
      c.fillText(text, L.x0 + 6, y);
    };
    if (sweep.current.p > 0) {
      const narrow = L.w < 560;
      tag(narrow ? 'SHIELDING' : 'TRANSPARENT → POOL · SHIELDING · amount ↑', L.tIn[0] + 12, '#b0b4ae');
      tag('SAPLING', L.lanes.sapling[0] + 12, POOL_COLOR.sapling);
      tag(narrow ? 'ORCHARD · FROZEN' : 'ORCHARD · FROZEN, WITHDRAW-ONLY', L.lanes.orchard[0] + 12, POOL_COLOR.orchard);
      tag(narrow ? 'IRONWOOD' : 'IRONWOOD · since NU6.3 · pool-to-pool moves land here', L.lanes.ironwood[0] + 12, POOL_COLOR.ironwood);
      tag(narrow ? 'DESHIELDING' : 'POOL → TRANSPARENT · DESHIELDING · amount ↓', L.tOut[1] - 6, '#b0b4ae');
    }
    if (sel != null && g.ends[sel]) {
      const [a, b] = g.ends[sel];
      c.lineWidth = 2.25;
      c.strokeStyle = ACCENT;
      c.shadowColor = ACCENT;
      c.shadowBlur = 12;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.bezierCurveTo(a.x, L.poolMid, b.x, L.poolMid, b.x, b.y);
      c.stroke();
      c.shadowBlur = 0;
      for (const p of [a, b]) {
        c.beginPath();
        c.arc(p.x, p.y, 5, 0, Math.PI * 2);
        c.fillStyle = '#0b0d0c';
        c.fill();
        c.lineWidth = 1.5;
        c.stroke();
        c.beginPath();
        c.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        c.fillStyle = ACCENT;
        c.fill();
      }
    }
    // Scan line while sweeping.
    if (sweep.current.p < 1) {
      c.strokeStyle = ACCENT;
      c.globalAlpha = 0.9;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(sweepX, 22);
      c.lineTo(sweepX, L.h - 12);
      c.stroke();
      c.globalAlpha = 0.08;
      c.fillStyle = ACCENT;
      c.fillRect(sweepX - 40, 22, 40, L.h - 34);
      c.globalAlpha = 1;
    }
  }, [links, visible, hover, pinned]);

  // Intro sweep, once data is in.
  useEffect(() => {
    if (!points || !links || !size.w) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || sweep.current.p >= 1) {
      sweep.current.p = 1;
      drawBase();
      drawTop();
      return;
    }
    const tw = gsap.to(sweep.current, {
      p: 1,
      duration: 2.6,
      ease: 'power2.inOut',
      onUpdate: () => {
        drawBase();
        drawTop();
      },
    });
    return () => {
      tw.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, links, size.w > 0]);

  useEffect(() => {
    drawTop();
  }, [drawTop]);

  // Default: show a real, explorer-verified example.
  useEffect(() => {
    if (!links || pinned != null) return;
    let i = flagship ? links.findIndex((l) => l.a.txid.startsWith(flagship) || l.b.txid.startsWith(flagship)) : -1;
    if (i < 0) i = links.findIndex((l) => l.kind === 'quick-roundtrip');
    if (i >= 0) setPinned(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  const nearest = useCallback(
    (x: number, y: number, radius: number) => {
      const g = geom.current;
      if (!g) return null;
      let best = -1, bd = radius * radius;
      for (let i = 0; i < g.samples.length; i++) {
        if (!visible[i]) continue;
        for (const p of g.samples[i]) {
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
      return best >= 0 ? best : null;
    },
    [visible],
  );

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const i = nearest(x, y, 12);
    setHover(i == null ? null : { i, x, y });
  };
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = nearest(e.clientX - r.left, e.clientY - r.top, 22);
    if (i != null) setPinned(i);
  };
  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!links?.length) return;
    const order = links.map((_, i) => i).filter((i) => visible[i]);
    if (!order.length) return;
    const cur = order.indexOf(pinned ?? -1);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = order[(cur + 1) % order.length];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = order[(cur - 1 + order.length) % order.length];
    if (e.key === 'Home') next = order[0];
    if (e.key === 'End') next = order[order.length - 1];
    if (next != null) {
      e.preventDefault();
      setPinned(next);
    }
  };

  const toggle = (k: FindingKind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const counts = useMemo(() => {
    const m: Partial<Record<FindingKind, number>> = {};
    for (const l of links ?? []) m[l.kind] = (m[l.kind] ?? 0) + 1;
    return m;
  }, [links]);

  const sel = pinned != null && links ? links[pinned] : null;
  const hov = hover && links ? links[hover.i] : null;

  return (
    <figure className="panel scope" style={{ margin: 0 }}>
      <div className="panel-head">
        <span className="label">
          Fig. 01 — <b>Every public boundary event</b>, block {num(from)} → {num(to)}
        </span>
        <div className="scope-controls" role="group" aria-label="Show links of kind">
          {LINK_KINDS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={kinds.has(k)} onClick={() => toggle(k)}>
              <span className="sw line" style={{ background: ACCENT, opacity: kinds.has(k) ? 1 : 0.3 }} aria-hidden />
              {KIND_LABEL[k]} <span className="dim">{counts[k] ?? '–'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="scope-canvas-wrap" ref={wrapRef}>
        <canvas ref={baseRef} aria-hidden />
        <canvas
          ref={topRef}
          className="top"
          tabIndex={0}
          role="img"
          aria-label={`Boundary events and ${links?.length ?? 0} linked pairs. Use the arrow keys to step through linked pairs; details appear below.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={onClick}
          onKeyDown={onKey}
        />
        {!points && !error && (
          <div className="scope-loading mono small" aria-live="polite">
            loading boundary events…
          </div>
        )}
        {error && <div className="scope-loading mono small">Could not load the drawing data ({error}).</div>}
        {hov && hover && (
          <div
            className="tooltip"
            style={{
              left: Math.min(hover.x, (size.w || 0) - 320),
              top: hover.y > size.h * 0.6 ? hover.y - 140 : hover.y,
            }}
          >
            <div className="t">{hov.title}</div>
            <div className="mono dim">
              {zec(hov.a.amount)} → {zec(hov.b.amount)} ZEC · {fmtDuration(Math.max(0, hov.b.h - hov.a.h))} apart
            </div>
            <div className="dim" style={{ marginTop: 4 }}>
              Click to inspect
            </div>
          </div>
        )}
      </div>
      <div className="scope-legend" aria-hidden>
        <span>
          <i className="sw" style={{ background: POOL_COLOR.sapling }} /> Sapling
        </span>
        <span>
          <i className="sw" style={{ background: POOL_COLOR.orchard }} /> Orchard
        </span>
        <span>
          <i className="sw" style={{ background: POOL_COLOR.ironwood }} /> Ironwood
        </span>
        <span>
          <i className="sw line" style={{ background: ACCENT }} /> thread = a deposit and a withdrawal an observer can pair
        </span>
        <span className="dim">
          {points ? `${num(points.count)} events drawn${points.stride > 1 ? ` (1 in ${points.stride})` : ''}` : ''}
          {links ? ` · ${num(links.length)} threads` : ''}
        </span>
      </div>
      <figcaption className="sr-only">
        Shielding events are plotted above the pools, deshielding events below, moves between pools inside them. A
        thread joins two transactions an observer can link from public data alone.
      </figcaption>
      <div aria-live="polite">{sel && <Inspector l={sel} days={days} />}</div>
    </figure>
  );
}

function bez(a: Pt, b: Pt, midY: number, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * midY + 3 * u * t * t * midY + t * t * t * b.y,
  };
}

function endLabel(e: LinkEnd) {
  if (e.from === 'transparent') return `Shielded into ${e.to}`;
  if (e.to === 'transparent') return `Deshielded from ${e.from}`;
  return `${e.from} → ${e.to}`;
}

function Inspector({ l, days }: { l: Link; days: Day[] }) {
  const gap = l.b.h - l.a.h;
  const fee = l.a.amount - l.b.amount;
  return (
    <div className="inspector">
      <div className="inspector-title">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Sev s={l.severity} />
          <span className="label">{KIND_LABEL[l.kind]}</span>
          <span className="label">
            anonymity set <b>{l.set}</b>
          </span>
        </div>
        <span className="label">
          {fmtDuration(Math.max(0, gap))} apart{fee > 0 && fee <= 250_000 ? ` · differs by ${num(fee)} zat (a fee)` : ''}
        </span>
      </div>
      {[l.a, l.b].map((e, k) => (
        <div className="end" key={k}>
          <span className="label">
            {k === 0 ? 'A' : 'B'} · {endLabel(e)} · block {num(e.h)} · {fmtDate(heightToTime(days, e.h), true)}
          </span>
          <div className="amount">{zec(e.amount)} ZEC</div>
          <TxRef txid={e.txid} />
        </div>
      ))}
      <p className="small dim" style={{ gridColumn: '1 / -1', padding: '0 16px 16px', margin: 0 }}>
        {KIND_HELP[l.kind]} {EXPLORER_NOTE}
      </p>
    </div>
  );
}
