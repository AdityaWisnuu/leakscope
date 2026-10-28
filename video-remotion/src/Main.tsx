import React from 'react';
import {
  AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadSans } from '@remotion/google-fonts/IBMPlexSans';
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono';
import N from './narration.json';
import REC from './rec-timeline.json';
import { buildTimeline, FPS } from './timeline.js';

const serif = loadSerif('normal', { weights: ['400'] }).fontFamily;
loadSerif('italic', { weights: ['400'] });
const sans = loadSans('normal', { weights: ['400', '500', '600'] }).fontFamily;
const mono = loadMono('normal', { weights: ['400', '500'] }).fontFamily;

export const TL = buildTimeline(N as any, REC as any);

const C = {
  bg: '#0b0d0c', bg1: '#101312', bg2: '#151918', line: '#232927', line2: '#323a37',
  ink: '#ebe8e1', ink2: '#b0b4ae', ink3: '#868c86', accent: '#ff5a2c', accentInk: '#ff7a55',
  dim: 'rgba(255,90,44,0.14)', sage: '#86a596', ironwood: '#a9c3cc',
};
const ease = Easing.bezier(0.2, 0.7, 0.1, 1);
const f = (s: number) => Math.round(s * FPS);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ramp = (frame: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(frame, [f(a), f(b)], [from, to], { ...clamp, easing: ease });

// ---------- shared pieces ----------
const Backdrop: React.FC<{ glow?: [number, number] }> = ({ glow = [70, 30] }) => {
  const frame = useCurrentFrame();
  const gx = glow[0] + Math.sin(frame / 90) * 6, gy = glow[1] + Math.cos(frame / 110) * 5;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px)`,
        backgroundSize: '48px 48px', backgroundPosition: `0 ${-(frame * 0.25) % 48}px`,
      }} />
      <AbsoluteFill style={{ background: `radial-gradient(900px 600px at ${gx}% ${gy}%, rgba(255,90,44,.10), transparent 70%)` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.55) 100%)' }} />
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{ children: React.ReactNode; delay?: number; style?: React.CSSProperties }> = ({ children, delay = 0.1, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', left: 110, top: 78, fontFamily: mono, fontSize: 20, letterSpacing: '0.24em', color: C.accentInk,
      opacity: ramp(frame, delay, delay + 0.6), transform: `translateX(${ramp(frame, delay, delay + 0.8, -20, 0)}px)`,
      display: 'flex', alignItems: 'center', gap: 14, ...style,
    }}>
      <span style={{ width: 28, height: 2, background: C.accent, display: 'inline-block' }} />{children}
    </div>
  );
};

// Lower-third caption: one per narration line, timed relative to the scene start.
const Captions: React.FC<{ lines: any[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const l = lines.find((x) => t >= x.rel - 0.05 && t < x.rel + x.dur + 0.3);
  if (!l) return null;
  const a = Math.min(ramp(frame, l.rel - 0.05, l.rel + 0.25), 1 - ramp(frame, l.rel + l.dur + 0.05, l.rel + l.dur + 0.3));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 52, display: 'flex', justifyContent: 'center', opacity: a }}>
      <div style={{
        maxWidth: 1380, padding: '16px 30px 17px 26px', background: 'rgba(9,11,10,.90)', border: '1px solid rgba(255,255,255,.08)',
        borderLeft: `4px solid ${C.accent}`, color: '#f2efe8', fontFamily: sans, fontWeight: 500, fontSize: 31, lineHeight: 1.38,
        boxShadow: '0 14px 44px rgba(0,0,0,.55)', transform: `translateY(${(1 - a) * 10}px)`,
      }}>{l.text}</div>
    </div>
  );
};

const SceneFade: React.FC<{ dur: number; children: React.ReactNode; inS?: number; outS?: number }> = ({ dur, children, inS = 0.35, outS = 0.3 }) => {
  const frame = useCurrentFrame();
  const o = Math.min(ramp(frame, 0, inS), 1 - ramp(frame, dur - outS, dur));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const Words: React.FC<{ text: string; at: number; step?: number; style?: React.CSSProperties; wordStyle?: (i: number) => React.CSSProperties }> = ({ text, at, step = 0.09, style, wordStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={style}>
      {text.split(' ').map((w, i) => {
        const s = spring({ frame: frame - f(at + i * step), fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
        return (
          <span key={i} style={{
            display: 'inline-block', marginRight: '0.24em', opacity: s, transform: `translateY(${(1 - s) * 50}px)`,
            filter: `blur(${(1 - s) * 10}px)`, ...(wordStyle ? wordStyle(i) : {}),
          }}>{w}</span>
        );
      })}
    </div>
  );
};

const Logo: React.FC<{ size?: number; spin?: number }> = ({ size = 40, spin = 0 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" style={{ transform: `rotate(${spin}deg)` }}>
    <circle cx="20" cy="20" r="13" fill="none" stroke={C.ink} strokeWidth="2" />
    <circle cx="20" cy="20" r="3.5" fill={C.accent} />
    {[0, 90, 180, 270].map((a) => (
      <line key={a} x1="20" y1="1" x2="20" y2="9" stroke={C.ink} strokeWidth="2" transform={`rotate(${a} 20 20)`} />
    ))}
  </svg>
);

// ---------- 1. intro ----------
const Intro: React.FC<{ s: any }> = ({ s }) => {
  const frame = useCurrentFrame();
  const [l0, l1] = s.lines;
  const lineW = ramp(frame, l1.rel + 1.2, l1.rel + 2.4, 0, 1);
  return (
    <AbsoluteFill>
      <Backdrop glow={[75, 25]} />
      <div style={{ position: 'absolute', left: 110, top: 72, display: 'flex', alignItems: 'center', gap: 16, opacity: ramp(frame, 0, 0.6) }}>
        <Logo size={38} spin={frame * 0.6} />
        <span style={{ fontFamily: mono, fontSize: 22, letterSpacing: '0.28em', color: C.ink }}>LEAKSCOPE</span>
        <span style={{ fontFamily: mono, fontSize: 18, letterSpacing: '0.2em', color: C.ink3, marginLeft: 18 }}>ZCASH PRIVACY · ZECATHON 2026</span>
      </div>
      <div style={{ position: 'absolute', left: 110, top: 300, right: 110 }}>
        <Words text="The vault is safe." at={l0.rel + 1.0} step={0.12}
          style={{ fontFamily: serif, fontSize: 196, lineHeight: 1.0, color: C.ink, letterSpacing: '-0.01em' }} />
        <Words text="The doors leak." at={l1.rel + 0.9} step={0.16}
          style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 196, lineHeight: 1.08, color: C.accent, letterSpacing: '-0.01em' }} />
        <div style={{ height: 3, width: `${lineW * 1200}px`, background: `linear-gradient(90deg, ${C.accent}, rgba(255,90,44,0))`, marginTop: 36 }} />
        <div style={{ fontFamily: mono, fontSize: 24, color: C.ink2, marginTop: 26, opacity: ramp(frame, l1.rel + 1.8, l1.rel + 2.5), letterSpacing: '0.04em' }}>
          shielding · deshielding · pool crossings <span style={{ color: C.ink }}>→ exact amount, address and time, public</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 2. the leak ----------
const Tag: React.FC<{ x: number; y: number; label: string; amount: string; hi: [number, number]; on: number; hl: number; sub: string }> = ({ x, y, label, amount, hi, on, hl, sub }) => {
  const a = amount.slice(0, hi[0]), b = amount.slice(hi[0], hi[1]), c = amount.slice(hi[1]);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, transform: `translate(-50%, ${(1 - on) * 24}px) scale(${0.9 + on * 0.1})`, opacity: on,
      background: 'rgba(16,19,18,.96)', border: `1px solid ${C.line2}`, borderTop: `3px solid ${C.accent}`, padding: '16px 24px 18px', minWidth: 420,
      boxShadow: '0 20px 50px rgba(0,0,0,.5)',
    }}>
      <div style={{ fontFamily: mono, fontSize: 17, letterSpacing: '0.2em', color: C.accentInk, marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 52, color: C.ink, letterSpacing: '0.01em' }}>
        {a}<span style={{ background: `rgba(255,90,44,${0.85 * hl})`, color: hl > 0.5 ? '#0b0d0c' : C.ink, padding: '0 2px' }}>{b}</span>{c}
        <span style={{ fontSize: 26, color: C.ink3, marginLeft: 12 }}>ZEC</span>
      </div>
      <div style={{ fontFamily: mono, fontSize: 17, color: C.ink3, marginTop: 8 }}>{sub}</div>
    </div>
  );
};

const Door: React.FC<{ x: number; label: string; open: number }> = ({ x, label, open }) => (
  <div style={{ position: 'absolute', left: x - 70, top: 380, width: 140, height: 300 }}>
    <div style={{ position: 'absolute', inset: 0, border: `2px solid ${C.line2}`, background: C.bg1 }} />
    <div style={{
      position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${C.bg2}, ${C.bg1})`, border: `2px solid ${open > 0.02 ? C.accent : C.line2}`,
      transformOrigin: 'left center', transform: `perspective(600px) rotateY(${-open * 62}deg)`,
    }}>
      <div style={{ position: 'absolute', right: 16, top: 140, width: 10, height: 24, background: C.ink3, borderRadius: 2 }} />
    </div>
    <div style={{ position: 'absolute', top: 316, left: -40, right: -40, textAlign: 'center', fontFamily: mono, fontSize: 18, letterSpacing: '0.18em', color: C.ink2 }}>{label}</div>
  </div>
);

const Leak: React.FC<{ s: any }> = ({ s }) => {
  const frame = useCurrentFrame();
  const [l0, l1] = s.lines;
  const T0 = l0.rel, T1 = l1.rel;
  const vault = ramp(frame, 0.1, 0.9);
  // generic coins during leak-0
  const gen = ramp(frame, T0 + 0.6, T0 + 2.4);
  // the example: coin A enters at T1+0.3..T1+2.2, coin B exits at T1+4.0..T1+5.8
  const inA = ramp(frame, T1 + 0.2, T1 + 2.2);
  const outB = ramp(frame, T1 + 4.0, T1 + 5.9);
  const tagA = ramp(frame, T1 + 0.5, T1 + 1.2);
  const tagB = ramp(frame, T1 + 4.6, T1 + 5.3);
  const thread = ramp(frame, T1 + 6.6, T1 + 7.9);
  const hl = ramp(frame, T1 + 7.4, T1 + 7.9);
  const eq = ramp(frame, T1 + 8.0, T1 + 8.7);
  const linked = spring({ frame: frame - f(T1 + 9.0), fps: FPS, config: { damping: 12 } });
  const doorL = Math.max(interpolate(frame, [f(T0 + 1.0), f(T0 + 1.4), f(T0 + 2.4), f(T0 + 2.8)], [0, 1, 1, 0], clamp),
    interpolate(frame, [f(T1 + 0.9), f(T1 + 1.3), f(T1 + 2.0), f(T1 + 2.4)], [0, 1, 1, 0], clamp));
  const doorR = interpolate(frame, [f(T1 + 4.3), f(T1 + 4.7), f(T1 + 5.4), f(T1 + 5.8)], [0, 1, 1, 0], clamp);
  const coin = (x: number, y: number, o: number, label = 'ZEC', size = 76) => (
    <div style={{
      position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%', opacity: o,
      background: `radial-gradient(circle at 35% 30%, #ffb08f, ${C.accent} 55%, #b8391a)`, boxShadow: `0 0 34px rgba(255,90,44,.55)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 500, fontSize: 18, color: '#200a03',
    }}>{label}</div>
  );
  const LX = 360, RX = 1560, CY = 530;
  // coin A path: from x=120 to LX then into vault center (960)
  const ax = interpolate(inA, [0, 0.55, 1], [130, LX, 860]);
  const aO = interpolate(inA, [0, 0.05, 0.8, 1], [0, 1, 1, 0]);
  const bx = interpolate(outB, [0, 0.4, 1], [1060, RX, 1800]);
  const bO = interpolate(outB, [0, 0.15, 0.9, 1], [0, 1, 1, 0.9]);
  const gx = interpolate(gen, [0, 0.6, 1], [130, LX, 800]);
  const gO = interpolate(gen, [0, 0.05, 0.75, 1], [0, 1, 1, 0]);
  const clock = ramp(frame, T1 + 2.6, T1 + 4.2);
  const pathLen = 1400;
  return (
    <AbsoluteFill>
      <Backdrop glow={[50, 40]} />
      <Kicker>THE LEAK · ONE REAL MAINNET EXAMPLE</Kicker>
      {/* vault */}
      <div style={{
        position: 'absolute', left: 560, top: 360, width: 800, height: 340, opacity: vault, transform: `scale(${0.94 + vault * 0.06})`,
        border: `2px solid ${C.line2}`, background: `repeating-linear-gradient(135deg, ${C.bg1} 0 14px, #0e1110 14px 28px)`,
        boxShadow: 'inset 0 0 80px rgba(0,0,0,.6)',
      }}>
        <div style={{ position: 'absolute', left: 30, top: 24, fontFamily: mono, fontSize: 18, letterSpacing: '0.22em', color: C.ink3 }}>SHIELDED POOL</div>
        <div style={{ position: 'absolute', right: 30, top: 24, fontFamily: mono, fontSize: 18, letterSpacing: '0.12em', color: C.ink3 }}>sender · receiver · amount: <span style={{ color: C.sage }}>hidden</span></div>
        <svg width="150" height="150" viewBox="0 0 150 150" style={{ position: 'absolute', left: 325, top: 110 }}>
          <circle cx="75" cy="75" r="62" fill="none" stroke={C.line2} strokeWidth="3" />
          <circle cx="75" cy="75" r="44" fill={C.bg2} stroke={C.ink3} strokeWidth="2" />
          <g transform={`rotate(${frame * 1.2 + clock * 220} 75 75)`}>
            {Array.from({ length: 12 }).map((_, i) => <line key={i} x1="75" y1="17" x2="75" y2="27" stroke={C.ink3} strokeWidth="2" transform={`rotate(${i * 30} 75 75)`} />)}
            <line x1="75" y1="75" x2="75" y2="40" stroke={C.accent} strokeWidth="4" strokeLinecap="round" />
          </g>
        </svg>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 268, textAlign: 'center', fontFamily: mono, fontSize: 30, color: C.ink,
          opacity: interpolate(clock, [0, 0.2, 1], [0, 1, 1]),
        }}>+ 9 minutes</div>
      </div>
      <Door x={LX} label="SHIELD · IN" open={doorL} />
      <Door x={RX} label="DESHIELD · OUT" open={doorR} />
      {coin(gx, CY, gO, 'ZEC', 64)}
      {/* generic public chips during leak-0 */}
      {['amount', 'address', 'time'].map((w, i) => {
        const o = Math.min(ramp(frame, T0 + 1.4 + i * 0.25, T0 + 1.9 + i * 0.25), 1 - ramp(frame, T1 - 0.2, T1 + 0.3));
        return (
          <div key={w} style={{
            position: 'absolute', left: LX - 110 + i * 0, top: 230 + i * 44, width: 220, textAlign: 'center', opacity: o,
            transform: `translateY(${(1 - o) * 14}px)`, fontFamily: mono, fontSize: 20, color: C.ink, border: `1px solid ${C.accent}`,
            background: C.dim, padding: '6px 0', letterSpacing: '0.08em',
          }}>public: {w}</div>
        );
      })}
      {coin(ax, CY, aO)}
      {coin(bx, CY, bO)}
      {/* orange thread linking the two tags */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <path d={`M ${LX} 200 C ${LX + 250} 40, ${RX - 250} 40, ${RX} 200`} fill="none" stroke={C.accent} strokeWidth="4"
          strokeDasharray={pathLen} strokeDashoffset={pathLen * (1 - thread)} style={{ filter: 'drop-shadow(0 0 10px rgba(255,90,44,.7))' }} />
      </svg>
      <Tag x={LX + 40} y={190} label="SHIELDED · PUBLIC" amount="2.50121076" hi={[5, 7]} on={tagA} hl={hl} sub="t-address → pool" />
      <Tag x={RX - 40} y={190} label="DESHIELDED · 9 MIN LATER" amount="2.50106076" hi={[5, 7]} on={tagB} hl={hl} sub="pool → t-address" />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 770, textAlign: 'center', opacity: eq, transform: `translateY(${(1 - eq) * 20}px)`,
        fontFamily: mono, fontSize: 38, color: C.ink2,
      }}>
        2.50121076 − 2.50106076 = <span style={{ color: C.ink }}>0.00015000 ZEC</span> = <span style={{ color: C.accent, fontWeight: 500 }}>15,000 zat fee</span>
      </div>
      <div style={{
        position: 'absolute', left: 960, top: 100, transform: `translate(-50%,0) scale(${0.6 + 0.4 * linked})`, opacity: linked,
        fontFamily: mono, fontSize: 22, letterSpacing: '0.24em', color: '#0b0d0c', background: C.accent, padding: '8px 18px',
      }}>LINKED</div>
      <Captions lines={s.lines} />
    </AbsoluteFill>
  );
};

// ---------- 3. the headline stat ----------
const Stat: React.FC<{ s: any }> = ({ s }) => {
  const frame = useCurrentFrame();
  const l = s.lines[0];
  const n = interpolate(frame, [f(l.rel + 4.8), f(l.rel + 7.0)], [0, 24.6], { ...clamp, easing: Easing.out(Easing.cubic) });
  const big = ramp(frame, l.rel + 4.6, l.rel + 5.2);
  const sub = ramp(frame, l.rel + 6.6, l.rel + 7.3);
  const facts = [['75', 'days of mainnet since Ironwood'], ['584,497', 'transactions'], ['82,581', 'withdrawals from the pools']];
  const cells = 100, lit = Math.round(n);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: C.bg }}>
        <OffthreadVideo src={staticFile('clips/observatory.mp4')} trimBefore={f(s.recSrc)} muted
          style={{ width: '100%', height: '100%', filter: 'blur(5px) brightness(.32) saturate(.9)', transform: `scale(${1.08 + frame * 0.0006})` }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 35% 50%, rgba(11,13,12,.55), rgba(11,13,12,.9))' }} />
      <Kicker>WHAT AN OBSERVER LEARNS FROM THE PUBLIC CHAIN</Kicker>
      <div style={{ position: 'absolute', left: 110, top: 170, display: 'flex', gap: 22 }}>
        {facts.map(([v, k], i) => {
          const o = ramp(frame, l.rel + 2.2 + i * 0.35, l.rel + 2.8 + i * 0.35);
          return (
            <div key={k} style={{ opacity: o, transform: `translateY(${(1 - o) * 16}px)`, border: `1px solid ${C.line2}`, background: 'rgba(16,19,18,.8)', padding: '12px 20px', fontFamily: mono, fontSize: 22, color: C.ink2 }}>
              <span style={{ color: C.ink, fontWeight: 500, marginRight: 10 }}>{v}</span>{k}
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 100, top: 250, opacity: big, transform: `scale(${0.92 + big * 0.08})`, transformOrigin: 'left center' }}>
        <div style={{ fontFamily: serif, fontSize: 380, lineHeight: 1, color: C.accent, letterSpacing: '-0.02em', textShadow: '0 0 60px rgba(255,90,44,.35)' }}>
          {n.toFixed(1)}<span style={{ fontSize: 220 }}>%</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 116, top: 650, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)`, fontFamily: sans, fontSize: 50, color: C.ink, fontWeight: 500 }}>
        of withdrawals since Ironwood can be traced
      </div>
      <div style={{ position: 'absolute', left: 116, top: 740, display: 'grid', gridTemplateColumns: 'repeat(50, 22px)', gap: 6, opacity: big }}>
        {Array.from({ length: cells }).map((_, i) => (
          <div key={i} style={{ width: 22, height: 22, background: i < lit ? C.accent : 'rgba(255,255,255,.08)', boxShadow: i < lit ? '0 0 8px rgba(255,90,44,.5)' : 'none' }} />
        ))}
      </div>
      <Captions lines={s.lines} />
    </AbsoluteFill>
  );
};

// ---------- 4. accuracy ----------
const Acc: React.FC<{ s: any }> = ({ s }) => {
  const frame = useCurrentFrame();
  const [l0, l1] = s.lines;
  const ax = ramp(frame, 0.2, 1.0);
  const fwd = ramp(frame, l0.rel + 0.6, l0.rel + 1.6);
  const back = ramp(frame, l0.rel + 2.6, l0.rel + 3.8);
  const coinc = ramp(frame, l0.rel + 5.0, l0.rel + 5.6);
  const bars = [
    { p: 99, label: 'Fast links · non-round amount, within 100 blocks', main: true },
    { p: 90, label: 'Round amount, within 10 blocks' },
    { p: 85, label: 'Non-round amount, within a day' },
  ];
  const X0 = 260, X1 = 1660, Y = 430, mid = 960;
  const arcLen = 900;
  return (
    <AbsoluteFill>
      <Backdrop glow={[30, 70]} />
      <Kicker>HOW DO WE KNOW A LINK IS REAL? · THE REVERSE-TIME TEST</Kicker>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <line x1={X0} y1={Y} x2={X0 + (X1 - X0) * ax} y2={Y} stroke={C.line2} strokeWidth="3" />
        <text x={X1 - 10} y={Y + 46} fill={C.ink3} fontFamily={mono} fontSize="20" textAnchor="end" opacity={ax}>time →</text>
        {Array.from({ length: 15 }).map((_, i) => (
          <line key={i} x1={X0 + i * 100} y1={Y - 8} x2={X0 + i * 100} y2={Y + 8} stroke={C.line2} strokeWidth="2" opacity={ax} />
        ))}
        {/* forward: deposit -> withdrawal */}
        <path d={`M ${mid - 320} ${Y} C ${mid - 220} ${Y - 220}, ${mid - 20} ${Y - 220}, ${mid + 80} ${Y}`} fill="none" stroke={C.accent} strokeWidth="4"
          strokeDasharray={arcLen} strokeDashoffset={arcLen * (1 - fwd)} />
        <circle cx={mid - 320} cy={Y} r="12" fill={C.accent} opacity={fwd > 0 ? 1 : 0} />
        <circle cx={mid + 80} cy={Y} r="12" fill={C.accent} opacity={fwd > 0.95 ? 1 : 0} />
        <text x={mid - 320} y={Y + 50} fill={C.ink2} fontFamily={mono} fontSize="20" textAnchor="middle" opacity={fwd}>deposit</text>
        <text x={mid + 80} y={Y + 50} fill={C.ink2} fontFamily={mono} fontSize="20" textAnchor="middle" opacity={fwd}>withdrawal</text>
        <text x={mid - 120} y={Y - 190} fill={C.accentInk} fontFamily={mono} fontSize="22" textAnchor="middle" opacity={fwd}>forward match: a link?</text>
        {/* backward: same rule, withdrawal BEFORE deposit */}
        <path d={`M ${mid + 80} ${Y} C ${mid + 180} ${Y + 0}, ${mid + 380} ${Y - 200}, ${mid + 480} ${Y}`} fill="none" stroke="none" />
        <path d={`M ${mid - 720} ${Y} C ${mid - 620} ${Y - 170}, ${mid - 420} ${Y - 170}, ${mid - 320} ${Y}`} fill="none" stroke={C.ink3} strokeWidth="3"
          strokeDasharray="12 10" opacity={back} />
        <circle cx={mid - 720} cy={Y} r="10" fill="none" stroke={C.ink3} strokeWidth="3" opacity={back} />
        <text x={mid - 720} y={Y + 50} fill={C.ink3} fontFamily={mono} fontSize="20" textAnchor="middle" opacity={back}>withdrawal, earlier</text>
        <text x={mid - 520} y={Y - 160} fill={C.ink2} fontFamily={mono} fontSize="22" textAnchor="middle" opacity={back}>← same rule, backwards</text>
      </svg>
      <div style={{
        position: 'absolute', left: mid - 720 - 170, top: Y + 80, width: 340, textAlign: 'center', opacity: coinc,
        fontFamily: mono, fontSize: 20, color: C.ink, border: `1px solid ${C.line2}`, background: C.bg1, padding: '10px 0',
      }}>= always a coincidence</div>
      <div style={{ position: 'absolute', left: 260, top: 640, width: 1400 }}>
        {bars.map((b, i) => {
          const st = l1.rel + 0.3 + i * 0.35;
          const w = interpolate(frame, [f(st), f(st + 1.4)], [0, b.p], { ...clamp, easing: Easing.out(Easing.cubic) });
          const o = ramp(frame, st - 0.2, st + 0.3);
          return (
            <div key={i} style={{ marginBottom: 26, opacity: o }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: b.main ? 24 : 20, color: b.main ? C.ink : C.ink2, marginBottom: 8 }}>
                <span>{b.label}</span><span style={{ color: b.main ? C.accent : C.ink2, fontWeight: 500 }}>≈{Math.round(w)}% precise</span>
              </div>
              <div style={{ height: b.main ? 26 : 14, background: 'rgba(255,255,255,.07)' }}>
                <div style={{ height: '100%', width: `${w}%`, background: b.main ? C.accent : '#5d6560', boxShadow: b.main ? '0 0 18px rgba(255,90,44,.5)' : 'none' }} />
              </div>
            </div>
          );
        })}
      </div>
      <Captions lines={s.lines} />
    </AbsoluteFill>
  );
};

// ---------- 5. product walkthrough ----------
const FW = 1500, VH = (FW * 1080) / 1920, BAR = 46;
const Product: React.FC<{ s: any }> = ({ s }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const enter = spring({ frame, fps: FPS, config: { damping: 20, stiffness: 90 } });
  // zoom keyframes: each beat moves to its focus over 1.1 s
  const keys = s.lines.map((l: any) => ({ at: l.rel + 0.35, f: s.focus[l.key] }));
  let z = 1, ox = 0.5, oy = 0.5;
  let prev = { z: 1, ox: 0.5, oy: 0.5 };
  for (const k of keys) {
    const p = interpolate(t, [k.at, k.at + 1.1], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    const target = { z: k.f[0], ox: k.f[1], oy: k.f[2] };
    const cur = { z: prev.z + (target.z - prev.z) * p, ox: prev.ox + (target.ox - prev.ox) * p, oy: prev.oy + (target.oy - prev.oy) * p };
    if (t >= k.at) { z = cur.z; ox = cur.ox; oy = cur.oy; }
    prev = target;
  }
  // ease out of zoom at the end
  const outP = ramp(frame, s.dur - 0.9, s.dur - 0.1);
  z = z + (1 - z) * outP * 0.5;
  const top = 64;
  return (
    <AbsoluteFill>
      <Backdrop glow={[50, 15]} />
      <div style={{
        position: 'absolute', left: (1920 - FW) / 2, top, width: FW, height: VH + BAR, opacity: enter,
        transform: `perspective(2000px) translateY(${(1 - enter) * 60}px) rotateX(${(1 - enter) * 8}deg) scale(${0.96 + enter * 0.04})`,
        boxShadow: '0 40px 120px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06)', borderRadius: 14, overflow: 'hidden', background: C.bg1,
      }}>
        <div style={{ height: BAR, background: '#141817', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: '50%', background: c, opacity: 0.85 }} />)}
          <div style={{ marginLeft: 26, flex: '0 0 560px', height: 28, borderRadius: 7, background: C.bg, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: mono, fontSize: 16, color: C.ink2 }}>
            <span style={{ color: C.sage, marginRight: 8 }}>●</span>{s.url}
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 17, letterSpacing: '0.2em', color: C.accentInk }}>
            {s.chapter} · {s.title.toUpperCase()}
          </div>
        </div>
        <div style={{ position: 'relative', width: FW, height: VH, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${z})`, transformOrigin: `${ox * 100}% ${oy * 100}%` }}>
            {s.segs.map((g: any, i: number) => (
              <Sequence key={i} from={f(g.at)} durationInFrames={f(g.len) + 1} layout="none">
                <OffthreadVideo src={staticFile(`clips/${s.rec}.mp4`)} trimBefore={f(g.src)} muted style={{ position: 'absolute', inset: 0, width: FW, height: VH }} />
              </Sequence>
            ))}
          </div>
        </div>
      </div>
      <Captions lines={s.lines} />
    </AbsoluteFill>
  );
};

// ---------- 6. SDK ----------
const CODE: [string, string][][] = [
  [['k', 'import'], ['p', ' { '], ['f', 'checkSend'], ['p', ', '], ['f', 'loadPublishedContext'], ['p', ' } '], ['k', 'from'], ['s', " '@leakscope/engine'"], ['p', ';']],
  [],
  [['k', 'const'], ['p', ' ctx = '], ['k', 'await'], ['p', ' '], ['f', 'loadPublishedContext'], ['p', '();']],
  [['k', 'const'], ['p', ' v = '], ['f', 'checkSend'], ['p', '(']],
  [['p', "  { from: "], ['s', "'orchard'"], ['p', ', to: '], ['s', "'transparent'"], ['p', ', amountZat: '], ['n', '1_234_560_000'], ['p', ' },']],
  [['p', '  ctx,']],
  [['p', ');']],
  [['p', 'console.'], ['f', 'log'], ['p', '(v.level, v.score, v.headline);']],
];
const COL: Record<string, string> = { k: C.accentInk, p: C.ink2, f: C.ink, s: C.sage, n: '#b3a47f' };
const Sdk: React.FC<{ s: any }> = ({ s }) => {
  const frame = useCurrentFrame();
  const total = CODE.reduce((a, l) => a + l.reduce((b, [, t]) => b + t.length, 0) + 1, 0);
  const shown = Math.floor(interpolate(frame, [f(0.5), f(4.2)], [0, total], clamp));
  let left = shown;
  const win = spring({ frame, fps: FPS, config: { damping: 20 } });
  const res = spring({ frame: frame - f(4.6), fps: FPS, config: { damping: 16 } });
  const blink = Math.floor(frame / 15) % 2 === 0;
  return (
    <AbsoluteFill>
      <Backdrop glow={[80, 60]} />
      <Kicker>FOR WALLET DEVELOPERS · SDK</Kicker>
      <div style={{ position: 'absolute', left: 110, top: 190, width: 560 }}>
        <Words text="One call," at={0.2} style={{ fontFamily: serif, fontSize: 110, color: C.ink, lineHeight: 1 }} />
        <Words text="before Send." at={0.6} style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 110, color: C.accent, lineHeight: 1.05 }} />
        <div style={{ fontFamily: mono, fontSize: 26, color: C.ink2, marginTop: 34, opacity: ramp(frame, 1.0, 1.6) }}>@leakscope/engine</div>
        <div style={{ fontFamily: sans, fontSize: 24, color: C.ink3, marginTop: 12, lineHeight: 1.5, opacity: ramp(frame, 1.2, 1.8) }}>
          Zero runtime dependencies. Runs in the wallet, on public data.
        </div>
      </div>
      <div style={{
        position: 'absolute', left: 720, top: 170, width: 1100, opacity: win, transform: `translateY(${(1 - win) * 40}px)`,
        background: '#0e1110', border: `1px solid ${C.line2}`, borderRadius: 12, boxShadow: '0 30px 90px rgba(0,0,0,.6)', overflow: 'hidden',
      }}>
        <div style={{ height: 42, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9, background: '#141817' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c, opacity: 0.85 }} />)}
          <span style={{ marginLeft: 18, fontFamily: mono, fontSize: 16, color: C.ink3 }}>wallet/confirm-send.js</span>
        </div>
        <pre style={{ margin: 0, padding: '26px 30px', fontFamily: mono, fontSize: 23, lineHeight: 1.65, minHeight: 360 }}>
          {CODE.map((line, li) => {
            const spans = line.map(([k, txt], i) => {
              const take = Math.max(0, Math.min(txt.length, left));
              left -= txt.length;
              return <span key={i} style={{ color: COL[k] }}>{txt.slice(0, take)}</span>;
            });
            left -= 1;
            const cursorHere = left < 0 && left >= -1 - 0 && shown < total;
            return <div key={li}>{spans}{cursorHere && blink ? <span style={{ background: C.accent, color: C.accent }}>_</span> : null}{line.length === 0 ? ' ' : null}</div>;
          })}
        </pre>
      </div>
      <div style={{
        position: 'absolute', left: 900, top: 640, width: 900, opacity: res, transform: `translateY(${(1 - res) * 30}px)`,
        background: C.bg1, border: `1px solid ${C.line2}`, borderLeft: `4px solid ${C.accent}`, padding: '18px 26px', boxShadow: '0 20px 60px rgba(0,0,0,.5)',
      }}>
        <div style={{ fontFamily: mono, fontSize: 17, letterSpacing: '0.2em', color: C.accentInk, marginBottom: 10 }}>SENDVERDICT</div>
        <div style={{ fontFamily: mono, fontSize: 24, color: C.ink }}>
          <span style={{ color: '#0b0d0c', background: C.accent, padding: '2px 10px', marginRight: 14 }}>danger</span>score 5
        </div>
        <div style={{ fontFamily: mono, fontSize: 21, color: C.ink2, marginTop: 10 }}>'12.3456 ZEC would be unique on-chain: …'</div>
        <div style={{ fontFamily: mono, fontSize: 19, color: C.ink3, marginTop: 8 }}>suggestedSplit → ZIP-318 parts, random schedule</div>
      </div>
      <Captions lines={s.lines} />
    </AbsoluteFill>
  );
};

// ---------- 7. outro ----------
const Outro: React.FC<{ s: any }> = ({ s }) => {
  const frame = useCurrentFrame();
  const r1 = ramp(frame, 1.6, 2.2), r2 = ramp(frame, 2.0, 2.6), r3 = ramp(frame, 2.6, 3.2);
  const black = ramp(frame, s.dur - 0.8, s.dur);
  return (
    <AbsoluteFill>
      <Backdrop glow={[50, 45]} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 200, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: ramp(frame, 0, 0.6) }}>
          <Logo size={56} spin={frame * 0.6} />
          <span style={{ fontFamily: mono, fontSize: 34, letterSpacing: '0.3em', color: C.ink }}>LEAKSCOPE</span>
        </div>
        <div style={{ display: 'flex', marginTop: 50 }}>
          <Words text="See the leak" at={0.5} style={{ fontFamily: serif, fontSize: 140, color: C.ink }} />
          <Words text="before" at={0.85} style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 140, color: C.accent }} />
          <Words text="you send." at={1.05} style={{ fontFamily: serif, fontSize: 140, color: C.ink }} />
        </div>
        <div style={{ marginTop: 60, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
          <div style={{ opacity: r1, transform: `translateY(${(1 - r1) * 16}px)`, fontFamily: mono, fontSize: 44, color: C.ink, border: `1px solid ${C.accent}`, background: C.dim, padding: '14px 34px' }}>
            leakscope-cyan.vercel.app
          </div>
          <div style={{ opacity: r2, transform: `translateY(${(1 - r2) * 16}px)`, fontFamily: mono, fontSize: 32, color: C.ink2 }}>
            github.com/AdityaWisnuu/leakscope
          </div>
          <div style={{ opacity: r3, fontFamily: mono, fontSize: 20, letterSpacing: '0.2em', color: C.ink3, marginTop: 24 }}>
            OPEN SOURCE · CHECK · PRE-FLIGHT · SCAN · SDK · ZECATHON 2026
          </div>
        </div>
      </div>
      <AbsoluteFill style={{ background: '#000', opacity: black }} />
    </AbsoluteFill>
  );
};

const COMPS: Record<string, React.FC<{ s: any }>> = { intro: Intro, leak: Leak, stat: Stat, acc: Acc, check: Product, plan: Product, scan: Product, sdk: Sdk, outro: Outro };

export const Main: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {TL.scenes.map((s: any) => {
      const Comp = COMPS[s.id];
      return (
        <Sequence key={s.id} from={f(s.from)} durationInFrames={f(s.dur)} name={s.id}>
          <SceneFade dur={s.dur} inS={s.id === 'intro' ? 0.8 : 0.35} outS={s.id === 'outro' ? 0.05 : 0.3}><Comp s={s} /></SceneFade>
        </Sequence>
      );
    })}
    {TL.scenes.flatMap((s: any) => s.lines.map((l: any) => (
      <Sequence key={l.key} from={f(l.start)} durationInFrames={f(l.dur) + 6} name={`vo ${l.key}`}>
        <Audio src={staticFile(`audio/${l.key}.wav`)} />
      </Sequence>
    )))}
    <Audio src={staticFile('audio/bed.wav')} volume={(fr) => interpolate(fr, [0, f(TL.total) - 60, f(TL.total)], [0.9, 0.9, 0], clamp)} />
  </AbsoluteFill>
);
