import type { Metadata } from 'next';
import { KIND_LABEL } from '@/components/FindingCard';
import { SplitHeadline } from '@/components/Motion';
import { getExamples, getSummary } from '@/lib/data.server';
import { num } from '@/lib/format';
import { CheckClient } from './CheckClient';

export const metadata: Metadata = { title: 'Check a transaction' };

export default function CheckPage() {
  const s = getSummary();
  const ex = getExamples();
  const samples = (['quick-roundtrip', 'utxo-roundtrip', 'address-reuse', 'pool-crossing'] as const)
    .map((k) => ex[k]?.[0] && { txid: ex[k]![0].txids.at(-1)!, label: KIND_LABEL[k] })
    .filter((x): x is { txid: string; label: string } => !!x);
  return (
    <div className="wrap">
      <header className="page-head">
        <span className="label">02 · Transaction check</span>
        <SplitHeadline className="display">
          What does this transaction <em>give away</em>?
        </SplitHeadline>
        <p className="lede">
          Every finding from mainnet blocks {num(s.range.from)}–{num(s.range.to)} that involves the transaction: how bad
          it is, why, how many alternatives an observer has, and the transaction it links to.
        </p>
      </header>
      <CheckClient range={s.range} samples={samples} />
    </div>
  );
}
