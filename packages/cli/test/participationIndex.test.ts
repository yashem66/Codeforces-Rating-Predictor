import { describe, it, expect } from 'vitest';
import { ParticipationIndex } from '../src/participationIndex.js';
import type { ApiRatingChange } from '../src/types.js';

function rc(handle: string, t: number, oldRating = 0): ApiRatingChange {
  return {
    contestId: 1,
    contestName: '',
    handle,
    rank: 1,
    ratingUpdateTimeSeconds: t,
    oldRating,
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

  it('isNewSystem 看首场 oldRating 是否为 0；effectiveK 对老体系返回 6', () => {
    const idx = new ParticipationIndex();
    // newbie：首场（t=100）oldRating=0 -> 新体系
    idx.addContest([rc('newbie', 100, 0)]);
    idx.addContest([rc('newbie', 200, 486)]);
    // veteran：首场（t=50）oldRating=1500 -> 老体系（乱序加入，确保取最早场）
    idx.addContest([rc('veteran', 300, 1600)]);
    idx.addContest([rc('veteran', 50, 1500)]);
    idx.finalize();

    expect(idx.isNewSystem('newbie')).toBe(true);
    expect(idx.isNewSystem('veteran')).toBe(false);
    expect(idx.isNewSystem('unknown')).toBe(false);

    // newbie 在 t=150 时赛前 k=1（新体系，按真实 k）
    expect(idx.effectiveK('newbie', 150)).toBe(1);
    // veteran 老体系：无论真实场次，effectiveK=6（offset 0）
    expect(idx.effectiveK('veteran', 250)).toBe(6);
  });
});
