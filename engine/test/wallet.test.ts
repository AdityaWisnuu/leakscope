import { describe, expect, test } from 'bun:test';
import { checkSend, contextFromIndex, eventsFromIndex, levelFor, loadPublishedContext, type EventIndex } from '../src';

// 30 shieldings of exactly 1 ZEC (one crowd), one unique 1.23456789 ZEC, plus a 0.5 ZEC crossing pair.
const rows: [number, number, number, number, number][] = []; // amount, h, dir, from, to
for (let i = 0; i < 30; i++) rows.push([100_000_000, 1000 + i, 1, 0, 3]);
rows.push([123_456_789, 1100, 1, 0, 3]);
rows.push([50_000_000, 1200, 0, 2, 3], [50_000_000, 1200, 1, 2, 3]);
const ix: EventIndex = {
  tip: 1300,
  amount: rows.map((r) => r[0]),
  h: rows.map((r) => r[1]),
  dir: rows.map((r) => r[2]),
  from: rows.map((r) => r[3]),
  to: rows.map((r) => r[4]),
  tx: rows.map((_, i) => (i === rows.length - 1 ? i - 1 : i)),
};
const REUSED = 't1TdD3uh5E8UunUUmkeTumPb4823pd9JVUv';
const ctx = contextFromIndex(ix, [REUSED]);

describe('wallet API', () => {
  test('index decoding shares a txid across a crossing pair', () => {
    const ev = eventsFromIndex(ix);
    expect(ev.length).toBe(rows.length);
    expect(ev.at(-1)!.txid).toBe(ev.at(-2)!.txid);
    expect(ev[0]).toMatchObject({ dir: 'in', from: 'transparent', to: 'ironwood', amount: 100_000_000 });
    expect(ctx.tip).toBe(1300);
  });

  test('shielded-to-shielded inside one pool is ok', () => {
    const v = checkSend({ from: 'orchard', to: 'orchard', amountZat: 123_456_789 }, ctx);
    expect(v.level).toBe('ok');
    expect(v.score).toBe(100);
    expect(v.revealsAmount).toBe(false);
    expect(v.suggestedSplit).toBeUndefined();
  });

  test('a unique deshield amount is danger, with a ZIP-318 split', () => {
    const v = checkSend({ from: 'ironwood', to: 'transparent', amountZat: 123_456_000 }, ctx);
    expect(v.level).toBe('danger');
    expect(v.headline).toContain('unique');
    const split = v.suggestedSplit!;
    expect(split.parts.map((p) => p.amountZat)).toEqual([100_000_000, 20_000_000, 2_000_000, 1_000_000]);
    expect(split.parts.reduce((s, p) => s + p.amountZat, 0) + split.residualZat).toBe(123_456_000);
    expect(split.parts[0].crowd).toBeGreaterThan(20);
    expect(split.schedule.length).toBe(4);
    expect(split.schedule.every((s) => s.height > ctx.tip)).toBe(true);
  });

  test('a common denomination is ok and needs no split', () => {
    const v = checkSend({ from: 'ironwood', to: 'transparent', amountZat: 100_000_000 }, ctx);
    expect(v.level).toBe('ok');
    expect(v.crowd).toBeGreaterThan(20);
    expect(v.suggestedSplit).toBeUndefined();
  });

  test('a reused destination address is danger', () => {
    const v = checkSend({ from: 'ironwood', to: 'transparent', amountZat: 100_000_000, toAddress: REUSED }, ctx);
    expect(v.level).toBe('danger');
    expect(v.score).toBeLessThanOrEqual(10);
    expect(v.headline).toContain('address');
  });

  test('shielding from a known boundary address is flagged', () => {
    const v = checkSend({ from: 'transparent', to: 'orchard', amountZat: 100_000_000, fromAddresses: [REUSED] }, ctx);
    expect(v.level).toBe('danger');
    expect(v.reasons.some((r) => r.includes('touched a shielded pool'))).toBe(true);
  });

  test('fully transparent is danger', () => {
    expect(checkSend({ from: 'transparent', to: 'transparent', amountZat: 1 }, ctx).level).toBe('danger');
  });

  test('rejects bad amounts', () => {
    expect(() => checkSend({ from: 'orchard', to: 'transparent', amountZat: 1.5 }, ctx)).toThrow();
  });

  test('levels', () => {
    expect([levelFor(100), levelFor(75), levelFor(50), levelFor(25), levelFor(5)]).toEqual(['ok', 'ok', 'warn', 'danger', 'danger']);
  });

  test('loadPublishedContext uses the given base URL and fetch', async () => {
    const seen: string[] = [];
    const fake = (async (url: string) => {
      seen.push(url);
      return new Response(JSON.stringify(url.endsWith('event-index.json') ? ix : [REUSED]));
    }) as unknown as typeof fetch;
    const c = await loadPublishedContext({ baseUrl: 'https://example.test/data/', fetch: fake });
    expect(seen.sort()).toEqual(['https://example.test/data/boundary-addresses.json', 'https://example.test/data/event-index.json']);
    expect(c.events).toBe(rows.length);
    expect(c.boundaryAddresses.has(REUSED)).toBe(true);
    const c2 = await loadPublishedContext({ baseUrl: 'https://example.test/data', fetch: fake, addresses: false });
    expect(c2.boundaryAddresses.size).toBe(0);
  });
});

test('split schedule starts from the wallet height when given', () => {
  const v = checkSend({ from: 'orchard', to: 'transparent', amountZat: 123_456_000, currentHeight: 50_000 }, ctx);
  expect(v.suggestedSplit!.schedule.every((s) => s.height > 50_000)).toBe(true);
});
