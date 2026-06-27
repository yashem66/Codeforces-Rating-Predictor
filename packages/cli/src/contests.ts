import type { ApiContest } from './types.js';
import { CodeforcesApi } from './api.js';

export interface ContestMeta {
  id: number;
  name: string;
  startTimeSeconds: number;
}

/** 从 contest.list 选出 FINISHED、有开始时间、落在 [fromSec, toSec] 的比赛（时间升序）。 */
export function filterContests(all: ApiContest[], fromSec: number, toSec: number): ContestMeta[] {
  const out: ContestMeta[] = [];
  for (const c of all) {
    if (c.phase !== 'FINISHED') continue;
    if (typeof c.startTimeSeconds !== 'number') continue;
    if (c.startTimeSeconds < fromSec || c.startTimeSeconds > toSec) continue;
    out.push({ id: c.id, name: c.name, startTimeSeconds: c.startTimeSeconds });
  }
  out.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  return out;
}

export async function listFinishedContests(
  api: CodeforcesApi,
  fromSec: number,
  toSec: number,
): Promise<ContestMeta[]> {
  const all = await api.getContestList();
  return filterContests(all, fromSec, toSec);
}
