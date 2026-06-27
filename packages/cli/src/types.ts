/** contest.ratingChanges 的单条记录（CF 返回的是“显示分”）。 */
export interface ApiRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

/** user.rating 的单条历史记录。 */
export interface ApiUserRatingEntry {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

/** contest.list 的单条记录（仅用到部分字段）。 */
export interface ApiContest {
  id: number;
  name: string;
  phase: string;
  type: string;
  startTimeSeconds?: number;
}
