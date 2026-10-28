'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { REPO_URL } from '@/lib/constants';

const NAV = [
  { href: '/', label: 'Observatory', short: 'Home', n: '01' },
  { href: '/check/', label: 'Check a tx', short: 'Check', n: '02' },
  { href: '/plan/', label: 'Pre-flight', short: 'Pre-flight', n: '03' },
  { href: '/scan/', label: 'Scan wallet', short: 'Scan', n: '04' },
  { href: '/method/', label: 'Method', short: 'Method', n: '05' },
];

/** range: block heights, e.g. "3,428,143–3,515,250"; span: the same as dates, e.g. "28 Jul – 12 Oct 2026". */
export function SiteHeader({ range, span }: { range: string; span: string }) {
  const path = usePathname() ?? '/';
  const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link href="/" className="brand" aria-label="Leakscope home">
          <Reticle />
          <span>Leakscope</span>
        </Link>
        <nav aria-label="Main">
          <ul>
            {NAV.map((n) => {
              const active = norm(path) === n.href || (n.href === '/' && path === '/');
              return (
                <li key={n.href}>
                  <Link href={n.href} aria-current={active ? 'page' : undefined}>
                    <span className="nav-n" aria-hidden>
                      {n.n}
                    </span>
                    <span className="nav-long">{n.label}</span>
                    <span className="nav-short">{n.short}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="readout mono" title={`Zcash mainnet blocks ${range}`} aria-label={`Data covers ${span}, mainnet blocks ${range}`}>
          <span className="dot" aria-hidden /> DATA <span className="dim">{span.toUpperCase()}</span>
        </p>
        <Link className="repo-link mono dev-link" href="/#developers">
          Developers
        </Link>
        {REPO_URL && (
          <a className="repo-link mono" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
        )}
      </div>
    </header>
  );
}

export function Reticle({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="reticle">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="2.2" fill="var(--accent)" />
      <path d="M12 0v6M12 18v6M0 12h6M18 12h6" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
