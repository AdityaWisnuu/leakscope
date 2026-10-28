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

/** Plain-language "what this means for you / what to do", per kind. Keep it to advice we can stand behind. */
export const ADVICE: Record<string, { means: (f: Finding) => string; todo: string }> = {
  'utxo-roundtrip': {
    means: () =>
      'Anyone can see these coins left the shielded pool for a transparent address and were then shielded again. The two transactions are publicly tied together.',
    todo: 'Don’t re-shield the same coins you just deshielded (wallet auto-shielding does exactly this). To move money between your own shielded funds, keep it shielded: send shielded to shielded.',
  },
  'quick-roundtrip': {
    means: () =>
      'The amount that came out equals what went in shortly before, minus a standard fee, and no other deposit fits. An observer can pair the two; we measured this kind of link to be right about 99% of the time.',
    todo: 'Don’t withdraw exactly what you deposited. Wait longer, at no fixed interval, and use standard ZIP-318 amounts (1, 2, 5, 10… ZEC) instead of the exact balance. Best of all, stay shielded and pay shielded addresses directly.',
  },
  'amount-link': {
    means: () => 'Your withdrawal matches exactly one earlier deposit (plus its fee), so an observer can probably pair the two.',
    todo: 'Use standard ZIP-318 amounts (1, 2, 5, 10… ZEC) when entering or leaving the shielded pool, and don’t take out exactly what you put in. Pre-flight checks an amount before you send.',
  },
  'address-reuse': {
    means: () =>
      'The same transparent address received shielded funds and later shielded funds again. Both activities point to one owner.',
    todo: 'Use a fresh transparent address every time you shield or deshield. Exchange deposit addresses are often reused, so expect that link when you use one.',
  },
  'pool-crossing': {
    means: (f) =>
      f.anonymitySet === 1
        ? 'Moving value between shielded pools (such as Orchard to Ironwood) showed this exact amount publicly, and nobody else moved the same amount nearby. It works as a fingerprint that later withdrawals can be matched against.'
        : 'Moving value between shielded pools (such as Orchard to Ironwood) showed this exact amount publicly. Others moved the same amount nearby, so it is a weaker fingerprint.',
    todo: 'Move between pools in standard ZIP-318 amounts (1, 2, 5, 10… ZEC) spread over time; Pre-flight builds the plan. Avoid later withdrawing this same exact amount.',
  },
  'fee-fingerprint': {
    means: () => 'This transaction paid an unusual fee, which hints at which wallet software made it and can group your transactions together.',
    todo: 'Use your wallet’s default fee (the standard ZIP-317 fee) rather than a custom one.',
  },
};

/** Fixes a grammar slip in detail text from older reports ("only 1 value … equal this amount"). */
const tidy = (s: string) => s.replace(/\b(only 1 value [^.]*?) equal this amount/, '$1 equals this amount');

function setText(f: Finding) {
  if (f.anonymitySet == null) return null;
  if (f.kind === 'pool-crossing') {
    return f.anonymitySet === 1
      ? '1 — no other move of this amount nearby'
      : `${f.anonymitySet} moves of this amount nearby`;
  }
  return f.anonymitySet === 1 ? '1 — fully linked' : `${f.anonymitySet} plausible sources`;
}

/** `mainnet` false: no mainnet lookup or explorer links (testnet findings). */
/** `explorer` false: no explorer links (personal scan results, where a click would reveal which transactions are yours). */
export function FindingCard({ f, focus, mainnet = true, advice = false, explorer = mainnet }: { f: Finding; focus?: string; mainnet?: boolean; advice?: boolean; explorer?: boolean }) {
  const others = f.txids.filter((t) => t !== focus);
  const set = setText(f);
  const a = advice ? ADVICE[f.kind] : undefined;
  return (
    <article className={`finding s-${f.severity}`}>
      <div className="finding-top">
        <Sev s={f.severity} />
        <span className="label">{KIND_LABEL[f.kind] ?? f.kind}</span>
        {f.h != null && <span className="label">block {f.h.toLocaleString('en-US')}</span>}
      </div>
      <h3>{f.title}</h3>
      <p>{tidy(f.detail)}</p>
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
                <TxRef key={t} txid={t} check={mainnet} explorer={explorer} />
              ))}
              {others.length > 12 && <span className="dim small">and {others.length - 12} more</span>}
            </dd>
          </>
        )}
      </dl>
      {a && (
        <div className="advice">
          <div>
            <span className="label">What this means for you</span>
            <p>{a.means(f)}</p>
          </div>
          <div className="todo">
            <span className="label">What to do</span>
            <p>{a.todo}</p>
          </div>
        </div>
      )}
    </article>
  );
}
