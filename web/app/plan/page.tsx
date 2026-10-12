import type { Metadata } from 'next';
import { SplitHeadline } from '@/components/Motion';
import { BLOCK_SECONDS } from '@/lib/constants';
import { fileSize, getDays, getSummary } from '@/lib/data.server';
import { PlanClient } from './PlanClient';

export const metadata: Metadata = { title: 'Pre-flight' };

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
      <PlanClient tip={s.range.to} tipTime={tipTime} eventCount={s.boundaryEvents} indexKB={Math.round(fileSize('event-index.json') / 1024)} />
    </div>
  );
}
