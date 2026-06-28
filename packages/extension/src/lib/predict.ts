import { computeRatingChangesFast } from '@crp/core';
import type { Contestant } from '@crp/core';
import type { ApiRatingChange, StandingsRow } from '../types.js';

/**
 * 从榜单行和 rating 映射构造 Contestant[]。
 * 未评分用户（rating 为 undefined）使用 1400 作为基准。
 */
export function buildContestants(
  rows: StandingsRow[],
  ratings: Map<string, number | undefined>,
): Contestant[] {
  return rows.map((row) => {
    const r = ratings.get(row.handle);
    return {
      party: row.handle,
      rank: row.rank,
      rating: r ?? 1400,
    };
  });
}

/**
 * 预测每位选手的 delta（进行中 / 未结算比赛）。
 * 返回 handle → delta 的 Map。
 */
export function predictDeltas(
  rows: StandingsRow[],
  ratings: Map<string, number | undefined>,
): Map<string, number> {
  const contestants = buildContestants(rows, ratings);
  const changes = computeRatingChangesFast(contestants);
  const result = new Map<string, number>();
  for (const c of changes) {
    result.set(c.party, c.delta);
  }
  return result;
}

/**
 * 从已结束赛的 ratingChanges 中提取 rating + delta（真实值）。
 * 返回 handle → { rating: oldRating, delta: newRating - oldRating }。
 */
export function finalDeltas(
  ratingChanges: ApiRatingChange[],
): Map<string, { rating: number; delta: number }> {
  const result = new Map<string, { rating: number; delta: number }>();
  for (const rc of ratingChanges) {
    result.set(rc.handle, {
      rating: rc.oldRating,
      delta: rc.newRating - rc.oldRating,
    });
  }
  return result;
}
