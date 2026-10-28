import type { Metadata } from 'next';
import { KIND_LABEL } from '@/components/FindingCard';
import { SplitHeadline } from '@/components/Motion';
import { getCoverage, getExamples } from '@/lib/data.server';
import { num } from '@/lib/format';
import { CheckClient } from './CheckClient';

export const metadata: Metadata = { title: 'Check a transaction', description: 'Paste a Zcash transaction id and see what a public-chain observer can link it to: round trips, amount matches, address reuse, fee fingerprints.', openGraph: { title: 'Check a transaction · Leakscope', description: 'Paste a Zcash transaction id and see what a public-chain observer can link it to: round trips, amount matches, address reuse, fee fingerprints.', images: ['/og.png'] } };

export default function CheckPage() {
  const c = getCoverage();
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
          Paste a transaction id. We show what anyone watching the public chain can link it to, how sure they can be,
          and what to do about it. Covers transactions from {c.span}{' '}
          <span className="dim">(mainnet blocks {num(c.from)}–{num(c.to)})</span>.
        </p>
      </header>
      <CheckClient range={{ from: c.from, to: c.to, fromDate: c.fromDate, toDate: c.toDate, span: c.span }} samples={samples} />
    </div>
  );
}
