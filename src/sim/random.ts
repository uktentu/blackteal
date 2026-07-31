/**
 * Seeded PRNG. The simulator must be deterministic so its tests can assert real sequences
 * rather than tolerances, and so a reviewer's session is reproducible.
 *
 * mulberry32 — small, fast, good enough distribution for telemetry jitter.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [-1, 1). */
  signed(): number;
  /** Current internal state, so a frame can carry its RNG forward immutably. */
  state: number;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;

  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    signed: () => next() * 2 - 1,
    get state() {
      return s;
    },
  };
}

/**
 * Jitter a value by +/- `pct` percent, pulled gently back toward `anchor`.
 *
 * The restoring term is what stops a random walk from drifting out of its documented normal
 * range over a long session. Without it, leaving the tab open eventually fires phantom alarms —
 * the most embarrassing possible failure for a monitoring UI.
 */
export function jitter(
  rng: Rng,
  value: number,
  anchor: number,
  pct = 0.004,
  pull = 0.02,
): number {
  const noise = value * pct * rng.signed();
  const restore = (anchor - value) * pull;
  return value + noise + restore;
}

/** Jitter toward an anchor and clamp to a hard range. */
export function jitterClamped(
  rng: Rng,
  value: number,
  anchor: number,
  min: number,
  max: number,
  pct = 0.004,
): number {
  return Math.min(max, Math.max(min, jitter(rng, value, anchor, pct)));
}

/** Move `cur` a fraction of the way toward `target`. Used by scripted ramps. */
export function approach(cur: number, target: number, rate = 0.08): number {
  return cur + (target - cur) * rate;
}

export const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
