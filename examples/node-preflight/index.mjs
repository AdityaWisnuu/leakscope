// A wallet asks Leakscope before it sends.
//
//   node index.mjs <amount ZEC> [t-address]        deshield from Orchard to a t-address
//   node index.mjs 1.5 --from transparent --to orchard --from-addr t1...   shield
//
// Set LEAKSCOPE_DATA to a local folder (e.g. ../../web/public/data) to run offline;
// by default the public mainnet dataset is downloaded from the live site.
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { checkSend, loadPublishedContext, fmtZec } from '@leakscope/engine';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const [v] = args.splice(i, 2).slice(1);
  return v;
};
const from = flag('from', 'orchard');
const to = flag('to', 'transparent');
const fromAddr = flag('from-addr');
const yes = args.includes('--yes') ? (args.splice(args.indexOf('--yes'), 1), true) : false;
const [amountArg = '12.3456', toAddress] = args;
const amountZat = Math.round(Number(amountArg) * 1e8);

// Offline mode: same API, the fetch just reads files instead.
const dir = process.env.LEAKSCOPE_DATA;
const localFetch = dir && (async (url) => new Response(await readFile(join(resolve(dir), url.split('/').pop()))));

console.log(`Loading public boundary history ${dir ? `from ${dir}` : 'from leakscope-cyan.vercel.app'}...`);
const t0 = Date.now();
const ctx = await loadPublishedContext(localFetch ? { baseUrl: 'local', fetch: localFetch } : {});
console.log(`  ${ctx.events.toLocaleString()} events up to block ${ctx.tip.toLocaleString()} (${Date.now() - t0} ms)\n`);

const verdict = checkSend(
  { from, to, amountZat, toAddress, fromAddresses: fromAddr ? [fromAddr] : undefined },
  ctx,
);

const color = { ok: '\x1b[32m', warn: '\x1b[33m', danger: '\x1b[31m' }[verdict.level];
const reset = '\x1b[0m';
console.log(`Send ${fmtZec(amountZat)}  ${from} -> ${to}${toAddress ? `  (${toAddress})` : ''}`);
console.log(`${color}[${verdict.level.toUpperCase()}] privacy score ${verdict.score}/100${reset}`);
console.log(`  ${verdict.headline}`);
for (const r of verdict.reasons) console.log(`  - ${r}`);

if (verdict.suggestedSplit) {
  const s = verdict.suggestedSplit;
  console.log(`\nSafer: send it as ${s.parts.length} standard ZIP-318 amounts, spread over time:`);
  for (const p of s.parts) console.log(`  ${fmtZec(p.amountZat).padStart(14)}   hides among ${p.crowd.toLocaleString()} recent look-alikes`);
  if (s.residualZat > 0) console.log(`  (${fmtZec(s.residualZat)} stays behind: below the 0.01 ZEC minimum)`);
  console.log('  Schedule (random, exponentially spaced heights):');
  for (const p of s.schedule) {
    const mins = Math.round(((p.height - ctx.tip) * 75) / 60);
    console.log(`    block ${p.height.toLocaleString()}  ${fmtZec(p.amount).padStart(14)}   ~${mins} min after the indexed tip`);
  }
}

if (verdict.level !== 'ok' && process.stdin.isTTY && !yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question('\nSend anyway? [s]plit / [y]es / [N]o: ')).trim().toLowerCase();
  rl.close();
  console.log(a === 'y' ? 'Sending as-is (user accepted the risk).' : a === 's' ? 'Queued the ZIP-318 split instead.' : 'Cancelled.');
} else {
  console.log(verdict.level === 'ok' ? '\nLooks fine: sending.' : '\n(non-interactive: not sending)');
}
