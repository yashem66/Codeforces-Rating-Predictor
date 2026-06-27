import { describe, it, expect } from 'vitest';
import { filterContests } from '../src/contests.js';
import type { ApiContest } from '../src/types.js';

function c(id: number, phase: string, t?: number): ApiContest {
  return { id, name: `c${id}`, phase, type: 'CF', startTimeSeconds: t };
}

describe('filterContests', () => {
  it('仅保留 FINISHED、有开始时间、落在 [from,to] 的比赛', () => {
    const all = [
      c(1, 'FINISHED', 100),
      c(2, 'BEFORE', 150),
      c(3, 'FINISHED'),
      c(4, 'FINISHED', 50),
      c(5, 'FINISHED', 300),
    ];
    const out = filterContests(all, 60, 250);
    expect(out.map((x) => x.id)).toEqual([1]);
  });

  it('升序返回', () => {
    const all = [c(1, 'FINISHED', 300), c(2, 'FINISHED', 100), c(3, 'FINISHED', 200)];
    const out = filterContests(all, 0, 1000);
    expect(out.map((x) => x.startTimeSeconds)).toEqual([100, 200, 300]);
  });
});
