/**
 * 选手 I 比选手 J 取得更好成绩的概率：
 * P = 1 / (1 + 10^((ratingJ - ratingI) / 400))
 */
export function winProbability(ratingI: number, ratingJ: number): number {
  return 1 / (1 + Math.pow(10, (ratingJ - ratingI) / 400));
}

/**
 * 给定 rating 的选手，在一组对手 ratings 中的期望名次（seed）：
 * seed = 1 + Σ P(对手胜过我) = 1 + Σ winProbability(对手, 我)
 * 注意：otherRatings 不包含选手本人。
 */
export function seedAgainst(rating: number, otherRatings: number[]): number {
  let s = 1;
  for (const other of otherRatings) {
    s += winProbability(other, rating);
  }
  return s;
}
