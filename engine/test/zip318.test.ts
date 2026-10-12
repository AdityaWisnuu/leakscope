import { describe, expect, test } from 'bun:test';
import { decompose, decomposeRandomized, isDenomination, drawDelay, MAX_DELAY } from '../src/zip318';

const Z = 100_000_000;
const zec = (parts: number[]) => parts.map((p) => p / Z);

describe('ZIP 318 decomposition (examples from the ZIP)', () => {
  test('123.45 ZEC', () => expect(zec(decompose(12_345 * Z / 100).parts)).toEqual([100, 20, 2, 1, 0.2, 0.2, 0.05]));
  test('540 ZEC', () => expect(zec(decompose(540 * Z).parts)).toEqual([500, 20, 20]));
  test('25000 ZEC', () => expect(zec(decompose(25_000 * Z).parts)).toEqual([10000, 10000, 5000]));
  test('residual below 0.01 ZEC stays', () => expect(decompose(Z + 12_345).residual).toBe(12_345));
});

describe('randomized decomposition', () => {
  test('always sums to value minus residual and uses only denominations', () => {
    for (let i = 0; i < 200; i++) {
      const v = Math.floor(Math.random() * 50_000 * Z);
      const { parts, residual } = decomposeRandomized(v);
      expect(parts.reduce((a, b) => a + b, 0) + residual).toBe(v);
      expect(parts.every(isDenomination)).toBe(true);
      expect(residual).toBeLessThan(Z / 100);
    }
  });
});

test('delays are capped', () => {
  for (let i = 0; i < 1000; i++) expect(drawDelay()).toBeLessThanOrEqual(MAX_DELAY);
});
