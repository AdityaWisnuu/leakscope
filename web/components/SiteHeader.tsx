'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { REPO_URL } from '@/lib/constants';

const NAV = [
  { href: '/', label: 'Observatory', n: '01' },
  { href: '/check/', label: 'Check a tx', n: '02' },
  { href: '/plan/', label: 'Pre-flight', n: '03' },
  { href: '/scan/', label: 'Scan wallet', n: '04' },
  { href: '/method/', label: 'Method', n: '05' },
];

export function SiteHeader({ range }: { range: string }) {
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
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="readout mono" aria-label={`Indexed mainnet blocks ${range}`}>
          <span className="dot" aria-hidden /> MAINNET <span className="dim">{range}</span>
        </p>
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
