/** Codeforces API: contest.ratingChanges 单条记录 */
export interface ApiRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

/** 从 contest.standings 行中解析出的选手信息 */
export interface StandingsRow {
  handle: string;
  rank: number;
  points: number;
  penalty: number;
}

/** user.info 返回的用户信息 */
export interface UserInfo {
  handle: string;
  rating?: number;
}

/** 插件设置 */
export interface Settings {
  showRating: boolean;
  showDelta: boolean;
}

/** 注入列所需的单行数据 */
export interface RowData {
  rating?: number;
  delta?: number;
}
