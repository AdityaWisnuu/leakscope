import Link from 'next/link';
import { DailyChart } from '@/components/DailyChart';
import { FindingCard, KIND_LABEL } from '@/components/FindingCard';
import { Glyph } from '@/components/Glyph';
import { CountUp, Reveal, SplitHeadline } from '@/components/Motion';
import { ScopeViz } from '@/components/ScopeViz';
import { IRONWOOD_ACTIVATION, REPO_URL } from '@/lib/constants';
import { getCoverage, getDays, getExamples, getSummary } from '@/lib/data.server';
import { num, pct } from '@/lib/format';
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

const REPO = REPO_URL || 'https://github.com/AdityaWisnuu/leakscope';
const SDK_TGZ = '@leakscope/engine';

export default function Observatory() {
  const s = getSummary();
  const days = getDays();
  const examples = getExamples();
  const sinceLaunch = s.range.from <= IRONWOOD_ACTIVATION + 1152;
  const m = s.migrations;
  const c = getCoverage();
  const forward = s.deshieldsLinkedAnyWay - s.linkableDeshields;
  const fastPrecision = s.amountLinks?.fast?.precision;
  return (
    <>
      <section className="hero wrap">
        <span className="label" style={{ display: 'block', marginBottom: 28 }}>
          Observatory · Zcash mainnet · blocks <b>{num(c.from)}–{num(c.to)}</b> · {c.fromDate} → {c.toDate}
        </span>
        <div className="hero-grid">
          <SplitHeadline className="hero-big">
            <span className="figure">{s.deshieldsLinkedAnyWayPct}%</span> of withdrawals{' '}
            {sinceLaunch ? 'since Ironwood launched' : 'in this range'} can be linked.
          </SplitHeadline>
          <div className="hero-side">
            <p>
              Shielded Zcash hides sender, receiver and amount. But value entering or leaving a pool, or moving from
              Orchard to Ironwood, crosses a <strong>public boundary</strong> with its exact amount.
            </p>
            <p>
              Of <strong className="num">{num(s.deshieldTxs)}</strong> transactions that withdrew to transparent
              addresses, <strong className="num">{num(s.linkableDeshields)}</strong> ({s.linkableDeshieldsPct}%) are
              linked <em>back</em> to their deposit by exact amount plus fee
              {fastPrecision ? ` (measured ≈${fastPrecision}% precision for the fastest tier)` : ''}, and another{' '}
              <strong className="num">{num(forward)}</strong> ({pct(forward, s.deshieldTxs).toFixed(1)}%) are linked{' '}
              <em>forward</em> by a round trip: the coins went to a t-address and were shielded again. A round trip is
              certain, since the same coins move, but it is often a wallet auto-shielding and may not reveal a new
              identity. No cryptography was broken, and we{' '}
              <Link href="/method/#accuracy">measured how often these links are wrong</Link>.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
              <Link className="btn" href="/check/">
                Check a transaction
              </Link>
              <Link className="btn ghost" href="/plan/">
                Check before you send
              </Link>
            </div>
            <p className="media-links" style={{ marginTop: 18 }}>
              <a href="/demo.mp4">▶ Watch the 2-minute demo</a>
              <a href="/deck.pdf">Pitch deck (PDF)</a>
              <Link href="/#developers">For wallet developers →</Link>
            </p>
          </div>
        </div>

        <section aria-labelledby="start-here" style={{ margin: '8px 0 0' }}>
          <h2 id="start-here" className="label" style={{ marginBottom: 14, fontWeight: 400 }}>
            Start here · am I leaking?
          </h2>
          <div className="start-grid">
            <Link className="start-card" href="/check/">
              <span className="label">Already sent it?</span>
              <h3 className="h3">Check a transaction</h3>
              <p>Paste a transaction id from your wallet&apos;s history and see what anyone can link it to.</p>
              <span className="go">Check a transaction →</span>
            </Link>
            <Link className="start-card" href="/plan/">
              <span className="label">About to send?</span>
              <h3 className="h3">Plan a withdrawal</h3>
              <p>Before you withdraw, shield or migrate, see how private it will be and how to make it blend in.</p>
              <span className="go">Plan a withdrawal →</span>
            </Link>
            <Link className="start-card" href="/scan/">
              <span className="label">Want a full check-up?</span>
              <h3 className="h3">Scan my wallet</h3>
              <p>Uses a read-only viewing key, entirely on your device, to find which of your transactions leak.</p>
              <span className="go">Scan my wallet →</span>
            </Link>
          </div>
        </section>

        <div className="stats" style={{ marginBottom: 40 }}>
          <div className="stat">
            <span className="label">Withdrawals</span>
            <CountUp className="v" value={s.deshieldTxs} />
            <p>transactions moved shielded value to a transparent address.</p>
          </div>
          <div className="stat">
            <span className="label">Round trips</span>
            <CountUp className="v accent" value={s.roundTrips} />
            <p>
              round-trip findings: a deshielded output spent straight back into a pool, linked with certainty. Counted
              per round trip, not per withdrawal; the {num(forward)} above counts withdrawals not already linked by
              amount.
            </p>
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
          <p>
            Three tools, all running in your browser. What you type stays in your tab; /check asks the server only for a
            1-in-256 shard named by the first two characters of the txid.
          </p>
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
      <Reveal as="section" className="section wrap" id="developers">
        <div className="section-head" data-reveal>
          <span className="label">05 · For wallet developers</span>
          <h2 className="h2">
            Put the check on your <em>Send</em> screen.
          </h2>
          <p>
            The engine behind Pre-flight ships in the repository as a library, <code>@leakscope/engine</code>. It runs
            the same checks in Node or the browser, against our public dataset or your own copy. No server, no keys, no
            runtime dependencies.
          </p>
        </div>
        <div className="dev-grid" data-reveal>
          <div className="stack">
            <p style={{ margin: 0 }}>
              Before the user confirms, call <code>checkSend</code> with the planned transfer. You get a level, a 0–100
              score, a one-line headline for the confirmation screen, and a ZIP-318 split when one would help.
            </p>
            <p className="small dim" style={{ margin: 0 }}>
              Install from npm:
            </p>
            <pre className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>npm install {SDK_TGZ}</pre>
            <p className="media-links" style={{ margin: 0 }}>
              <a href={`${REPO}/tree/main/engine`} target="_blank" rel="noopener noreferrer">
                engine/ source &amp; API ↗
              </a>
              <a href={`${REPO}/tree/main/examples`} target="_blank" rel="noopener noreferrer">
                Working examples ↗
              </a>
            </p>
            <p className="small dim" style={{ margin: 0 }}>
              Two examples: a Node pre-flight prompt and a wallet &ldquo;Confirm send&rdquo; screen in one HTML file.
              Dual-licensed MIT / Apache-2.0.
            </p>
          </div>
          <pre className="code" aria-label="Example: checkSend">
{`import { checkSend, loadPublishedContext } from '@leakscope/engine';

`}<span className="c">{`// public mainnet dataset, load once`}</span>{`
const ctx = await loadPublishedContext();

const v = checkSend(
  { from: 'orchard', to: 'transparent',
    amountZat: 1_234_560_000, toAddress: 't1...' },
  ctx,
);
console.log(v.level, v.score, v.headline);
`}<span className="c">{`// 'danger' 5 '12.3456 ZEC would be unique on-chain: ...'`}</span>{`
if (v.suggestedSplit) console.log(v.suggestedSplit.parts);
`}<span className="c">{`// [{ amountZat: 1e9, crowd: 501 }, ...]`}</span>
          </pre>
        </div>
      </Reveal>
    </>
  );
}
