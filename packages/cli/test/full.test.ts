import { describe, it, expect } from 'vitest';
import { runValidateAll } from '../src/full.js';
import type { ApiRatingChange } from '../src/types.js';
import type { ContestMeta } from '../src/contests.js';

function rc(handle: string, rank: number, oldR: number, newR: number, t: number): ApiRatingChange {
  return {
    contestId: 0,
    contestName: '',
    handle,
    rank,
    ratingUpdateTimeSeconds: t,
    oldRating: oldR,
    newRating: newR,
  };
}

describe('runValidateAll', () => {
  it('完成两遍编排：建索引 + 只验证 validateFrom 之后的比赛（用真实算法跑通端到端）', async () => {
    const contests: ContestMeta[] = [
      { id: 1, name: 'old', startTimeSeconds: 100 },
      { id: 2, name: 'new', startTimeSeconds: 1000 },
    ];
    const data: Record<number, ApiRatingChange[]> = {
      1: [rc('a', 1, 1500, 1500, 100)],
      2: [rc('a', 1, 1500, 1530, 1000), rc('b', 2, 1500, 1470, 1000)],
    };
    const result = await runValidateAll({
      listContests: async () => contests,
      getRatingChanges: async (id) => data[id]!,
      validateFromSec: 500,
    });
    // 窗口过滤：只验证 startTime>=500 的 id=2
    expect(result.validated.map((v) => v.contestId)).toEqual([2]);
    expect(result.validated[0]!.report.n).toBe(2);
    expect(result.aggregate.totalN).toBe(2);
  });

  it('完美预测器对成熟用户(k>=6)产生 0 误差', async () => {
    // 给每个 handle 在窗口前安排 >=6 场，使其成熟（offset=0），完美预测器即 0 误差
    const contests: ContestMeta[] = [];
    const data: Record<number, ApiRatingChange[]> = {};
    for (let i = 1; i <= 6; i++) {
      contests.push({ id: i, name: `warmup${i}`, startTimeSeconds: i * 100 });
      data[i] = [rc('a', 1, 1500, 1500, i * 100), rc('b', 2, 1500, 1500, i * 100)];
    }
    contests.push({ id: 100, name: 'target', startTimeSeconds: 100000 });
    data[100] = [rc('a', 1, 1500, 1530, 100000), rc('b', 2, 1500, 1470, 100000)];

    const result = await runValidateAll({
      listContests: async () => contests,
      getRatingChanges: async (id) => data[id]!,
      validateFromSec: 50000,
      ratingFn: (cs) =>
        cs.map((c) => {
          const row = data[100]!.find((r) => r.handle === c.party)!;
          const delta = row.newRating - row.oldRating;
          return {
            party: c.party,
            rank: c.rank,
            oldRating: c.rating,
            delta,
            newRating: c.rating + delta,
          };
        }),
    });
    expect(result.validated.map((v) => v.contestId)).toEqual([100]);
    expect(result.aggregate.maxAbsError).toBe(0);
  });
});
