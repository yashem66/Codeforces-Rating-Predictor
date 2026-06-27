import type { ApiUserRatingEntry } from './types.js';
import { priorRatedCount } from './contestCounts.js';

/**
 * 小样本验证用的比赛清单（2022+，覆盖不同档次/赛制的 rated 个人赛）。
 * 用于快速核心算法检查点；全量验证见 full.ts。
 */
export const SAMPLE_CONTEST_IDS: number[] = [
  1623, // Codeforces Round 763 (Div. 2) 2022-01
  1627, // Educational Codeforces Round 121 2022-01
  1675, // Codeforces Round 787 (Div. 3) 2022-05
  1692, // Codeforces Round 799 (Div. 4) 2022-07
  1716, // Codeforces Round 815 (Div. 2) 2022-08
  1830, // Codeforces Round 875 (Div. 1) 2023-05
  1850, // Codeforces Round 886 (Div. 4) 2023-07
  1925, // Codeforces Round 922 (Div. 1) 2024-02
];

/**
 * 用各 handle 的历史构建“赛前场次 k”映射。
 * 注：全量验证用 ParticipationIndex 从 ratingChanges 语料反推 k（见 full.ts）；
 * 本函数保留用于从 user.rating 历史构建（小规模/调试用途）。
 */
export function buildPriorCounts(
  histories: Map<string, ApiUserRatingEntry[]>,
  contestTimeSeconds: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [handle, history] of histories) {
    counts.set(handle, priorRatedCount(history, contestTimeSeconds));
  }
  return counts;
}
