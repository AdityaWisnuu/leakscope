import Link from 'next/link';
import { DailyChart } from '@/components/DailyChart';
import { FindingCard, KIND_LABEL } from '@/components/FindingCard';
import { Glyph } from '@/components/Glyph';
import { CountUp, Reveal, SplitHeadline } from '@/components/Motion';
import { ScopeViz } from '@/components/ScopeViz';
import { IRONWOOD_ACTIVATION } from '@/lib/constants';
import { getDays, getExamples, getSummary } from '@/lib/data.server';
import { fmtDate, num, pct } from '@/lib/format';
import type { FindingKind } from '@/lib/types';

const CLASSES: { kind: FindingKind; name: string; body: string }[] = [
  {
    kind: 'utxo-roundtrip',
    name: 'Round trip',
    body: 'Coins leave a shielded pool for a transparent address, and that very output is spent back into a pool. The transparent hop is a public chain of custody: both ends are linked with certainty.',
  },
  {
    kind: 'quick-roundtrip',
    name: 'Quick round trip',
    body: 'A deposit, then within 100 blocks (about two hours) a withdrawal of the same amount minus a standard fee, and no other deposit fits. The pool held the money briefly and hid nothing.',
  },
  {
    kind: 'amount-link',
    name: 'Amount match',
    body: 'A withdrawal that equals exactly one deposit in the previous 30 days, after allowing for any standard fee. Unusual amounts are fingerprints: the rarer the amount, the stronger the link.',
  },
  {
    kind: 'address-reuse',
    name: 'Address reuse',
    body: 'A transparent address that once received a withdrawal later shields funds again. One address, two shielded activities, one owner.',
  },
  {
    kind: 'pool-crossing',
    name: 'Pool crossing',
    body: 'Moving value from Orchard to Ironwood passes a public turnstile that shows the exact amount. Orchard is frozen, so every holder must cross. A one-of-a-kind amount is a fingerprint later withdrawals can be matched against; ZIP 318 standard amounts blend in.',
  },
  {
    kind: 'fee-fingerprint',
    name: 'Fee fingerprint',
    body: 'Almost every wallet pays exactly the ZIP-317 fee. A transaction that pays something else stands out and narrows down which software, and so which user, made it.',
  },
];

export default function Observatory() {
  const s = getSummary();
  const days = getDays();
  const examples = getExamples();
  const sinceLaunch = s.range.from <= IRONWOOD_ACTIVATION + 1152;
  const m = s.migrations;
  return (
    <>
      <section className="hero wrap">
        <span className="label" style={{ display: 'block', marginBottom: 28 }}>
          Observatory · Zcash mainnet · blocks <b>{num(s.range.from)}–{num(s.range.to)}</b> ·{' '}
          {fmtDate(days[0]?.time ?? 0)} → {fmtDate(days.at(-1)?.time ?? 0)}
        </span>
        <div className="hero-grid">
          <SplitHeadline className="hero-big">
            <span className="figure">{s.linkableDeshieldsPct}%</span> of withdrawals{' '}
            {sinceLaunch ? 'since Ironwood launched' : 'in this range'} point back to a single deposit.
          </SplitHeadline>
          <div className="hero-side">
            <p>
              Shielded Zcash hides sender, receiver and amount. But value entering or leaving a pool, or moving from
              Orchard to Ironwood, crosses a <strong>public boundary</strong> with its exact amount.
            </p>
            <p>
              Of <strong className="num">{num(s.deshieldTxs)}</strong> transactions that withdrew to transparent
              addresses, <strong className="num">{num(s.linkableDeshields)}</strong> carry an amount that matches
              exactly one earlier deposit, minus a standard fee. No cryptography was broken. Leakscope plays that
              observer, so you can see what it sees before you transact.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
              <Link className="btn" href="/check/">
                Check a transaction
              </Link>
              <Link className="btn ghost" href="/plan/">
                Plan a migration
              </Link>
            </div>
          </div>
        </div>

        <div className="stats" style={{ marginBottom: 40 }}>
          <div className="stat">
            <span className="label">Withdrawals</span>
            <CountUp className="v" value={s.deshieldTxs} />
            <p>transactions moved shielded value to a transparent address.</p>
          </div>
          <div className="stat">
            <span className="label">Round trips</span>
            <CountUp className="v accent" value={s.roundTrips} />
            <p>times deshielded coins were spent straight back into a pool: linked with certainty.</p>
          </div>
          <div className="stat">
            <span className="label">Orchard → Ironwood</span>
            <CountUp className="v" value={m.count} />
            <p>
              migrations revealed <span className="num">{num(Math.round(m.zec))}</span> ZEC in exact amounts;{' '}
              {pct(m.standardDenomination, m.count).toFixed(0)}% used a ZIP-318 standard amount.
            </p>
          </div>
          <div className="stat">
            <span className="label">Fingerprinted migrations</span>
            <CountUp className="v accent" value={m.uniqueAmount} />
            <p>moved an amount nobody else moved within 30 days: a tag later withdrawals can be matched to.</p>
          </div>
        </div>

        <ScopeViz days={days} from={s.range.from} to={s.range.to} flagship="c6b771a7" />
        <p className="small dim" style={{ marginTop: 12, maxWidth: '80ch' }}>
          Each dot is one public boundary event: shieldings above the pools, deshieldings below, height = amount on a
          log scale. Each thread is a pair an observer can link. Matching by amount is probabilistic; see the{' '}
          <Link href="/method/">method</Link> for what each thread means and how we checked it.
        </p>
      </section>

      <Reveal as="section" className="section wrap">
        <div className="section-head" data-reveal>
          <span className="label">02 · Day by day</span>
          <h2 className="h2">
            The pools are busy. <em>The edges are not.</em>
          </h2>
          <p>
            Most activity stays shielded, but every withdrawal is a chance to leak. Accent marks withdrawals whose amount
            matches exactly one earlier deposit. On the right, Orchard is being emptied into Ironwood: the migration
            that ZIP 318 is meant to make safe.
          </p>
        </div>
        <div data-reveal>
          <DailyChart days={days} />
        </div>
      </Reveal>

      <Reveal as="section" className="section wrap">
        <div className="section-head" data-reveal>
          <span className="label">03 · Leak classes</span>
          <h2 className="h2">
            Six ways the chain <em>talks</em>.
          </h2>
          <p>
            Each detector models one concrete observer with nothing but the public chain. Every example below is a real
            mainnet finding from this range.
          </p>
        </div>
        <div className="classes">
          {CLASSES.map((c, i) => {
            const ex = examples[c.kind]?.[0];
            return (
              <article className="leak-class" key={c.kind} data-reveal>
                <span className="idx">0{i + 1}</span>
                <div>
                  <Glyph kind={c.kind} />
                  <h3 className="h3">
                    {c.name}{' '}
                    <span className="mono small dim" style={{ fontSize: 13 }}>
                      {num(s.findingsByKind[c.kind] ?? 0)} found
                    </span>
                  </h3>
                  <p>{c.body}</p>
                  {ex && (
                    <div className="example">
                      <span className="label">Real example · {KIND_LABEL[c.kind]}</span>
                      <FindingCard f={ex} />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Reveal>

      <Reveal as="section" className="section wrap">
        <div className="section-head" data-reveal>
          <span className="label">04 · Use it</span>
          <h2 className="h2">
            See it before <em>they</em> do.
          </h2>
          <p>Three tools, all running in your browser. Nothing you type is sent anywhere.</p>
        </div>
        <div className="classes" data-reveal>
          {[
            ['/check/', 'Check a transaction', 'Paste a txid and see every leak it is part of, with the transaction it links to.'],
            ['/plan/', 'Pre-flight a transfer', 'Before you shield, deshield or migrate: a score, the crowd you would hide in, and a ZIP-318 split with a schedule.'],
            ['/scan/', 'Scan your wallet', 'Use a viewing key, locally, to find your own transactions and get a personal leak report.'],
            ['/method/', 'Read the method', 'The observer model, every detector, its assumptions and false-positive caveats, and how we validated it.'],
          ].map(([href, t, d]) => (
            <Link key={href} href={href} className="leak-class" style={{ textDecoration: 'none' }}>
              <span className="idx">→</span>
              <div>
                <h3 className="h3" style={{ marginBottom: 8 }}>
                  {t}
                </h3>
                <p style={{ margin: 0 }}>{d}</p>
              </div>
            </Link>
          ))}
        </div>
      </Reveal>
    </>
  );
}
