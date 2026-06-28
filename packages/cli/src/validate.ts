import { computeRatingChanges, displayToCalc, calcToDisplay } from '@crp/core';
import type { Contestant, RatingChange } from '@crp/core';
import type { ApiRatingChange } from './types.js';

export interface Mismatch {
  handle: string;
  rank: number;
  predictedNewRating: number;
  actualNewRating: number;
  absError: number;
  priorCount: number;
}

export interface ContestReport {
  n: number;
  exactRate: number;
  meanAbsError: number;
  medianAbsError: number;
  maxAbsError: number;
  /** 误差最大的若干条（绝对误差降序，最多 20 条）。 */
  worst: Mismatch[];
}

type RatingFn = (contestants: Contestant[]) => RatingChange[];

/**
 * 对单场比赛验证算法：
 * 显示 oldRating --(k, displayToCalc)--> 计算分 -> core -> 计算分 newRating
 *   --((k+1), calcToDisplay)--> 预测显示 newRating，与真值显示 newRating 对比。
 */
export function validateContest(
  allRows: ApiRatingChange[],
  priorCounts: Map<string, number>,
  ratingFn: RatingFn = computeRatingChanges,
): ContestReport {
  // 剔除被 CF 行政清零的异常条目（newRating==0：取消资格/作弊清零），它们非正常评分变化。
  const rows = allRows.filter((r) => r.newRating !== 0);
  const contestants: Contestant[] = rows.map((r) => {
    const k = priorCounts.get(r.handle) ?? 6; // 默认按成熟用户处理（偏移 0）
    return { party: r.handle, rank: r.rank, rating: displayToCalc(r.oldRating, k) };
  });

  const changes = ratingFn(contestants);
  const byParty = new Map(changes.map((c) => [c.party, c]));

  const mismatches: Mismatch[] = [];
  for (const r of rows) {
    const k = priorCounts.get(r.handle) ?? 6;
    const change = byParty.get(r.handle)!;
    const predictedDisplay = calcToDisplay(change.newRating, k + 1);
    const absError = Math.abs(predictedDisplay - r.newRating);
    mismatches.push({
      handle: r.handle,
      rank: r.rank,
      predictedNewRating: predictedDisplay,
      actualNewRating: r.newRating,
      absError,
      priorCount: k,
    });
  }

  const errors = mismatches.map((m) => m.absError).sort((a, b) => a - b);
  const n = errors.length;
  const exact = errors.filter((e) => e === 0).length;
  const sum = errors.reduce((s, e) => s + e, 0);
  const median = n === 0 ? 0 : errors[Math.floor((n - 1) / 2)]!;
  const worst = [...mismatches]
    .filter((m) => m.absError > 0)
    .sort((a, b) => b.absError - a.absError)
    .slice(0, 20);

  return {
    n,
    exactRate: n === 0 ? 1 : exact / n,
    meanAbsError: n === 0 ? 0 : sum / n,
    medianAbsError: median,
    maxAbsError: n === 0 ? 0 : errors[n - 1]!,
    worst,
  };
}
