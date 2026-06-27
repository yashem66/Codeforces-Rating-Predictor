import { describe, it, expect } from 'vitest';
import { priorRatedCount } from '../src/contestCounts.js';
import type { ApiUserRatingEntry } from '../src/types.js';

function entry(contestId: number, t: number): ApiUserRatingEntry {
  return {
    contestId,
    contestName: `c${contestId}`,
    handle: 'h',
    rank: 1,
    ratingUpdateTimeSeconds: t,
    oldRating: 0,
    newRating: 0,
  };
}

describe('priorRatedCount', () => {
  const history = [entry(10, 100), entry(20, 200), entry(30, 300)];

  it('目标比赛之前的历史条数即为 k', () => {
    expect(priorRatedCount(history, 300)).toBe(2);
  });

  it('首战（最早时间）之前 k=0', () => {
    expect(priorRatedCount(history, 100)).toBe(0);
  });

  it('晚于全部历史时 k=历史长度', () => {
    expect(priorRatedCount(history, 999)).toBe(3);
  });

  it('历史无序也能正确计数', () => {
    const shuffled = [entry(30, 300), entry(10, 100), entry(20, 200)];
    expect(priorRatedCount(shuffled, 300)).toBe(2);
  });
});
