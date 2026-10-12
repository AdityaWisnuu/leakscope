import type { Metadata } from 'next';
import Link from 'next/link';
import { TxRef } from '@/components/Bits';
import { SplitHeadline } from '@/components/Motion';
import { REPO_URL } from '@/lib/constants';
import { fileSize, getSummary } from '@/lib/data.server';
import { fmtDate, num } from '@/lib/format';
import { DEFAULTS } from '@/lib/engine';

export const metadata: Metadata = { title: 'Method & ground truth' };

const TOC = [
  ['observer', 'The observer'],
  ['boundary', 'What crosses a boundary'],
  ['detectors', 'Detectors'],
  ['assumptions', 'Assumptions'],
  ['preflight', 'Pre-flight scoring'],
  ['limits', 'Limits & false positives'],
  ['validation', 'How we validated'],
  ['data', 'Data'],
  ['privacy', 'This site’s own privacy'],
];

export default function MethodPage() {
  const s = getSummary();
  const kb = (n: string) => `${num(Math.round(fileSize(n) / 1024))} KB`;
  const windowDays = Math.round(DEFAULTS.windowBlocks / 1152);
  return (
    <div className="wrap">
      <header className="page-head">
        <span className="label">05 · Method</span>
        <SplitHeadline className="display">
          How we know, and <em>how sure</em> we are.
        </SplitHeadline>
        <p className="lede">
          Leakscope does not break any cryptography. It models an observer with nothing but the public chain and asks
          what that observer can link. This page lists every rule it applies, what each rule assumes, and where it can
          be wrong.
        </p>
      </header>
      <div className="method-layout">
        <nav className="toc" aria-label="On this page">
          <span className="label">On this page</span>
          <ol>
            {TOC.map(([id, t]) => (
              <li key={id}>
                <a href={`#${id}`}>{t}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="prose">
          <h2 id="observer" style={{ marginTop: 0 }}>
            The observer
          </h2>
          <p>
            Our adversary runs a full node or reads a block explorer. For every transaction it sees the block height and
            time, the transparent inputs and outputs (addresses and values), how many Sapling spends and outputs and
            how many Orchard and Ironwood actions it has, the fee, and the <strong>value balance</strong> of each
            shielded pool: the net amount entering or leaving it. It cannot see shielded senders, recipients, amounts
            or memos. It has unlimited patience and no cryptographic breakthroughs.
          </p>

          <h2 id="boundary">What crosses a boundary</h2>
          <p>Three moves put an exact amount on the public chain:</p>
          <ul>
            <li>
              <strong>Shielding</strong> (transparent → pool): the transparent inputs, their addresses, and the net
              value entering the pool.
            </li>
            <li>
              <strong>Deshielding</strong> (pool → transparent): each transparent output, its address and its value.
            </li>
            <li>
              <strong>Pool crossing</strong>, the turnstile: value moving between Sapling, Orchard and Ironwood shows up
              as one pool&apos;s balance going down by exactly what another&apos;s goes up. Since NU6.3 (block 3,428,143,
              28 July 2026) Orchard is frozen and withdraw-only, so every Orchard holder has to cross this turnstile.
            </li>
          </ul>
          <p>Leakscope calls each of these a boundary event. Everything else stays inside the pools and is not analysed.</p>

          <h2 id="detectors">Detectors</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Leak</th>
                  <th>Rule</th>
                  <th>Severity</th>
                  <th className="n">Found</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Round trip</td>
                  <td>A shielding spends a transparent output created by an earlier deshielding.</td>
                  <td>critical (deterministic)</td>
                  <td className="n">{num(s.findingsByKind['utxo-roundtrip'] ?? 0)}</td>
                </tr>
                <tr>
                  <td>Address reuse</td>
                  <td>A shielding comes from an address that earlier received a deshielding.</td>
                  <td>high (deterministic)</td>
                  <td className="n">{num(s.findingsByKind['address-reuse'] ?? 0)}</td>
                </tr>
                <tr>
                  <td>Quick round trip</td>
                  <td>A withdrawal with exactly one candidate deposit, at most 100 blocks earlier.</td>
                  <td>high</td>
                  <td className="n">{num(s.findingsByKind['quick-roundtrip'] ?? 0)}</td>
                </tr>
                <tr>
                  <td>Amount match</td>
                  <td>A withdrawal with 1 to 10 candidate deposits in the window.</td>
                  <td>1 → high, ≤3 → medium, ≤10 → low</td>
                  <td className="n">{num(s.findingsByKind['amount-link'] ?? 0)}</td>
                </tr>
                <tr>
                  <td>Pool crossing</td>
                  <td>Every turnstile move; how many moves of the same amount happened within the window.</td>
                  <td>unique → medium, ≤10 → low, else info</td>
                  <td className="n">{num(s.findingsByKind['pool-crossing'] ?? 0)}</td>
                </tr>
                <tr>
                  <td>Fee fingerprint</td>
                  <td>The fee paid differs from the ZIP-317 conventional fee for the transaction&apos;s shape.</td>
                  <td>low</td>
                  <td className="n">{num(s.findingsByKind['fee-fingerprint'] ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            A <strong>candidate deposit</strong> for a withdrawal is a boundary event that entered the same pool the
            withdrawal leaves, earlier and within the window, whose amount equals the withdrawal{' '}
            <em>plus that withdrawal&apos;s own fee</em>. The fee is public, so this pins the match to one exact value:
            it is what you see when someone withdraws a whole note they deposited. The <strong>anonymity set</strong>{' '}
            is the number of such candidates. A set of 1 means the observer has exactly one guess.
          </p>

          <h2 id="accuracy">How often is a link wrong?</h2>
          <p>
            A unique match can still be a coincidence. To measure that, we ran the exact same rule{' '}
            <strong>backwards in time</strong>: against deposits made <em>after</em> each withdrawal. Money cannot
            leave before it arrives, so every backward match is a coincidence, and it occurs at the same rate as
            coincidences among the forward matches. That gives a false-link rate measured on the chain&apos;s real
            amount distribution, not on a model of it.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Link</th>
                  <th>Found in range</th>
                  <th>Measured precision</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.amountLinks ?? {}).map(([tier, t]) => (
                  <tr key={tier}>
                    <td>{t.label}</td>
                    <td className="num">{num(t.count)}</td>
                    <td className="num">≈{t.precision}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            What we dropped because it failed this test: unique matches more than a day apart (more backward
            coincidences than forward links) and round amounts (multiples of 0.001 ZEC) more than 10 blocks apart.
            Round trips and address reuse need no such test: they follow the actual coins. Reproduce it with{' '}
            <code>engine/scripts/evaluate.ts</code>.
          </p>
          <p>
            The headline, <strong>{s.deshieldsLinkedAnyWayPct}%</strong>, is the share of deshielding transactions
            that are linked either backwards by a calibrated amount link ({num(s.linkableDeshields)}) or forwards by a
            round trip ({num(s.deshieldsLinkedAnyWay - s.linkableDeshields)} more), out of {num(s.deshieldTxs)}.
          </p>

          <h2 id="assumptions">Assumptions</h2>
          <ul>
            <li>
              <strong>Window:</strong> {windowDays} days ({num(DEFAULTS.windowBlocks)} blocks at 1,152 blocks per day).
              The observer looks this far back for a matching deposit.
            </li>
            <li>
              <strong>Fee gap:</strong> a deposit matches a withdrawal only if it is larger by exactly the
              withdrawal&apos;s own fee. In the rare case the fee can&apos;t be computed, any gap up to{' '}
              {num(DEFAULTS.maxFeeGap)} zatoshis in multiples of 5,000 (the ZIP-317 marginal fee) is accepted. Pre-flight
              uses this looser rule on purpose: it estimates the crowd an amount hides in, before any fee exists.
            </li>
            <li>
              <strong>Direction:</strong> the deposit must precede the withdrawal and enter the pool the withdrawal
              leaves.
            </li>
            <li>
              <strong>Pool crossings</strong> are judged by exact amount within the same window, before and after.
            </li>
          </ul>

          <h2 id="preflight">Pre-flight scoring</h2>
          <p>
            Pre-flight runs the same engine in your browser. It counts recent boundary events with the planned amount
            (same fee rule) and maps that crowd to a score: 1 → 5, up to 3 → 25, up to 10 → 50, up to 50 → 75, more →
            90. Staying in one shielded pool scores 100; a fully transparent transfer scores 0. Reusing an address seen
            at a pool boundary caps the score at 10. In the browser the event index carries no addresses per event, only
            the set of all boundary addresses, so both address checks use that set.
          </p>
          <p>
            Suggestions follow <strong>ZIP 318</strong>: split the amount into {'{1, 2, 5} × 10'}
            <sup>k</sup> denominations between 0.01 and 10,000 ZEC (deterministic digit-by-digit, or randomized), shuffle
            them, start one 144-block bucket after the next boundary, and space them with exponential delays (mean 66
            blocks, about 82 minutes, redrawn above 576). Randomness comes from the browser&apos;s cryptographic RNG.
          </p>

          <h2 id="limits">Limits &amp; false positives</h2>
          <ul>
            <li>
              <strong>Amount matches are probabilistic.</strong> A set of 1 means no other deposit fits, not that the
              link is proven. Two unrelated people can move the same odd amount. Round amounts collect large sets and
              are downgraded automatically. Round trips and address reuse are deterministic.
            </li>
            <li>
              <strong>The anonymity set counts plausible sources</strong>; it does not weigh them. A real observer
              would add timing, wallet fingerprints and off-chain knowledge, so these numbers are a lower bound on what
              can be linked.
            </li>
            <li>
              <strong>Edges of the range.</strong> Withdrawals early in the range see less than {windowDays} days of
              history, which can make a match look more unique than it is. The report generator supports a warm-up
              period to remove this; the range shown here is labelled on every page.
            </li>
            <li>
              <strong>Custodians and batches.</strong> Exchanges batch many users into one transaction. A match may
              link a user to an exchange rather than to a person.
            </li>
            <li>
              <strong>Fees</strong> are only computed when every input value is known.
            </li>
            <li>Fully shielded transactions are not analysed beyond their existence, timing and shape.</li>
          </ul>

          <h2 id="validation">How we validated</h2>
          <h3>Our own testnet mistakes were caught</h3>
          <p>
            We made deliberate mistakes with our own testnet wallet and ran the same pipeline over those blocks. Both
            were found, along with the exact amounts the pool crossings revealed:
          </p>
          <ul>
            <li>
              Round trip: <TxRef txid="85e9872f6584ca79f3d7ac22f1d8aacaa5207966a49dc954bcc3d1a1f102df46" check={false} explorer={false} /> →{' '}
              <TxRef txid="1d15b95d399d66ce544e69e4a1e986563c9b47d84caaed7a0e4e95c1a7b19bb9" check={false} explorer={false} />
            </li>
            <li>
              Quick round trip: <TxRef txid="4080c7a2fb75d7197fa96ae69d4c4d9a5249a8f41b9a22bb419dca9ed340b5ab" check={false} explorer={false} /> →{' '}
              <TxRef txid="8225aad03341b047d2a5963ee743e25463d2c36a42aed47bb2ea24a014b90a5f" check={false} explorer={false} />
            </li>
          </ul>
          <p>
            The <Link href="/scan/">wallet scan</Link> reproduces this from that wallet&apos;s public viewing key.
          </p>
          <h3>Regtest and unit tests</h3>
          <p>
            On a private regtest chain we reproduced each leak class in scripted scenarios, so each detector was checked
            against transactions whose owners we know. The engine&apos;s unit tests cover every detector and the ZIP-318
            planner, and the transaction parser is tested against real mainnet transactions.
          </p>
          <h3>Mainnet spot checks against an independent explorer</h3>
          <p>
            We compared findings with zecblock.com. For example,{' '}
            <TxRef txid="c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd" /> shielded 2.50121076 ZEC
            into Sapling at block 3,428,153; seven blocks later{' '}
            <TxRef txid="57d7d945f70c88853f800519dd3d2b8a2fd8cff990aa02e16e8f81472e34fe3d" /> deshielded 2.50106076 ZEC
            from Sapling: the same amount minus a 15,000-zatoshi fee, with no other candidate in the window.
          </p>

          <h2 id="data">Data</h2>
          <p>
            Mainnet blocks <strong className="num">{num(s.range.from)}</strong> to{' '}
            <strong className="num">{num(s.range.to)}</strong> ({s.range.days} days), {num(s.txs)} transactions and{' '}
            {num(s.boundaryEvents)} boundary events, read from public lightwalletd servers and parsed by our own
            transaction parser. Report generated {fmtDate(Date.parse(s.generatedAt) / 1000, true)}.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Contents</th>
                  <th className="n">Size</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['summary.json', 'headline counts'],
                  ['days.json', 'per-day series'],
                  ['links.json', 'linked pairs drawn on the Observatory'],
                  ['examples.json', 'the most telling finding of each kind'],
                  ['event-index.json', 'every boundary event (amount, height, direction, pools), for pre-flight'],
                  ['boundary-addresses.json', 'every transparent address seen at a boundary'],
                  ['findings/xx.json', 'all findings, sharded by the first byte of each txid'],
                ].map(([f, d]) => (
                  <tr key={f}>
                    <td className="mono">{f}</td>
                    <td>{d}</td>
                    <td className="n">{f.includes('xx') ? '256 files' : kb(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Everything is reproducible: the indexer writes one JSON line per transaction, and{' '}
            <code>engine/scripts/report.ts</code> turns them into these files.{' '}
            {REPO_URL ? (
              <>
                Source: <a href={REPO_URL}>{REPO_URL.replace(/^https?:\/\//, '')}</a>.
              </>
            ) : (
              'The source is open; the repository link is listed with our ZECATHON submission.'
            )}
          </p>

          <h2 id="privacy">This site&apos;s own privacy</h2>
          <ul>
            <li>Static files only: no server code, no analytics, no cookies, no third-party scripts or fonts at runtime.</li>
            <li>
              <strong>Check</strong> requests one shard named by the first byte of the txid (shared by about 1/256 of
              all transactions), or every shard in paranoid mode. The txid stays after the <code>#</code> in the URL,
              which browsers never send.
            </li>
            <li>
              <strong>Pre-flight</strong> downloads the same public index for everyone and computes locally.
            </li>
            <li>
              <strong>Scan</strong> keeps the viewing key inside a WebAssembly module in the tab. Blocks come from a
              public proxy that learns only the height range and your IP address.
            </li>
            <li>
              Explorer links are opt-in and labelled: following one tells that explorer which transaction you care
              about.
            </li>
          </ul>
        </article>
      </div>
    </div>
  );
}
