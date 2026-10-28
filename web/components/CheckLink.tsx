'use client';
import Link from 'next/link';

/** Key under which an in-site "check" click marks its txid for an immediate lookup. */
export const AUTO_KEY = 'leakscope:auto-check';

/**
 * A link to /check/#txid from inside the site. Clicking it is the visitor's own choice, so the
 * lookup runs at once; the same URL opened from outside (a shared link) waits for a button press.
 */
export function CheckLink({ txid, className, children }: { txid: string; className?: string; children: React.ReactNode }) {
  return (
    <Link
      className={className}
      href={`/check/#${txid}`}
      onClick={() => {
        try {
          sessionStorage.setItem(AUTO_KEY, txid);
        } catch {
          /* storage blocked: the visitor just presses Look up */
        }
      }}
    >
      {children}
    </Link>
  );
}
