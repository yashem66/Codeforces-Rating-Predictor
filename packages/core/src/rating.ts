import { winProbability } from './elo.js';
import type { Contestant, RatingChange } from './types.js';

/** 计算给定 rating 在“除 excludeIndex 之外”的对手中的 seed（期望名次）。 */
function getSeed(rating: number, ratings: number[], excludeIndex: number): number {
  let s = 1;
  for (let j = 0; j < ratings.length; j++) {
    if (j === excludeIndex) continue;
    s += winProbability(ratings[j]!, rating);
  }
  return s;
}

/** 二分查找使 seed(R) == targetSeed 的整数 rating R（seed 关于 rating 单调递减）。 */
function searchRating(targetSeed: number, ratings: number[], excludeIndex: number): number {
  let lo = 1;
  let hi = 8000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (getSeed(mid, ratings, excludeIndex) < targetSeed) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return lo;
}

/**
 * 复现 Codeforces 当前评分算法（计算分空间）：
 * 1) 每人 seed_i（对手为其余全体）；
 * 2) m_i = sqrt(seed_i * rank_i)；
 * 3) 二分表现分 R_i 使 seed(R_i) = m_i；d_i = trunc((R_i - r_i) / 2)；
 * 4) 修正①：inc = trunc(-Σd/n) - 1，全员加；
 * 5) 修正②：取按 rating 降序前 s=min(n, round(4√n)) 人，inc = clamp(trunc(-Σd_s/s), -10, 0)，全员加。
 */
export function computeRatingChanges(contestants: Contestant[]): RatingChange[] {
  const n = contestants.length;
  if (n === 0) return [];

  const ratings = contestants.map((c) => c.rating);
  const deltas = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const seedI = getSeed(ratings[i]!, ratings, i);
    const midRank = Math.sqrt(seedI * contestants[i]!.rank);
    const r = searchRating(midRank, ratings, i);
    deltas[i] = Math.trunc((r - ratings[i]!) / 2);
  }

  // 修正①：使 Σd 接近 0 且非正
  {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += deltas[i]!;
    const inc = Math.trunc(-sum / n) - 1;
    for (let i = 0; i < n; i++) deltas[i]! += inc;
  }

  // 修正②：高分组总变化下调不超过约 10 分
  {
    const order = [...Array(n).keys()].sort((a, b) => ratings[b]! - ratings[a]!);
    const s = Math.min(n, Math.round(4 * Math.sqrt(n)));
    let sum = 0;
    for (let t = 0; t < s; t++) sum += deltas[order[t]!]!;
    const inc = Math.min(Math.max(Math.trunc(-sum / s), -10), 0);
    for (let i = 0; i < n; i++) deltas[i]! += inc;
  }

  return contestants.map((c, i) => ({
    party: c.party,
    rank: c.rank,
    oldRating: c.rating,
    delta: deltas[i]!,
    newRating: c.rating + deltas[i]!,
  }));
}
