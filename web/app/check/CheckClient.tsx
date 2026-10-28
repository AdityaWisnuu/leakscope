'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PrivacyNote } from '@/components/Bits';
import { AUTO_KEY } from '@/components/CheckLink';
import { FindingCard } from '@/components/FindingCard';
import { isTxid, num, SEVERITY_ORDER, shortTx } from '@/lib/format';
import { findingsFor, loadAllShards } from '@/lib/shards';
import { loadTxSet } from '@/lib/txset';
import type { Finding } from '@/lib/types';

type State =
  | { k: 'idle' }
  /** Opened from a shared link: nothing is fetched until the visitor chooses to look it up. */
  | { k: 'shared'; txid: string }
  | { k: 'loading'; txid: string; note?: string }
  | { k: 'found'; txid: string; findings: Finding[] }
  /** inData: whether the txid is in the indexed blocks (null if the membership filter could not load). */
  | { k: 'none'; txid: string; inData: boolean | null }
  | { k: 'error'; msg: string };

export interface CoverageProps {
  from: number;
  to: number;
  fromDate: string;
  toDate: string;
  span: string;
}

export function CheckClient({ range, samples }: { range: CoverageProps; samples: { txid: string; label: string }[] }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [state, setState] = useState<State>({ k: 'idle' });

  const lookup = useCallback(
    async (raw: string) => {
      const txid = raw.trim().toLowerCase();
      if (!isTxid(txid)) {
        setState({
          k: 'error',
          msg: 'That is not a transaction id. A transaction id is 64 characters of 0–9 and a–f, like the examples below.',
        });
        return;
      }
      // The fragment never reaches any server, so sharing the URL is the only way it travels.
      history.replaceState(null, '', `#${txid}`);
      setState({ k: 'loading', txid });
      try {
        if (all) await loadAllShards((d, t) => setState({ k: 'loading', txid, note: `${d}/${t} shards` }));
        const m = await findingsFor([txid]);
        const f = (m.get(txid) ?? []).sort(
          (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
        );
        if (f.length) {
          setState({ k: 'found', txid, findings: f });
          return;
        }
        // No finding: is it a clean transaction we indexed, or one we never saw?
        // The whole filter is downloaded once, so this asks the server nothing about the txid.
        setState({ k: 'loading', txid, note: 'checking whether it is in our data' });
        const inData = await loadTxSet().then((s) => s.has(txid), () => null);
        setState({ k: 'none', txid, inData });
      } catch (e) {
        setState({ k: 'error', msg: (e as Error).message });
      }
    },
    [all],
  );

  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
      if (!isTxid(h)) return;
      setQ(h);
      // A "check" link clicked inside the site looks up at once; a link opened from elsewhere waits.
      let auto = false;
      try {
        auto = sessionStorage.getItem(AUTO_KEY) === h;
        sessionStorage.removeItem(AUTO_KEY);
      } catch {
        /* storage blocked */
      }
      if (auto) lookup(h);
      else setState({ k: 'shared', txid: h });
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack" style={{ gap: 28 }}>
      <form
        className="searchbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(q);
        }}
      >
        <label htmlFor="txid" className="sr-only">
          Transaction id
        </label>
        <input
          id="txid"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Paste a transaction id (64 hex characters)"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
        />
        <button className="btn" type="submit">
          Check
        </button>
      </form>
      <details className="helper">
        <summary>Where do I find my transaction id?</summary>
        <p>
          In your wallet, open the transaction in its history or activity list and look for <em>Transaction ID</em>,{' '}
          <em>TxID</em> or <em>transaction hash</em>; most wallets let you copy it. On an exchange, look for the TxID in
          your withdrawal or deposit history. Any Zcash block explorer shows it too, but searching there tells that
          explorer which transaction you care about.
        </p>
      </details>
      <div className="row2 check-opts" style={{ maxWidth: 920, alignItems: 'start' }}>
        <PrivacyNote>
          <strong>Looked up in this tab.</strong> Findings are static files on this site, split into 256 shards. Only
          the shard name, the first two characters of the txid (shared by about 1 in 256 transactions), is requested
          from the server. The full txid stays in this tab: it is kept after the <code className="mono">#</code> in the
          address bar, which browsers never send.
        </PrivacyNote>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>
            Paranoid mode: download every shard, so even the first byte stays private (roughly 10 MB to download, once per visit).
          </span>
        </label>
      </div>
      {state.k !== 'loading' && (
        <div className="stack" style={{ gap: 10 }}>
          <span className="label">{state.k === 'idle' || state.k === 'shared' ? 'Or try a real mainnet finding' : 'Try a real mainnet finding'}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {samples.map((s) => (
              <button
                key={s.txid}
                type="button"
                className="chip"
                onClick={() => {
                  setQ(s.txid);
                  lookup(s.txid);
                }}
              >
                {s.label} · {shortTx(s.txid, 8)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div aria-live="polite" className="stack">
        {state.k === 'shared' && (
          <div className="empty">
            <h2>Look up this transaction?</h2>
            <p>
              This link contains <code className="mono break">{state.txid}</code>. Nothing has been fetched yet.
            </p>
            <p>
              Looking it up requests one findings shard named by the first two characters of the txid (
              <code className="mono">{state.txid.slice(0, 2)}</code>, shared by about 1 in 256 transactions). Tick
              paranoid mode above to download every shard instead, so not even that is revealed.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm" onClick={() => lookup(state.txid)}>
                Look up {all ? '(all shards)' : ''}
              </button>
            </div>
          </div>
        )}
        {state.k === 'loading' && <p className="status">Loading findings… {state.note ?? ''}</p>}
        {state.k === 'error' && (
          <p className="status" role="alert" style={{ color: 'var(--accent-ink)' }}>
            {state.msg}
          </p>
        )}
        {state.k === 'none' && <NoFinding txid={state.txid} inData={state.inData} range={range} />}
        {state.k === 'found' && (
          <>
            <p className="verdict">
              {state.findings.length} finding{state.findings.length === 1 ? '' : 's'} for{' '}
              <span className="mono" style={{ fontSize: '0.6em' }}>
                {shortTx(state.txid, 12)}
              </span>
            </p>
            {state.findings.map((f, i) => (
              <FindingCard key={i} f={f} focus={state.txid} advice />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function NoFinding({ txid, inData, range }: { txid: string; inData: boolean | null; range: CoverageProps }) {
  const blocks = `mainnet blocks ${num(range.from)}–${num(range.to)}`;
  const next = (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
      <Link className="btn sm" href="/plan/">
        Plan your next transfer →
      </Link>
      <Link className="btn ghost sm" href="/scan/">
        Scan your whole wallet →
      </Link>
    </div>
  );
  const caveat = (
    <p>
      A clean result is not a guarantee. It means this transaction did not match a deposit by amount, round-trip coins,
      reuse a boundary address, reveal a one-of-a-kind migration amount or pay an unusual fee. Fully shielded
      transactions are not analysed here, and their timing and size are still public.
    </p>
  );
  if (inData === false) {
    return (
      <div className="empty">
        <h2>Not in our data, so we couldn&apos;t check it.</h2>
        <p>
          <code className="mono break">{txid}</code> is not one of the transactions in {blocks} ({range.span}).
        </p>
        <div className="callout">
          <p>
            <strong>Sent after {range.toDate}?</strong> It is newer than our data. <strong>Before {range.fromDate}?</strong>{' '}
            It is older. Otherwise the id may have a typo: copy it again from your wallet.
          </p>
        </div>
        <p className="small dim" style={{ margin: 0 }}>
          Until then, Pre-flight can still check your next transfer against the most recent public history we have.
        </p>
        {next}
      </div>
    );
  }
  return (
    <div className="empty">
      <h2>Nothing linkable found in our data.</h2>
      {inData ? (
        <p>
          <code className="mono break">{txid}</code> is in {blocks} ({range.span}), and it is not part of any
          finding.
        </p>
      ) : (
        <>
          <p>
            We checked <code className="mono break">{txid}</code> against every finding in {blocks} ({range.span}).
          </p>
          <div className="callout">
            <p>
              <strong>Sent after {range.toDate}?</strong> It is newer than our data, so we couldn&apos;t check it.{' '}
              <strong>Not sure the id is right?</strong> We could not confirm that this transaction is in our data.
            </p>
          </div>
        </>
      )}
      {caveat}
      {inData && (
        <p className="small dim" style={{ margin: 0 }}>
          Whether a transaction is in our data is checked against a compact list of every indexed txid, downloaded in
          full (about 1 MB), so the server is not asked about this one. About 1 in 400 unknown ids is wrongly taken to
          be in it.
        </p>
      )}
      {next}
    </div>
  );
}
