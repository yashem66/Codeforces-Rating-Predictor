/** 一名参赛者（喂给算法时 rating 必须是“计算分”，即 1400 基准）。 */
export interface Contestant {
  /** 选手标识（handle）。 */
  party: string;
  /** 实际名次，1-based；并列者共享相同名次值。 */
  rank: number;
  /** 计算分（calculation rating）。 */
  rating: number;
}

/** 单名参赛者的 rating 变化结果（均为计算分空间）。 */
export interface RatingChange {
  party: string;
  rank: number;
  oldRating: number;
  delta: number;
  newRating: number;
}
