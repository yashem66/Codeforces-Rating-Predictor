import type { ApiUserRatingEntry } from './types.js';
import { priorRatedCount } from './contestCounts.js';
import { CodeforcesApi } from './api.js';

/**
 * 小样本验证用的比赛清单（2022+，覆盖不同档次/赛制的 rated 个人赛）。
 * 选取兼顾规模与多样性；后续可扩展到全量。
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

/** 用各 handle 的历史构建“赛前场次 k”映射。 */
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

/**
 * 抓取单场比赛验证所需的全部数据：
 * - contest.ratingChanges（真值 + rank + 显示 oldRating/newRating）
 * - 每个 handle 的 user.rating（用于求 k）
 * 返回 rows 与 priorCounts。所有请求经 api 内部缓存与限频。
 */
export async function fetchContestData(
  api: CodeforcesApi,
  contestId: number,
): Promise<{
  rows: Awaited<ReturnType<CodeforcesApi['getRatingChanges']>>;
  priorCounts: Map<string, number>;
}> {
  const rows = await api.getRatingChanges(contestId);
  if (rows.length === 0) {
    return { rows, priorCounts: new Map() };
  }
  const contestTime = rows[0]!.ratingUpdateTimeSeconds;

  const histories = new Map<string, ApiUserRatingEntry[]>();
  for (const row of rows) {
    if (histories.has(row.handle)) continue;
    const history = await api.getUserRating(row.handle);
    histories.set(row.handle, history);
  }

  return { rows, priorCounts: buildPriorCounts(histories, contestTime) };
}
