import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import { SiteHeader } from '@/components/SiteHeader';
import { SmoothScroll } from '@/components/SmoothScroll';
import { getCoverage } from '@/lib/data.server';
import { num } from '@/lib/format';
import Link from 'next/link';
import { REPO_URL } from '@/lib/constants';
import './globals.css';

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif' });
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://leakscope-cyan.vercel.app';
const DESCRIPTION =
  'Shielded Zcash hides sender, receiver and amount, but the edges of the pools are public. Leakscope shows what an observer can link, checks a transaction, and plans leak-free migrations to Ironwood.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Leakscope — what the Zcash chain still gives away', template: '%s · Leakscope' },
  description: DESCRIPTION,
  referrer: 'no-referrer',
  openGraph: {
    type: 'website',
    siteName: 'Leakscope',
    title: 'Leakscope — what the Zcash chain still gives away',
    description: DESCRIPTION,
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Leakscope: 24.6% of withdrawals since Ironwood launched can be linked' }],
  },
  twitter: { card: 'summary_large_image', title: 'Leakscope — what the Zcash chain still gives away', description: DESCRIPTION, images: ['/og.png'] },
};

export const viewport: Viewport = { themeColor: '#0b0d0c', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const c = getCoverage();
  const range = `${num(c.from)}–${num(c.to)}`;
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <SmoothScroll />
        <SiteHeader range={range} span={c.span} />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <p className="mono small">
              LEAKSCOPE · ZECATHON 2026 · data {c.span} · Zcash mainnet blocks {range}
            </p>
            <p className="small dim">
              Static site: no analytics, no cookies, no Leakscope backend. Every check runs in your browser against files
              served with this page. Only Scan fetches public compact blocks, from a public lightwalletd proxy
              (ChainSafe) that sees the block range and your IP address, never your key.
            </p>
            <nav aria-label="Project" className="footer-links mono small">
              <a href="/demo.mp4">▶ 2-min demo video</a>
              <a href="/deck.pdf">Pitch deck (PDF)</a>
              <Link href="/#developers">For wallet developers</Link>
              <Link href="/method/">Method &amp; accuracy</Link>
              <Link href="/method/#accuracy">How often links are wrong</Link>
              {REPO_URL && (
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  Source on GitHub ↗
                </a>
              )}
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
