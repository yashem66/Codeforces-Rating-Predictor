/**
 * 2020 新账号规则：计算分从 1400 起，显示分从 0 起；
 * 前 6 场显示分额外叠加 500/350/250/150/100/50（合计 1400）。
 * 下表是“计算分 − 显示分”的偏移，按【已完成 rated 场次 k】索引。
 */
export const NEW_ACCOUNT_OFFSETS = [1400, 900, 550, 300, 150, 50] as const;

/** 已完成 k 场 rated 比赛时，计算分相对显示分的偏移；k>=6 为 0。 */
export function offsetForContestCount(k: number): number {
  if (k < 0) throw new Error(`contest count must be >= 0, got ${k}`);
  return k >= NEW_ACCOUNT_OFFSETS.length ? 0 : NEW_ACCOUNT_OFFSETS[k]!;
}

/** 显示分 -> 计算分（k = 本场之前已完成的 rated 场次）。 */
export function displayToCalc(display: number, k: number): number {
  return display + offsetForContestCount(k);
}

/** 计算分 -> 显示分（k = 截至该计算分时已完成的 rated 场次）。 */
export function calcToDisplay(calc: number, k: number): number {
  return calc - offsetForContestCount(k);
}
