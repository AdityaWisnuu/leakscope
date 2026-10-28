// Leakscope demo video: the storyboard.
// Each scene is recorded in its own browser context. Each beat shows one caption, plays one
// narration line (`say` = what the TTS voice reads; `text` = the on-screen caption / SRT), and runs
// `act` concurrently. `before` runs first, silently (e.g. waiting for a scan); long silent waits are
// cut out of the final video automatically.
// Edit narration here, then re-run ./make.sh. SCRIPT.md is regenerated from this file.

export const FLAGSHIP = 'c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd';
export const PLAN_AMOUNT = '7.7';

const introCard = `
  <div class="vc-kicker">LEAKSCOPE · ZECATHON 2026 · ZCASH PRIVACY</div>
  <h1 class="vc-h1"><span data-step="1">The vault is safe.</span><br><em data-step="2">The doors leak.</em></h1>
  <div class="vc-row" data-step="3">
    <span>shielding</span><span>deshielding</span><span>pool crossings</span>
    <b>→ exact amount · address · time, public</b>
  </div>
`;

const outroCard = `
  <div class="vc-kicker">LEAKSCOPE</div>
  <h1 class="vc-h1" style="font-size:96px">See the leak <em>before</em> you send.</h1>
  <div class="vc-grid">
    <div data-step="1"><span>For Zcash users</span><b>check · pre-flight · scan, all in your browser</b></div>
    <div data-step="1"><span>For wallet developers</span><b>SDK&nbsp; @leakscope/engine</b></div>
    <div data-step="2"><span>Try it</span><b>leakscope-cyan.vercel.app</b></div>
    <div data-step="2"><span>Open source</span><b>github.com/AdityaWisnuu/leakscope</b></div>
  </div>
`;

export const SCENES = [
  {
    id: 'intro',
    title: '1. The problem',
    path: '/',
    ready: '.inspector',
    fadeIn: true,
    fadeOut: false,
    setup: async (h) => { await h.card(introCard); },
    beats: [
      { text: "Zcash's shielded pools are a vault. Inside, sender, receiver and amount are hidden.",
        say: "Zee-cash's shielded pools are a vault. Inside, the sender, receiver and amount are hidden.",
        act: async (h) => { await h.wait(300); await h.cardStep(1); } },
      { text: 'But the vault has doors, and the doors are public.',
        act: async (h) => { await h.wait(900); await h.cardStep(2); } },
      { text: 'Every shielding, deshielding and pool crossing puts an exact amount, an address and a time on the chain.',
        act: async (h) => { await h.wait(400); await h.cardStep(3); } },
      { text: 'Leakscope shows you what an observer learns at those doors, before you walk through them.',
        act: async (h) => { await h.wait(2600); await h.cardHide(); } },
    ],
  },
  {
    id: 'observatory',
    title: '2. Observatory',
    path: '/',
    ready: '.inspector',
    fadeIn: false,
    fadeOut: true,
    beats: [
      { text: 'This is the observatory: 75 days of mainnet since the Ironwood pool launched. 584,497 transactions.',
        say: 'This is the observatory. Seventy-five days of mainnet since the Ironwood pool launched. Five hundred eighty-four thousand transactions.',
        act: async (h) => { await h.move('h1', { x: 0.3, y: 0.2 }); } },
      { text: 'Leakscope models an observer with nothing but the public chain. And yet: 24.6% of withdrawals from the shielded pools can be traced.',
        say: 'Leakscope models an observer with nothing but the public chain. And yet, twenty-four point six percent of withdrawals from the shielded pools can be traced.',
        act: async (h) => { await h.move('h1', { x: 0.25, y: 0.12 }); await h.wait(1200); await h.move('h1', { x: 0.6, y: 0.85 }); } },
      { text: 'Back to the deposit they came from, or forward to where they were re-shielded. Every orange thread is one such link.',
        say: 'Back to the deposit they came from, or forward to where they were re-shielded. Every orange thread is one such link.',
        act: async (h) => { await h.scrollTo('text=EVERY PUBLIC BOUNDARY EVENT', 70); await h.move('.inspector', { x: 0.5, y: -1.2 }); } },
      { text: 'Someone shielded 2.50121076 ZEC. Nine minutes later 2.50106076 ZEC came out: the same amount, minus the 15,000 zatoshi fee.',
        say: 'Here, someone shielded two point five zero one two one Z E C. Nine minutes later, two point five zero one zero six came out. The same amount, minus the fifteen-thousand zatoshi fee.',
        act: async (h) => { await h.scrollTo('.inspector', 400); await h.move('.inspector', { x: 0.2, y: 0.55 }); await h.wait(2500); await h.move('.inspector', { x: 0.7, y: 0.55 }); } },
    ],
  },
  {
    id: 'check',
    title: '3. Check a transaction',
    path: '/check/',
    ready: '#txid',
    fadeIn: true,
    fadeOut: true,
    beats: [
      { text: 'Check takes any mainnet transaction id and shows what anyone can see about it.',
        say: 'Check takes any mainnet transaction I.D., and shows what anyone can see about it.',
        act: async (h) => { await h.type('#txid', FLAGSHIP, 14); await h.click('form button[type=submit]'); await h.page.waitForSelector('.finding', { timeout: 30000 }); } },
      { text: 'This withdrawal matches exactly one earlier deposit, 7 blocks before. Anonymity set: one. Fully linked.',
        say: 'This withdrawal matches exactly one earlier deposit, seven blocks before. Anonymity set: one. Fully linked.',
        act: async (h) => { await h.scrollTo('.finding', 90); await h.move('.finding', { x: 0.3, y: 0.15 }); } },
      { text: 'Measured on mainnet, links of this kind are right about 99% of the time. No cryptography is broken; only amounts are matched.',
        say: 'Measured on mainnet, links of this kind are right about ninety-nine percent of the time. No cryptography is broken. Only amounts are matched.',
        act: async (h) => { await h.move('.finding', { x: 0.5, y: 0.45 }); } },
      { text: 'The lookup is private too: the transaction id never leaves your tab.',
        say: 'The lookup is private too. The transaction I.D. never leaves your tab.',
        act: async (h) => { await h.scrollTo('#txid', 260); await h.move('#txid', { x: 0.4, y: 2.2 }); } },
    ],
  },
  {
    id: 'plan',
    title: '4. Pre-flight',
    path: '/plan/',
    ready: 'button[type=submit]:not([disabled])',
    fadeIn: true,
    fadeOut: true,
    beats: [
      { text: 'Pre-flight checks a transfer before you make it. Nothing is sent.',
        act: async (h) => { await h.scrollTo('.tool-grid', 80); await h.move('text=Withdraw to an exchange'); } },
      { text: `Say you want to withdraw ${PLAN_AMOUNT} ZEC from Ironwood to an exchange.`,
        say: 'Say you want to withdraw seven point seven Z E C, from Ironwood to an exchange.',
        act: async (h) => {
          await h.click('text=Withdraw to an exchange');
          await h.page.locator('input[inputmode=decimal]').fill('');
          await h.type('input[inputmode=decimal]', PLAN_AMOUNT, 110);
          await h.click('button:has-text("Run pre-flight")');
        } },
      { text: 'Only one other recent transfer used that amount: easy to single out. Privacy score: 25 out of 100.',
        say: 'Only one other recent transfer used that amount. Easy to single out. Privacy score: twenty-five, out of a hundred.',
        act: async (h) => { await h.move('text=Privacy score', { x: 0.5, y: -2 }); } },
      { text: 'The suggestion: split it into standard ZIP-318 denominations that every compliant wallet uses, broadcast at random intervals.',
        say: 'The suggestion: split it into standard zip three-eighteen denominations, that every compliant wallet uses, and broadcast them at random intervals.',
        act: async (h) => { await h.scrollTo('text=SUGGESTION >> nth=0', 110); await h.move('text=SUGGESTION >> nth=0', { x: 3, y: 2.5 }); } },
      { text: 'Each part now hides among hundreds of look-alikes, and the schedule breaks timing correlation too.',
        say: 'Each part now hides among hundreds of look-alikes, and the random schedule breaks timing correlation too.',
        act: async (h) => { await h.scrollBy(240); await h.move('text=Draw a new schedule'); await h.wait(400); await h.click('text=Draw a new schedule'); } },
    ],
  },
  {
    id: 'scan',
    title: '5. Scan a wallet',
    path: '/scan/',
    ready: 'text=Use testnet demo key',
    fadeIn: true,
    fadeOut: true,
    beats: [
      { text: 'Scan finds the leaks in your own wallet. Paste a viewing key; here, a testnet demo key.',
        act: async (h) => { await h.wait(500); await h.click('text=Use testnet demo key'); } },
      { text: 'A WebAssembly scanner trial-decrypts compact blocks on this device. The key never leaves the browser.',
        say: 'A WebAssembly scanner trial-decrypts compact blocks, right on this device. The key never leaves the browser.',
        act: async (h) => { await h.click('button:has-text("Scan locally")'); await h.wait(300); await h.scrollTo('.tool-grid', 80); await h.move('.tool-grid > :nth-child(2)', { x: 0.4, y: 0.1 }); } },
      { text: 'The block server learns only the height range, not which transactions are yours.',
        act: async (h) => { await h.move('textarea', { x: 0.5, y: 0.5 }); } },
      { text: 'The personal leak report: what an outside observer can link, transaction by transaction.',
        before: async (h) => { await h.page.waitForSelector('.verdict', { timeout: 240000 }); await h.wait(300); },
        act: async (h) => { await h.scrollTo('.verdict', 110); await h.move('.verdict', { x: 0.3, y: 0.5 }); } },
      { text: 'Here, coins were deshielded and immediately re-shielded: a critical round trip, linked with certainty.',
        act: async (h) => { await h.scrollTo('text=ROUND TRIP >> nth=0', 260); await h.move('text=ROUND TRIP >> nth=0', { x: 0.5, y: 2 }); } },
    ],
  },
  {
    id: 'method',
    title: '6. Method and accuracy',
    path: '/method/',
    ready: '#accuracy',
    fadeIn: true,
    fadeOut: true,
    beats: [
      { text: 'How do we know a link is real? A unique match could still be a coincidence.',
        act: async (h) => { await h.scrollTo('#accuracy', 90, 1600); } },
      { text: "So we run the exact same rule backwards in time. Money can't leave before it arrives, so every backward match is a coincidence.",
        act: async (h) => { await h.move('xpath=//h2[@id="accuracy"]/following::strong[1]', { x: 0.6, y: 0.8 }); await h.highlight('xpath=//h2[@id="accuracy"]/following::strong[1]'); } },
      { text: 'That measures the false-link rate on the real chain. The fastest tier is about 99% precise, and rules that failed the test were dropped.',
        say: 'That measures the false-link rate on the real chain. The fastest tier is about ninety-nine percent precise, and rules that failed the test were dropped.',
        act: async (h) => { await h.move('xpath=//h2[@id="accuracy"]/following::table[1]//tr[2]', { x: 0.95, y: 0.6 }); await h.highlight('xpath=//h2[@id="accuracy"]/following::table[1]//tr[2]'); } },
    ],
  },
  {
    id: 'outro',
    title: '7. For users and wallet developers',
    path: '/',
    ready: '.inspector',
    fadeIn: true,
    fadeOut: true,
    tail: 2.2,
    setup: async (h) => { await h.card(outroCard); },
    beats: [
      { text: 'Leakscope is for Zcash users, who can check before they send, and for wallet developers, through the @leakscope/engine SDK.',
        say: 'Leakscope is for Zee-cash users, who can check before they send. And for wallet developers, through the leakscope engine S.D.K.',
        act: async (h) => { await h.wait(300); await h.cardStep(1); } },
      { text: "It's open source. Try it at leakscope-cyan.vercel.app.",
        say: "It's open source. Try it at leakscope dash cyan, dot vercel dot app.",
        act: async (h) => { await h.cardStep(2); } },
    ],
  },
];
