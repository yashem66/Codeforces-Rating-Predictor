import type { ApiRatingChange } from './types.js';

/** 全局参赛索引：handle -> 该用户所有参赛的 ratingUpdateTime（finalize 后升序）。 */
export class ParticipationIndex {
  private readonly map = new Map<string, number[]>();

  addContest(rows: ApiRatingChange[]): void {
    for (const r of rows) {
      const arr = this.map.get(r.handle);
      if (arr) arr.push(r.ratingUpdateTimeSeconds);
      else this.map.set(r.handle, [r.ratingUpdateTimeSeconds]);
    }
  }

  finalize(): void {
    for (const arr of this.map.values()) arr.sort((a, b) => a - b);
  }

  /** 该 handle 在 beforeTimeSeconds 之前的参赛场次数（即赛前 k）。 */
  priorCount(handle: string, beforeTimeSeconds: number): number {
    const arr = this.map.get(handle);
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
}
