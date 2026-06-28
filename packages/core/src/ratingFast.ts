import { convolveReal } from './fft.js';
import type { Contestant, RatingChange } from './types.js';

/** ELO 核：g(x) = 1 / (1 + 10^(x/400))，等价于“rating 比我高 x 的对手胜过我”的概率。 */
function gKernel(x: number): number {
  return 1 / (1 + Math.pow(10, x / 400));
}

/**
 * FFT 加速版：与 computeRatingChanges 数学等价，但用一次卷积预计算
 * S(R) = 1 + Σ_r cnt[r] g(R - r)，把每人 seed 与二分查找降到近似 O(N log N)。
 * 适用于大赛（数万人）。极小概率因浮点误差与朴素版相差 ±1。
 */
export function computeRatingChangesFast(contestants: Contestant[]): RatingChange[] {
  const n = contestants.length;
  if (n === 0) return [];

  let minR = 1;
  let maxR = 8000;
  for (const c of contestants) {
    if (c.rating < minR) minR = c.rating;
    if (c.rating > maxR) maxR = c.rating;
  }
  const Dlo = Math.min(minR, 1);
  const Dhi = Math.max(maxR, 8000);
  const L = Dhi - Dlo + 1;

  const cnt = new Float64Array(L);
  for (const c of contestants) cnt[c.rating - Dlo]! += 1;

  const kern = new Float64Array(2 * L - 1);
  for (let j = 0; j < 2 * L - 1; j++) kern[j] = gKernel(j - (L - 1));

  const conv = convolveReal(cnt, kern); // 长度 3L-2
  // S(Dlo + s) = 1 + conv[s + (L-1)]
  const S = (rating: number): number => 1 + conv[rating - Dlo + (L - 1)]!;

  // 并列名次取该并列组的“最差（最大）位置”，与 CF/TLE 一致。
  const rankCount = new Map<number, number>();
  for (const c of contestants) rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);

  const deltas = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const ri = contestants[i]!.rating;
    const seedI = S(ri) - 0.5; // 排除自身（g(0)=0.5）
    const effRank = contestants[i]!.rank + rankCount.get(contestants[i]!.rank)! - 1;
    const midRank = Math.sqrt(seedI * effRank);
    let lo = 1;
    let hi = 8000;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const seedOthers = S(mid) - gKernel(mid - ri); // 排除自身在该候选 rating 下的贡献
      if (seedOthers < midRank) hi = mid;
      else lo = mid;
    }
    deltas[i] = Math.trunc((lo - ri) / 2);
  }

  {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += deltas[i]!;
    const inc = Math.trunc(-sum / n) - 1;
    for (let i = 0; i < n; i++) deltas[i]! += inc;
  }
  {
    const order = [...Array(n).keys()].sort(
      (a, b) => contestants[b]!.rating - contestants[a]!.rating,
    );
    const s = Math.min(n, 4 * Math.round(Math.sqrt(n)));
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
