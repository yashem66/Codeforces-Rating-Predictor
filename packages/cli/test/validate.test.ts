import { describe, it, expect } from 'vitest';
import { validateContest } from '../src/validate.js';
import type { ApiRatingChange } from '../src/types.js';

function rc(handle: string, rank: number, oldR: number, newR: number): ApiRatingChange {
  return {
    contestId: 1,
    contestName: 'T',
    handle,
    rank,
    ratingUpdateTimeSeconds: 1000,
    oldRating: oldR,
    newRating: newR,
  };
}

describe('validateContest', () => {
  it('当预测与真值完全一致时，maxAbsError=0、exactRate=1', () => {
    const rows = [rc('a', 1, 1500, 1530), rc('b', 2, 1500, 1470)];
    const counts = new Map<string, number>([
      ['a', 10],
      ['b', 10],
    ]);
    const fakeCore = (cs: { party: string; rank: number; rating: number }[]) =>
      cs.map((c) => {
        const truth = rows.find((r) => r.handle === c.party)!;
        const delta = truth.newRating - truth.oldRating;
        return {
          party: c.party,
          rank: c.rank,
          oldRating: c.rating,
          delta,
          newRating: c.rating + delta,
        };
      });

    const report = validateContest(rows, counts, fakeCore);
    expect(report.n).toBe(2);
    expect(report.maxAbsError).toBe(0);
    expect(report.exactRate).toBe(1);
    expect(report.worst).toHaveLength(0);
  });

  it('成熟用户(k>=6)：calc 等于 display，换算不改变输入', () => {
    const rows = [rc('a', 1, 1500, 1530), rc('b', 2, 1500, 1470)];
    const counts = new Map<string, number>([
      ['a', 6],
      ['b', 6],
    ]);
    const seen: number[] = [];
    const spyCore = (cs: { party: string; rank: number; rating: number }[]) => {
      for (const c of cs) seen.push(c.rating);
      return cs.map((c) => ({
        party: c.party,
        rank: c.rank,
        oldRating: c.rating,
        delta: 0,
        newRating: c.rating,
      }));
    };
    validateContest(rows, counts, spyCore);
    expect(seen.sort()).toEqual([1500, 1500]);
  });

  it('统计 mismatch：预测 newRating 与真值差 5 时计入误差', () => {
    const rows = [rc('a', 1, 1500, 1530)];
    const counts = new Map<string, number>([['a', 10]]);
    const offBy5 = (cs: { party: string; rank: number; rating: number }[]) =>
      cs.map((c) => ({
        party: c.party,
        rank: c.rank,
        oldRating: c.rating,
        delta: 35,
        newRating: c.rating + 35,
      }));
    const report = validateContest(rows, counts, offBy5);
    expect(report.maxAbsError).toBe(5);
    expect(report.exactRate).toBe(0);
    expect(report.worst[0]!.handle).toBe('a');
    expect(report.worst[0]!.absError).toBe(5);
  });
});
