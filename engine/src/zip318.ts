/**
 * ZIP 318 (Draft, 2026-06-16): Orchard → Ironwood migration.
 *
 * Splitting a balance into canonical denominations, spread over time, is the only way to
 * cross a pool boundary without revealing a linkable amount. These are the ZIP's parameters
 * and decomposition rules, so plans made here look like every other compliant wallet's.
 */

export const ZAT_PER_ZEC = 100_000_000;
/** Smallest denomination: remainders below it stay where they are. */
export const MAX_RESIDUAL_VALUE = ZAT_PER_ZEC / 100;
/** Largest single pool-crossing denomination. */
export const DENOM_CAP = 10_000 * ZAT_PER_ZEC;
export const MEAN_DELAY = 66;
export const MAX_DELAY = 576;
export const BOUNDARY_MODULUS = 144;

/** Canonical parts per decimal digit, from the ZIP's table. */
const DIGIT_PARTS: Record<number, number[]> = {
  1: [1], 2: [2], 3: [2, 1], 4: [2, 2], 5: [5], 6: [5, 1], 7: [5, 2], 8: [5, 2, 1], 9: [5, 2, 2],
};

/** Every value of the form {1,2,5} × 10^k between 0.01 and 10000 ZEC. */
export function isDenomination(zat: number): boolean {
  for (let p = MAX_RESIDUAL_VALUE; p <= DENOM_CAP; p *= 10) {
    if (zat === p || zat === 2 * p || zat === 5 * p) return zat <= DENOM_CAP;
  }
  return false;
}

export interface Decomposition {
  parts: number[];
  /** Left unmigrated: below the smallest denomination. */
  residual: number;
}

/** The ZIP's deterministic decomposition: repeated caps, then each decimal digit greedily. */
export function decompose(value: number): Decomposition {
  const parts: number[] = [];
  let rem = value;
  while (rem >= DENOM_CAP) {
    parts.push(DENOM_CAP);
    rem -= DENOM_CAP;
  }
  for (let place = DENOM_CAP / 10; place >= MAX_RESIDUAL_VALUE; place /= 10) {
    const digit = Math.floor(rem / place);
    for (const n of DIGIT_PARTS[digit] ?? []) parts.push(n * place);
    rem -= digit * place;
  }
  return { parts, residual: rem };
}

export type Rng = () => number;

/** Cryptographically secure uniform [0, 1), as the ZIP requires for all schedule randomness. */
export const secureRandom: Rng = () => {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
};

/** The ZIP's randomized decomposition: at each step pick among {1,2,5} × 10^k that fit. */
export function decomposeRandomized(value: number, rng: Rng = secureRandom): Decomposition {
  const parts: number[] = [];
  let rem = value;
  while (rem >= MAX_RESIDUAL_VALUE) {
    let place = MAX_RESIDUAL_VALUE;
    while (place * 10 <= rem && place * 10 <= DENOM_CAP) place *= 10;
    let pick: number;
    if (5 * place <= rem && 5 * place <= DENOM_CAP) {
      const r = rng();
      pick = r < 0.1 ? place : r < 0.35 ? 2 * place : 5 * place;
    } else if (2 * place <= rem && 2 * place <= DENOM_CAP) {
      pick = rng() < 0.25 ? place : 2 * place;
    } else {
      pick = place;
    }
    parts.push(pick);
    rem -= pick;
  }
  return { parts, residual: rem };
}

/** Exponential delay in whole blocks, mean `mean`, redrawn above `max`. */
export function drawDelay(rng: Rng = secureRandom, mean = MEAN_DELAY, max = MAX_DELAY): number {
  for (;;) {
    const d = Math.round(-Math.log(1 - rng()) * mean);
    if (d <= max) return d;
  }
}

export interface ScheduledPart {
  amount: number;
  height: number;
}

/**
 * A full migration schedule: shuffled parts, exponentially spaced, starting one bucket
 * interval after the next boundary.
 */
export function schedule(parts: number[], tip: number, rng: Rng = secureRandom): ScheduledPart[] {
  const shuffled = [...parts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  let h = Math.ceil(tip / BOUNDARY_MODULUS) * BOUNDARY_MODULUS + BOUNDARY_MODULUS;
  return shuffled.map((amount) => {
    h += drawDelay(rng);
    return { amount, height: h };
  });
}
