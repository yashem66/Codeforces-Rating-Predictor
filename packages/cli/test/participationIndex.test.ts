import { describe, it, expect } from 'vitest';
import { ParticipationIndex } from '../src/participationIndex.js';
import type { ApiRatingChange } from '../src/types.js';

function rc(handle: string, t: number): ApiRatingChange {
  return {
    contestId: 1,
    contestName: '',
    handle,
    rank: 1,
    ratingUpdateTimeSeconds: t,
    oldRating: 0,
    newRating: 0,
  };
}

describe('ParticipationIndex', () => {
  it('统计某 handle 在给定时间之前的参赛场次', () => {
    const idx = new ParticipationIndex();
    idx.addContest([rc('a', 100), rc('b', 100)]);
    idx.addContest([rc('a', 200)]);
    idx.addContest([rc('a', 300), rc('b', 300)]);
    idx.finalize();
    expect(idx.priorCount('a', 300)).toBe(2);
    expect(idx.priorCount('a', 100)).toBe(0);
    expect(idx.priorCount('b', 300)).toBe(1);
    expect(idx.priorCount('unknown', 300)).toBe(0);
  });

  it('乱序加入也能正确二分计数', () => {
    const idx = new ParticipationIndex();
    idx.addContest([rc('a', 300)]);
    idx.addContest([rc('a', 100)]);
    idx.addContest([rc('a', 200)]);
    idx.finalize();
    expect(idx.priorCount('a', 250)).toBe(2);
  });
});
