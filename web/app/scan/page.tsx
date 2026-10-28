import type { Metadata } from 'next';
import { SplitHeadline } from '@/components/Motion';
import { ScanClient } from './ScanClient';

export const metadata: Metadata = { title: 'Scan your wallet', description: 'Scan your own Zcash wallet locally with a viewing key (testnet demo included) and see which of your transactions leak at pool boundaries. Keys never leave the browser.', openGraph: { title: 'Scan your wallet · Leakscope', description: 'Scan your own Zcash wallet locally with a viewing key (testnet demo included) and see which of your transactions leak at pool boundaries. Keys never leave the browser.', images: ['/og.png'] } };

export default function ScanPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <span className="label">04 · Wallet scan</span>
        <SplitHeadline className="display">
          Your own leaks, <em>found locally</em>.
        </SplitHeadline>
        <p className="lede">
          Paste a viewing key. A WebAssembly scanner finds your shielded transactions on this device, then Leakscope shows
          what an outside observer can link them to. <strong>The key never leaves the browser.</strong>
        </p>
      </header>
      <ScanClient />
      <section className="section prose">
        <h2>Limits worth knowing</h2>
        <ul>
          <li>
            <strong>Transparent-only activity is invisible</strong> to a viewing-key scan. Shielding and deshielding
            transactions are found, because they touch your shielded notes.
          </li>
          <li>
            <strong>Start at or before your wallet birthday.</strong> The scanner recognises a spend only if it saw the
            note being created.
          </li>
          <li>
            <strong>Findings come from the indexed range.</strong> A wallet transaction outside it is listed but has no
            analysis yet.
          </li>
          <li>
            The block proxy (a public lightwalletd server run by ChainSafe) sees your IP address and the height range
            requested, with the start rounded down to a multiple of 1,000. Use a VPN or Tor if that matters, or scan a
            wider range than your activity.
          </li>
        </ul>
      </section>
    </div>
  );
}
