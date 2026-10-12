import { zec } from '@/lib/format';
import type { Finding } from '@/lib/types';
import { Sev, TxRef } from './Bits';

export const KIND_LABEL: Record<string, string> = {
  'utxo-roundtrip': 'Round trip',
  'address-reuse': 'Address reuse',
  'quick-roundtrip': 'Quick round trip',
  'amount-link': 'Amount match',
  'pool-crossing': 'Pool crossing',
  'fee-fingerprint': 'Fee fingerprint',
};

function setText(f: Finding) {
  if (f.anonymitySet == null) return null;
  if (f.kind === 'pool-crossing') {
    return f.anonymitySet === 1
      ? '1 — no other move of this amount nearby'
      : `${f.anonymitySet} moves of this amount nearby`;
  }
  return f.anonymitySet === 1 ? '1 — fully linked' : `${f.anonymitySet} plausible sources`;
}

export function FindingCard({ f, focus }: { f: Finding; focus?: string }) {
  const others = f.txids.filter((t) => t !== focus);
  const set = setText(f);
  return (
    <article className={`finding s-${f.severity}`}>
      <div className="finding-top">
        <Sev s={f.severity} />
        <span className="label">{KIND_LABEL[f.kind] ?? f.kind}</span>
        {f.h != null && <span className="label">block {f.h.toLocaleString('en-US')}</span>}
      </div>
      <h3>{f.title}</h3>
      <p>{f.detail}</p>
      <dl className="kv">
        {set && (
          <>
            <dt>Anonymity set</dt>
            <dd className="num">{set}</dd>
          </>
        )}
        {f.amount != null && (
          <>
            <dt>Amount</dt>
            <dd className="num">{zec(f.amount)} ZEC</dd>
          </>
        )}
        {others.length > 0 && (
          <>
            <dt>{focus ? (others.length === 1 ? 'Linked tx' : 'Linked txs') : 'Transactions'}</dt>
            <dd className="stack" style={{ gap: 4 }}>
              {others.slice(0, 12).map((t) => (
                <TxRef key={t} txid={t} />
              ))}
              {others.length > 12 && <span className="dim small">and {others.length - 12} more</span>}
            </dd>
          </>
        )}
      </dl>
    </article>
  );
}
