import { describe, it, expect } from 'vitest';
import { SAMPLE_CONTEST_IDS, buildPriorCounts } from '../src/dataset.js';
import type { ApiUserRatingEntry } from '../src/types.js';

describe('SAMPLE_CONTEST_IDS', () => {
  it('是一组非空、去重的正整数 contestId', () => {
    expect(SAMPLE_CONTEST_IDS.length).toBeGreaterThan(0);
    expect(new Set(SAMPLE_CONTEST_IDS).size).toBe(SAMPLE_CONTEST_IDS.length);
    for (const id of SAMPLE_CONTEST_IDS) expect(Number.isInteger(id) && id > 0).toBe(true);
  });
});

describe('buildPriorCounts', () => {
  it('按每个 handle 的历史，统计目标比赛前的场次 k', () => {
    const histories = new Map<string, ApiUserRatingEntry[]>([
      [
        'a',
        [
          {
            contestId: 1,
            contestName: '',
            handle: 'a',
            rank: 1,
            ratingUpdateTimeSeconds: 50,
            oldRating: 0,
            newRating: 0,
          },
          {
            contestId: 2,
            contestName: '',
            handle: 'a',
            rank: 1,
            ratingUpdateTimeSeconds: 150,
            oldRating: 0,
            newRating: 0,
          },
        ],
      ],
      ['b', []],
    ]);
    const counts = buildPriorCounts(histories, 100);
    expect(counts.get('a')).toBe(1);
    expect(counts.get('b')).toBe(0);
  });
});
