import Link from 'next/link';
import { EXPLORER } from '@/lib/constants';
import { shortTx } from '@/lib/format';
import type { Severity } from '@/lib/types';

export function Sev({ s }: { s: Severity }) {
  return <span className={`sev sev-${s}`}>{s}</span>;
}

export const EXPLORER_NOTE = 'Opens zecblock.com in a new tab. That explorer learns you looked up this transaction.';

/** A transaction reference: local lookup first, explorer only on explicit click. */
export function TxRef({ txid, full = false, check = true, explorer = true }: { txid: string; full?: boolean; check?: boolean; explorer?: boolean }) {
  return (
    <span className="txref">
      <code className="break" title={txid}>
        {full ? txid : shortTx(txid, 10)}
      </code>
      {check && (
        <Link className="ext" href={`/check/#${txid}`}>
          check
        </Link>
      )}
      {explorer && (
      <a className="ext" href={`${EXPLORER}${txid}`} target="_blank" rel="noopener noreferrer" title={EXPLORER_NOTE}>
        explorer ↗<span className="sr-only"> ({EXPLORER_NOTE})</span>
      </a>
      )}
    </span>
  );
}

export function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <path d="M12 14.5v2.5" />
    </svg>
  );
}

export function PrivacyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="privacy-note" role="note">
      <LockIcon />
      <div>{children}</div>
    </div>
  );
}
