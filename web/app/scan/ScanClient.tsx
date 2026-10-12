'use client';
import { useEffect, useRef, useState } from 'react';
import { PrivacyNote, TxRef } from '@/components/Bits';
import { FindingCard } from '@/components/FindingCard';
import { IRONWOOD_ACTIVATION } from '@/lib/constants';
import { num, SEVERITY_ORDER, zec } from '@/lib/format';
import { PROXIES, scanWallet, TESTNET_DEMO, type Network, type OwnedTx, type ScanProgress } from '@/lib/scanner';
import { DATASETS, findingsFor, loadAllShards } from '@/lib/shards';
import type { Finding, Summary } from '@/lib/types';

type Phase =
  | { k: 'idle' }
  | { k: 'scanning'; p: ScanProgress | null; started: number }
  | { k: 'matching'; done: number; total: number }
  | { k: 'done'; report: Report }
  | { k: 'error'; msg: string };

interface Report {
  network: Network;
  pools: string[];
  owned: OwnedTx[];
  txids: string[];
  findings: Map<string, Finding[]>;
  range: Summary['range'] | null;
  scanned: { from: number; to: number };
}

const networkOf = (k: string): Network | null =>
  /^uviewtest1/.test(k.trim()) ? 'test' : /^uview1/.test(k.trim()) ? 'main' : null;

export function ScanClient() {
  const [ufvk, setUfvk] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [allShards, setAllShards] = useState(true);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const net = networkOf(ufvk);

  useEffect(() => () => abort.current?.abort(), []);

  const loadDemo = () => {
    setUfvk(TESTNET_DEMO.ufvk);
    setFrom(String(TESTNET_DEMO.from));
    setTo(String(TESTNET_DEMO.to));
  };

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!net) {
      setPhase({ k: 'error', msg: 'That does not look like a unified full viewing key (uview1… or uviewtest1…).' });
      return;
    }
    const start = from ? Number(from) : net === 'main' ? IRONWOOD_ACTIVATION : NaN;
    if (!Number.isInteger(start) || start < 1) {
      setPhase({ k: 'error', msg: 'Enter a start height (your wallet birthday or earlier).' });
      return;
    }
    const end = to ? Number(to) : 'tip';
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setPhase({ k: 'scanning', p: null, started: performance.now() });
    try {
      const res = await scanWallet(ufvk, start, end, (p) => setPhase((ph) => (ph.k === 'scanning' ? { ...ph, p } : ph)), ac.signal);
      const ds = res.network;
      setPhase({ k: 'matching', done: 0, total: allShards ? 256 : 1 });
      if (allShards) await loadAllShards((done, total) => setPhase({ k: 'matching', done, total }), ds);
      const [findings, range] = await Promise.all([
        findingsFor(res.txids, ds),
        fetch(`${DATASETS[ds]}/summary.json`)
          .then((r) => (r.ok ? (r.json() as Promise<Summary>) : null))
          .then((s) => s?.range ?? null)
          .catch(() => null),
      ]);
      setPhase({
        k: 'done',
        report: {
          network: res.network,
          pools: res.pools,
          owned: res.owned,
          txids: res.txids,
          findings,
          range,
          scanned: { from: start, to: typeof end === 'number' ? end : res.owned.at(-1)?.height ?? start },
        },
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') setPhase({ k: 'idle' });
      else setPhase({ k: 'error', msg: (err as Error).message || String(err) });
    }
  };

  const busy = phase.k === 'scanning' || phase.k === 'matching';

  return (
    <div className="tool-grid">
      <form className="panel" onSubmit={run} aria-describedby="scan-privacy">
        <div className="panel-head">
          <span className="label">
            Input · <b>viewing key</b>
          </span>
          <button type="button" className="btn ghost sm" onClick={loadDemo} disabled={busy}>
            Use testnet demo key
          </button>
        </div>
        <div className="panel-body form-stack">
          <label className="field">
            <span>Unified full viewing key</span>
            <textarea
              value={ufvk}
              onChange={(e) => setUfvk(e.target.value)}
              placeholder="uview1… (mainnet) or uviewtest1… (testnet)"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              rows={4}
              disabled={busy}
              style={{ fontSize: 13 }}
            />
            <span className="hint">
              {net
                ? `${net === 'main' ? 'Mainnet' : 'Testnet'} key · blocks from ${PROXIES[net].replace('https://', '')}`
                : 'A viewing key can see your transactions but cannot spend. Never paste a seed phrase or spending key.'}
            </span>
          </label>
          <div className="row2">
            <label className="field">
              <span>From height</span>
              <input
                type="text"
                inputMode="numeric"
                value={from}
                onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
                placeholder={net === 'test' ? 'birthday' : String(IRONWOOD_ACTIVATION)}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>To height</span>
              <input
                type="text"
                inputMode="numeric"
                value={to}
                onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))}
                placeholder="chain tip"
                disabled={busy}
              />
            </label>
          </div>
          <p className="hint small dim" style={{ margin: 0 }}>
            Start at or before your wallet&apos;s birthday, or spends of earlier notes are missed. Mainnet defaults to
            Ironwood activation ({num(IRONWOOD_ACTIVATION)}); scanning runs at roughly 200 blocks per second.
          </p>
          <label className="check">
            <input type="checkbox" checked={allShards} onChange={(e) => setAllShards(e.target.checked)} disabled={busy} />
            <span>
              Download all findings shards to match against (recommended). Otherwise only the shards for your
              transactions&apos; first byte are requested, which hints at which transactions are yours.
            </span>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="submit" disabled={busy || !ufvk.trim()}>
              {busy ? 'Scanning…' : 'Scan locally'}
            </button>
            {busy && (
              <button type="button" className="btn ghost" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            )}
            {!busy && ufvk && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setUfvk('');
                  setPhase({ k: 'idle' });
                }}
              >
                Forget key
              </button>
            )}
          </div>
        </div>
      </form>

      <div className="stack" aria-live="polite">
        <div id="scan-privacy">
          <PrivacyNote>
            <strong>Your key never leaves this tab.</strong> The scanner is WebAssembly running on your device. It
            downloads <em>every</em> compact block in the range from a public lightwalletd proxy and trial-decrypts them
            here, so the proxy learns only the height range and your IP address, not which transactions are yours.
            Findings are matched against static files from this site. Nothing is stored.
          </PrivacyNote>
        </div>
        <Status phase={phase} />
        {phase.k === 'done' && <ReportView r={phase.report} />}
        {phase.k === 'idle' && (
          <div className="empty">
            <h2>What you will get</h2>
            <p style={{ margin: 0 }}>
              The transactions your key can see, and for each one every leak an outside observer can find: round trips,
              amount matches, address reuse, revealed migration amounts and fee fingerprints. Try the testnet demo key:
              it belongs to a wallet we used to make deliberate mistakes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Status({ phase }: { phase: Phase }) {
  if (phase.k === 'scanning') {
    const p = phase.p;
    const frac = p ? (p.height - p.from + 1) / Math.max(1, p.to - p.from + 1) : 0;
    const secs = (performance.now() - phase.started) / 1000;
    const rate = p ? (p.height - p.from + 1) / Math.max(0.1, secs) : 0;
    return (
      <div className="panel panel-body stack">
        <span className="label">
          Scanning · <b>{p ? `${num(p.height)} / ${num(p.to)}` : 'loading scanner and chain tip…'}</b>
        </span>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
          <i style={{ width: `${(frac * 100).toFixed(1)}%` }} />
        </div>
        {p && (
          <span className="status">
            {num(Math.round(rate))} blocks/s · {num(p.notes)} notes · {num(p.txs)} wallet transactions so far
          </span>
        )}
      </div>
    );
  }
  if (phase.k === 'matching') {
    return (
      <div className="panel panel-body stack">
        <span className="label">
          Matching findings · <b>{phase.done}/{phase.total}</b> shards
        </span>
        <div className="progress">
          <i style={{ width: `${(100 * phase.done) / phase.total}%` }} />
        </div>
      </div>
    );
  }
  if (phase.k === 'error') {
    return (
      <div className="empty" role="alert">
        <h2>Scan stopped</h2>
        <p style={{ margin: 0 }}>{phase.msg}</p>
      </div>
    );
  }
  return null;
}

function flow(t: OwnedTx) {
  const by = (xs: { pool: string; value: number }[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x.pool, (m.get(x.pool) ?? 0) + x.value);
    return [...m].map(([p, v]) => `${zec(v)} ${p}`).join(', ');
  };
  const parts = [];
  if (t.received.length) parts.push(`received ${by(t.received)}`);
  if (t.spent.length) parts.push(`spent ${by(t.spent)}`);
  return parts.join(' · ');
}

function ReportView({ r }: { r: Report }) {
  const all = [...new Set([...r.findings.values()].flat())];
  const worst = SEVERITY_ORDER.find((s) => all.some((f) => f.severity === s));
  const byTx = new Map(r.owned.map((t) => [t.txid, t]));
  const leaky = r.txids.filter((t) => r.findings.has(t));
  const clean = r.txids.filter((t) => !r.findings.has(t));
  const rank = (t: string) => Math.min(...(r.findings.get(t) ?? []).map((f) => SEVERITY_ORDER.indexOf(f.severity)));
  leaky.sort((a, b) => rank(a) - rank(b));

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <span className="label">
            Personal leak report · <b>{r.network === 'main' ? 'mainnet' : 'testnet'}</b> · pools {r.pools.join(', ')}
          </span>
          <span className="label">
            scanned {num(r.scanned.from)}–{num(r.scanned.to)}
          </span>
        </div>
        <div className="panel-body">
          <p className="verdict">
            {r.txids.length === 0
              ? 'No transactions found for this key in that range.'
              : leaky.length === 0
                ? `${r.txids.length} transactions, no boundary leak found.`
                : `${leaky.length} of your ${r.txids.length} transactions leak${worst ? `; worst: ${worst}` : ''}.`}
          </p>
          <p className="ink2" style={{ margin: 0 }}>
            {r.range
              ? `Findings cover the indexed range, blocks ${num(r.range.from)}–${num(r.range.to)}. Transactions outside it are listed but not analysed. `
              : ''}
            Transparent-only activity is not visible to a viewing-key scan.
          </p>
        </div>
      </div>
      {leaky.map((t) => (
        <section key={t} className="stack" style={{ gap: 8 }}>
          <div className="label" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <TxRef txid={t} check={r.network === 'main'} explorer={r.network === 'main'} />
            {byTx.get(t) && (
              <span>
                block {num(byTx.get(t)!.height)} · {flow(byTx.get(t)!)}
              </span>
            )}
          </div>
          {r.findings.get(t)!.map((f, i) => (
            <FindingCard key={i} f={f} focus={t} mainnet={r.network === 'main'} />
          ))}
        </section>
      ))}
      {clean.length > 0 && (
        <details className="panel panel-body">
          <summary className="label" style={{ cursor: 'pointer' }}>
            {clean.length} transaction{clean.length === 1 ? '' : 's'} with no finding
          </summary>
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
            {clean.map((t) => (
              <li key={t} className="small">
                <TxRef txid={t} check={r.network === 'main'} explorer={r.network === 'main'} />{' '}
                {byTx.get(t) && <span className="dim">block {num(byTx.get(t)!.height)} · {flow(byTx.get(t)!)}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
