import { describe, it, expect } from 'vitest';
import { computeRatingChanges } from '../src/rating.js';
import { computeRatingChangesFast } from '../src/ratingFast.js';
import type { Contestant } from '../src/types.js';

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomField(n: number, seed: number): Contestant[] {
  const rng = mulberry32(seed);
  const cs: Contestant[] = [];
  for (let i = 0; i < n; i++) {
    cs.push({ party: `p${i}`, rank: 0, rating: Math.round(400 + rng() * 3000) });
  }
  const shuffled = [...cs].sort(() => rng() - 0.5);
  shuffled.forEach((c, i) => (c.rank = i + 1));
  return cs;
}

describe('computeRatingChangesFast 与朴素版等价', () => {
  it('小场景：逐人 delta 完全一致', () => {
    const field: Contestant[] = [
      { party: 'a', rank: 1, rating: 2000 },
      { party: 'b', rank: 2, rating: 1500 },
      { party: 'c', rank: 3, rating: 1500 },
      { party: 'd', rank: 4, rating: 1000 },
    ];
    const slow = computeRatingChanges(field);
    const fast = computeRatingChangesFast(field);
    const bySlow = Object.fromEntries(slow.map((r) => [r.party, r.delta]));
    for (const r of fast) expect(r.delta).toBe(bySlow[r.party]);
  });

  it('随机中等场景（n=300，多种子）：最大逐人误差 <= 1', () => {
    for (const seed of [1, 7, 99]) {
      const field = randomField(300, seed);
      const slow = computeRatingChanges(field);
      const fast = computeRatingChangesFast(field);
      const bySlow = new Map(slow.map((r) => [r.party, r.delta]));
      let maxDiff = 0;
      for (const r of fast) maxDiff = Math.max(maxDiff, Math.abs(r.delta - bySlow.get(r.party)!));
      expect(maxDiff).toBeLessThanOrEqual(1);
    }
  });
});
