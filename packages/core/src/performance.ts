import { seedAgainst } from './elo.js';

/**
 * 表现分：在给定对手中，达到目标名次 rank 所需的 rating。
 * 即求 R 使 seedAgainst(R, others) == rank（seed 关于 R 单调递减）。
 * 用于未来直播列“performance”（delta 为 0 时的 rating）。
 */
export function performanceRating(rank: number, otherRatings: number[]): number {
  let lo = 1;
  let hi = 8000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (seedAgainst(mid, otherRatings) < rank) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return lo;
}
