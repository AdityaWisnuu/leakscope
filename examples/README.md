# Examples: Leakscope in a wallet

Both use the built package in `engine/dist` (run `cd engine && bun install && bun run build` first if it is missing).

In your own project, install from npm:

```sh
npm install @leakscope/engine
```

```js
import { checkSend, loadPublishedContext } from '@leakscope/engine';
const ctx = await loadPublishedContext();   // or { baseUrl: 'https://your-cdn/leakscope' }
console.log(checkSend({ from: 'orchard', to: 'transparent', amountZat: 1_234_560_000 }, ctx).headline);
```

`loadPublishedContext()` downloads two static, same-for-everyone files (`event-index.json`,
`boundary-addresses.json`) from `https://leakscope-cyan.vercel.app/data` by default. Nothing about the planned
send is ever requested. To avoid contacting that host at all, copy `web/public/data/` to your own server and
pass `baseUrl`, or load the files yourself with `contextFromIndex()`
(see [`engine/README.md`](../engine/README.md#loadpublishedcontextopts--promisewalletcontext)).

## node-preflight

A wallet asks Leakscope before it sends, in plain Node (18+).

```sh
cd examples/node-preflight
npm install
node index.mjs 12.3456 t1TdD3uh5E8UunUUmkeTumPb4823pd9JVUv   # danger: unique amount, reused address
node index.mjs 1                                              # ok: 1 ZEC hides in a large crowd
LEAKSCOPE_DATA=../../web/public/data node index.mjs 12.3456   # offline, from the local dataset
```

## wallet-confirm

A wallet "Confirm send" screen in one static HTML file (no build step) that imports `engine/dist/index.js`.
Serve the repository root and open it:

```sh
python3 -m http.server 8765            # from the repository root
open http://localhost:8765/examples/wallet-confirm/
# offline: http://localhost:8765/examples/wallet-confirm/?data=/web/public/data
```

Edit the amount or address and the verdict updates live. See `wallet-confirm/screenshot.png`.
