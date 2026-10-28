// Caption-free recordings for the Remotion edit (adapted from ../../video/scenes.mjs).
export const FLAGSHIP = 'c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd';
export const SCENES = [
  { id: 'observatory', path: '/', ready: '.inspector',
    beats: [
      { key: 'stat-0', text: '', act: async (h) => { await h.move('h1', { x: 0.3, y: 0.2 }); await h.wait(2500); await h.scrollTo('text=EVERY PUBLIC BOUNDARY EVENT', 70, 2200); await h.move('.inspector', { x: 0.5, y: -1.2 }); } },
    ] },
  { id: 'check', path: '/check/', ready: '#txid',
    beats: [
      { key: 'check-0', text: '', act: async (h) => { await h.type('#txid', FLAGSHIP, 8); await h.click('form button[type=submit]'); await h.page.waitForSelector('.finding', { timeout: 30000 }); } },
      { key: 'check-1', text: '', act: async (h) => { await h.scrollTo('.finding', 90); await h.move('.finding', { x: 0.3, y: 0.15 }); await h.wait(2500); await h.move('.finding', { x: 0.5, y: 0.45 }); } },
    ] },
  { id: 'plan', path: '/plan/', ready: 'button[type=submit]:not([disabled])',
    beats: [
      { key: 'plan-0', text: '', act: async (h) => {
          await h.scrollTo('.tool-grid', 80, 900);
          await h.click('text=Withdraw to an exchange');
          await h.page.locator('input[inputmode=decimal]').fill('');
          await h.type('input[inputmode=decimal]', '7.7', 110);
          await h.click('button:has-text("Run pre-flight")');
        } },
      { key: 'plan-1', text: '', act: async (h) => { await h.move('text=Privacy score', { x: 0.5, y: -2 }); } },
      { key: 'plan-2', text: '', act: async (h) => { await h.scrollTo('text=SUGGESTION >> nth=0', 110); await h.move('text=SUGGESTION >> nth=0', { x: 3, y: 2.5 }); await h.wait(1500); await h.scrollBy(240); await h.move('text=Draw a new schedule'); } },
    ] },
  { id: 'scan', path: '/scan/', ready: 'text=Use testnet demo key',
    beats: [
      { key: 'scan-0', text: '', act: async (h) => { await h.wait(300); await h.click('text=Use testnet demo key'); await h.wait(600); await h.click('button:has-text("Scan locally")'); await h.wait(300); await h.scrollTo('.tool-grid', 80); await h.move('.tool-grid > :nth-child(2)', { x: 0.4, y: 0.1 }); } },
      { key: 'scan-1', text: '',
        before: async (h) => { await h.page.waitForSelector('.verdict', { timeout: 240000 }); await h.wait(300); },
        act: async (h) => { await h.scrollTo('.verdict', 110, 900); await h.wait(800); await h.scrollTo('text=ROUND TRIP >> nth=0', 260); await h.move('text=ROUND TRIP >> nth=0', { x: 0.5, y: 2 }); } },
    ] },
];
