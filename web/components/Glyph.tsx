import type { FindingKind } from '@/lib/types';

/** Tiny schematic of each leak: the pool is the band; the accent is what an observer sees. */
export function Glyph({ kind }: { kind: FindingKind }) {
  const A = 'var(--accent)';
  const band = <rect x="0" y="20" width="240" height="14" fill="rgba(169,195,204,0.10)" stroke="rgba(255,255,255,0.12)" />;
  const dot = (x: number, y: number, c = 'currentColor') => <circle cx={x} cy={y} r="3" fill={c} />;
  const g: Record<FindingKind, React.ReactNode> = {
    'utxo-roundtrip': (
      <>
        {band}
        <path d="M70 34 V46 H150 V20" fill="none" stroke={A} strokeWidth="1.5" />
        {dot(70, 46)}
        {dot(150, 8)}
        <path d="M150 8 V20" stroke="currentColor" strokeDasharray="2 3" />
        <text x="96" y="54" fill={A} fontSize="9" fontFamily="var(--font-mono)">same coin</text>
      </>
    ),
    'address-reuse': (
      <>
        {band}
        <path d="M60 34 Q60 50 110 50 Q160 50 160 34" fill="none" stroke={A} strokeWidth="1.5" />
        {dot(110, 50, A)}
        {dot(60, 34)}
        {dot(160, 34)}
        <text x="122" y="54" fill="currentColor" fontSize="9" fontFamily="var(--font-mono)">t1…</text>
      </>
    ),
    'quick-roundtrip': (
      <>
        {band}
        {dot(100, 6)}
        {dot(118, 48)}
        <path d="M100 6 C100 27 118 27 118 48" fill="none" stroke={A} strokeWidth="1.5" />
        <text x="130" y="10" fill="currentColor" fontSize="9" fontFamily="var(--font-mono)">2.50121076</text>
        <text x="130" y="52" fill="currentColor" fontSize="9" fontFamily="var(--font-mono)">2.50121076</text>
      </>
    ),
    'amount-link': (
      <>
        {band}
        {[20, 46, 76, 190].map((x) => <circle key={x} cx={x} cy={6} r="3" fill="currentColor" />)}
        {dot(212, 48)}
        <path d="M46 6 C46 27 212 27 212 48" fill="none" stroke={A} strokeWidth="1.5" />
      </>
    ),
    'pool-crossing': (
      <>
        <rect x="0" y="6" width="240" height="14" fill="rgba(179,164,127,0.10)" stroke="rgba(255,255,255,0.12)" />
        <rect x="0" y="34" width="240" height="14" fill="rgba(169,195,204,0.10)" stroke="rgba(255,255,255,0.12)" />
        <path d="M120 20 V34" stroke={A} strokeWidth="1.5" />
        <rect x="104" y="22" width="32" height="10" fill="var(--bg)" stroke={A} />
        <text x="146" y="30" fill={A} fontSize="9" fontFamily="var(--font-mono)">exact amount</text>
      </>
    ),
    'fee-fingerprint': (
      <>
        {band}
        {Array.from({ length: 22 }, (_, i) => (
          <rect key={i} x={6 + i * 10.6} y="24" width="4" height="6" fill={i === 13 ? A : 'currentColor'} opacity={i === 13 ? 1 : 0.5} />
        ))}
      </>
    ),
  };
  return (
    <svg className="glyph" viewBox="0 0 240 56" preserveAspectRatio="xMinYMid meet" aria-hidden>
      {g[kind]}
    </svg>
  );
}
