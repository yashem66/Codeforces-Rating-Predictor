import type { ApiUserRatingEntry } from './types.js';

/**
 * 给定某 handle 的完整 rating 历史，返回在 ratingUpdateTime 严格早于
 * beforeTimeSeconds 的比赛场次数（即该用户进入目标比赛前已完成的 rated 场次 k）。
 */
export function priorRatedCount(
  history: ApiUserRatingEntry[],
  beforeTimeSeconds: number,
): number {
  let count = 0;
  for (const e of history) {
    if (e.ratingUpdateTimeSeconds < beforeTimeSeconds) count++;
  }
  return count;
}
