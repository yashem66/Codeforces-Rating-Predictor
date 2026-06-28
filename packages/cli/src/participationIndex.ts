import type { ApiRatingChange } from './types.js';

/**
 * 全局参赛索引：记录每个 handle 的所有参赛时间，以及其“最早一场”的 oldRating
 * （用于判定是否新评分体系账号：新体系账号首场显示 oldRating 为 0）。
 * 必须用 CF 全历史构建，才能得到准确的 k 与首场信息。
 */
export class ParticipationIndex {
  private readonly times = new Map<string, number[]>();
  private readonly first = new Map<string, { time: number; oldRating: number }>();

  addContest(rows: ApiRatingChange[]): void {
    for (const r of rows) {
      const arr = this.times.get(r.handle);
      if (arr) arr.push(r.ratingUpdateTimeSeconds);
      else this.times.set(r.handle, [r.ratingUpdateTimeSeconds]);

      const f = this.first.get(r.handle);
      if (f === undefined || r.ratingUpdateTimeSeconds < f.time) {
        this.first.set(r.handle, { time: r.ratingUpdateTimeSeconds, oldRating: r.oldRating });
      }
    }
  }

  finalize(): void {
    for (const arr of this.times.values()) arr.sort((a, b) => a - b);
  }

  /** 该 handle 在 beforeTimeSeconds 之前的参赛场次数（即赛前 k）。 */
  priorCount(handle: string, beforeTimeSeconds: number): number {
    const arr = this.times.get(handle);
    if (!arr) return 0;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid]! < beforeTimeSeconds) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** 该 handle 最早一次参赛时间（finalize 后有效）；未知返回 undefined。 */
  firstTime(handle: string): number | undefined {
    return this.first.get(handle)?.time;
  }

  /** 是否新评分体系账号：其最早一场的 oldRating 显示为 0。 */
  isNewSystem(handle: string): boolean {
    const f = this.first.get(handle);
    return f !== undefined && f.oldRating === 0;
  }

  /**
   * 用于换算的“有效 k”：
   * - 老体系账号（首场 oldRating != 0）从不享受新账号显示偏移 -> 返回 6（offset 0）；
   * - 新体系账号 -> 返回其赛前真实场次 k。
   */
  effectiveK(handle: string, beforeTimeSeconds: number): number {
    if (!this.isNewSystem(handle)) return 6;
    return this.priorCount(handle, beforeTimeSeconds);
  }

  /** 诊断用：handle 数、总参赛条目数、单个 handle 最大参赛数。 */
  stats(): { handles: number; totalEntries: number; maxEntries: number } {
    let totalEntries = 0;
    let maxEntries = 0;
    for (const arr of this.times.values()) {
      totalEntries += arr.length;
      if (arr.length > maxEntries) maxEntries = arr.length;
    }
    return { handles: this.times.size, totalEntries, maxEntries };
  }
}
