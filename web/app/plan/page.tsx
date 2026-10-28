import type { Metadata } from 'next';
import { SplitHeadline } from '@/components/Motion';
import { BLOCK_SECONDS } from '@/lib/constants';
import { getDays, getEventIndex, getSummary } from '@/lib/data.server';
import { packPreflight } from '@/lib/preflightPack';
import { PlanClient } from './PlanClient';

export const metadata: Metadata = { title: 'Pre-flight', description: 'Before you shield, deshield or migrate Orchard to Ironwood: how many recent transactions your amount hides among, and a ZIP-318 split that leaks less. Runs in your browser.', openGraph: { title: 'Pre-flight · Leakscope', description: 'Before you shield, deshield or migrate Orchard to Ironwood: how many recent transactions your amount hides among, and a ZIP-318 split that leaks less. Runs in your browser.', images: ['/og.png'] } };

export default function PlanPage() {
  const s = getSummary();
  const days = getDays();
  const last = days.at(-1)!;
  const tipTime = last.time + (s.range.to - last.from) * BLOCK_SECONDS;
  return (
    <div className="wrap">
      <header className="page-head">
        <span className="label">03 · Pre-flight</span>
        <SplitHeadline className="display">
          Check the leak <em>before</em> you send.
        </SplitHeadline>
        <p className="lede">
          Shielding, deshielding and migrating from Orchard to Ironwood all put an exact amount on the public chain.
          Pre-flight measures how many recent transactions that amount would hide among, flags reused addresses, and
          plans the <strong>ZIP 318</strong> alternative: standard denominations, broadcast at random intervals.
        </p>
      </header>
      <PlanClient tip={s.range.to} tipTime={tipTime} indexKB={Math.round(packPreflight(getEventIndex()).length / 1024)} />
    </div>
  );
}
