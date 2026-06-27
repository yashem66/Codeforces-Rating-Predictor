import { describe, it, expect } from 'vitest';
import { computeRatingChanges } from '../src/rating.js';
import type { Contestant } from '../src/types.js';

function makeField(): Contestant[] {
  return [
    { party: 'a', rank: 1, rating: 2000 },
    { party: 'b', rank: 2, rating: 1800 },
    { party: 'c', rank: 3, rating: 1600 },
    { party: 'd', rank: 4, rating: 1400 },
    { party: 'e', rank: 5, rating: 1200 },
    { party: 'f', rank: 6, rating: 1000 },
  ];
}

describe('computeRatingChanges', () => {
  it('返回与输入等长、字段完整的结果', () => {
    const res = computeRatingChanges(makeField());
    expect(res).toHaveLength(6);
    for (const r of res) {
      expect(r.newRating).toBe(r.oldRating + r.delta);
    }
  });

  it('整体 delta 之和为非正（通胀控制）', () => {
    const sum = computeRatingChanges(makeField()).reduce((s, r) => s + r.delta, 0);
    expect(sum).toBeLessThanOrEqual(0);
  });

  it('同样 old rating 下，名次更好者 delta 不更差（单调性）', () => {
    const field: Contestant[] = [
      { party: 'p1', rank: 1, rating: 1500 },
      { party: 'p2', rank: 2, rating: 1500 },
      { party: 'p3', rank: 3, rating: 1500 },
      { party: 'p4', rank: 4, rating: 1500 },
    ];
    const res = computeRatingChanges(field);
    const byParty = Object.fromEntries(res.map((r) => [r.party, r.delta]));
    expect(byParty.p1!).toBeGreaterThanOrEqual(byParty.p2!);
    expect(byParty.p2!).toBeGreaterThanOrEqual(byParty.p3!);
    expect(byParty.p3!).toBeGreaterThanOrEqual(byParty.p4!);
  });

  it('远超 seed 的选手 delta 为正，远不及的为负', () => {
    const field: Contestant[] = [
      { party: 'rocket', rank: 1, rating: 1000 },
      { party: 'mid1', rank: 2, rating: 1500 },
      { party: 'mid2', rank: 3, rating: 1500 },
      { party: 'flop', rank: 4, rating: 2000 },
    ];
    const res = computeRatingChanges(field);
    const byParty = Object.fromEntries(res.map((r) => [r.party, r.delta]));
    expect(byParty.rocket!).toBeGreaterThan(0);
    expect(byParty.flop!).toBeLessThan(0);
  });

  it('并列名次：相同 rank 不同 rating 时，rating 低者 delta 更高', () => {
    const field: Contestant[] = [
      { party: 'x', rank: 1, rating: 1500 },
      { party: 'tieHigh', rank: 2, rating: 1800 },
      { party: 'tieLow', rank: 2, rating: 1200 },
      { party: 'y', rank: 4, rating: 1500 },
    ];
    const res = computeRatingChanges(field);
    const byParty = Object.fromEntries(res.map((r) => [r.party, r.delta]));
    expect(byParty.tieLow!).toBeGreaterThan(byParty.tieHigh!);
  });
});
