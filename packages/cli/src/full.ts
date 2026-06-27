import { computeRatingChangesFast } from '@crp/core';
import type { Contestant, RatingChange } from '@crp/core';
import type { ApiRatingChange } from './types.js';
import type { ContestMeta } from './contests.js';
import { ParticipationIndex } from './participationIndex.js';
import { validateContest, type ContestReport } from './validate.js';
import { aggregate, type AggregateResult } from './report.js';

export interface RunValidateAllDeps {
  listContests: () => Promise<ContestMeta[]>;
  getRatingChanges: (contestId: number) => Promise<ApiRatingChange[]>;
  validateFromSec: number;
  ratingFn?: (contestants: Contestant[]) => RatingChange[];
  onProgress?: (msg: string) => void;
}

export interface RunValidateAllResult {
  validated: { contestId: number; report: ContestReport }[];
  aggregate: AggregateResult;
}

/**
 * 全量验证：枚举所有比赛 -> 抓取每场 ratingChanges 并建全局参赛索引 ->
 * 对 startTime >= validateFromSec 的非空比赛逐场验证 -> 汇总。
 * validateContest 内部已用注入算法在 calc 空间换算；这里用 priorCounts 提供 k。
 */
export async function runValidateAll(deps: RunValidateAllDeps): Promise<RunValidateAllResult> {
  const ratingFn = deps.ratingFn ?? computeRatingChangesFast;
  const contests = await deps.listContests();

  // 第一遍：抓取全部 ratingChanges，建立全局参赛索引；不在内存保留行（防 OOM，第二遍走缓存重读）。
  const index = new ParticipationIndex();
  for (const meta of contests) {
    let rows: ApiRatingChange[];
    try {
      rows = await deps.getRatingChanges(meta.id);
    } catch (err) {
      deps.onProgress?.(`skip ${meta.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (rows.length > 0) index.addContest(rows);
    deps.onProgress?.(`indexed ${meta.id} (${rows.length} rows)`);
  }
  index.finalize();

  // 第二遍：仅对窗口内比赛重读（缓存命中）并验证。
  const validated: { contestId: number; report: ContestReport }[] = [];
  for (const meta of contests) {
    if (meta.startTimeSeconds < deps.validateFromSec) continue;
    let rows: ApiRatingChange[];
    try {
      rows = await deps.getRatingChanges(meta.id);
    } catch (err) {
      deps.onProgress?.(`skip ${meta.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (rows.length === 0) continue;
    const contestTime = rows[0]!.ratingUpdateTimeSeconds;
    const priorCounts = new Map<string, number>();
    for (const r of rows) priorCounts.set(r.handle, index.priorCount(r.handle, contestTime));
    const report = validateContest(rows, priorCounts, ratingFn);
    validated.push({ contestId: meta.id, report });
    deps.onProgress?.(`validated ${meta.id} exact=${(report.exactRate * 100).toFixed(1)}%`);
  }

  return { validated, aggregate: aggregate(validated) };
}
