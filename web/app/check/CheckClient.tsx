'use client';
import { useCallback, useEffect, useState } from 'react';
import { PrivacyNote } from '@/components/Bits';
import { FindingCard } from '@/components/FindingCard';
import { isTxid, num, SEVERITY_ORDER, shortTx } from '@/lib/format';
import { findingsFor, loadAllShards } from '@/lib/shards';
import type { Finding } from '@/lib/types';

type State =
  | { k: 'idle' }
  | { k: 'loading'; txid: string; note?: string }
  | { k: 'found'; txid: string; findings: Finding[] }
  | { k: 'none'; txid: string }
  | { k: 'error'; msg: string };

export function CheckClient({ range, samples }: { range: { from: number; to: number }; samples: { txid: string; label: string }[] }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [state, setState] = useState<State>({ k: 'idle' });

  const lookup = useCallback(
    async (raw: string) => {
      const txid = raw.trim().toLowerCase();
      if (!isTxid(txid)) {
        setState({ k: 'error', msg: 'A transaction id is 64 hexadecimal characters.' });
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
        setState(f.length ? { k: 'found', txid, findings: f } : { k: 'none', txid });
      } catch (e) {
        setState({ k: 'error', msg: (e as Error).message });
      }
    },
    [all],
  );

  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
      if (isTxid(h)) {
        setQ(h);
        lookup(h);
      }
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
      <div className="row2" style={{ maxWidth: 920, alignItems: 'start' }}>
        <PrivacyNote>
          <strong>Looked up locally.</strong> Findings are static files on this site, split into 256 shards by the first
          byte of the txid. Only that shard is requested; the txid itself stays in this tab (it is kept after the{' '}
          <code className="mono">#</code> in the address bar, which browsers never send).
        </PrivacyNote>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>
            Paranoid mode: download every shard, so even the first byte stays private (a few MB, once per visit).
          </span>
        </label>
      </div>
      {state.k === 'idle' && (
        <div className="stack" style={{ gap: 10 }}>
          <span className="label">Or try a real mainnet finding</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {samples.map((s) => (
              <button
                key={s.txid}
                type="button"
                className="chip"
                aria-pressed="true"
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
        {state.k === 'loading' && <p className="status">Loading findings… {state.note ?? ''}</p>}
        {state.k === 'error' && (
          <p className="status" role="alert" style={{ color: 'var(--accent-ink)' }}>
            {state.msg}
          </p>
        )}
        {state.k === 'none' && (
          <div className="empty">
            <h2>No boundary leak found.</h2>
            <p>
              <code className="mono break">{state.txid}</code> is not part of any finding in the indexed range, mainnet
              blocks {num(range.from)}–{num(range.to)}.
            </p>
            <p style={{ margin: 0 }}>
              That means: it did not match a deposit by amount, round-trip coins, reuse a boundary address, reveal a
              one-of-a-kind migration amount or pay an unusual fee. It does not mean the transaction exists, or that it
              is private in every respect: fully shielded transactions are not analysed here, and their timing and
              size are still public. Transactions outside the range are not covered.
            </p>
          </div>
        )}
        {state.k === 'found' && (
          <>
            <p className="verdict">
              {state.findings.length} finding{state.findings.length === 1 ? '' : 's'} for{' '}
              <span className="mono" style={{ fontSize: '0.6em' }}>
                {shortTx(state.txid, 12)}
              </span>
            </p>
            {state.findings.map((f, i) => (
              <FindingCard key={i} f={f} focus={state.txid} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
