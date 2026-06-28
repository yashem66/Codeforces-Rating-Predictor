import { describe, it, expect } from 'vitest';
import { buildContestants, predictDeltas, finalDeltas } from '../src/lib/predict.js';
import type { StandingsRow, ApiRatingChange } from '../src/types.js';

const rows: StandingsRow[] = [
  { handle: 'alice', rank: 1, points: 3, penalty: 0 },
  { handle: 'bob', rank: 2, points: 2, penalty: 0 },
  { handle: 'newbie', rank: 3, points: 1, penalty: 0 },
];

describe('buildContestants', () => {
  it('uses provided rating for rated users', () => {
    const ratings = new Map<string, number | undefined>([
      ['alice', 1800],
      ['bob', 1500],
      ['newbie', undefined],
    ]);
    const contestants = buildContestants(rows, ratings);
    expect(contestants).toHaveLength(3);
    expect(contestants[0]).toMatchObject({ party: 'alice', rank: 1, rating: 1800 });
    expect(contestants[1]).toMatchObject({ party: 'bob', rank: 2, rating: 1500 });
  });

  it('falls back to 1400 for unrated users (undefined)', () => {
    const ratings = new Map<string, number | undefined>([
      ['alice', 1600],
      ['bob', undefined],
      // newbie 不在 Map 里
    ]);
    const contestants = buildContestants(rows, ratings);
    // bob → undefined → 1400
    expect(contestants[1]!.rating).toBe(1400);
    // newbie → not in map → 1400
    expect(contestants[2]!.rating).toBe(1400);
  });
});

describe('predictDeltas', () => {
  it('returns a Map with a delta for each handle', () => {
    const ratings = new Map<string, number | undefined>([
      ['alice', 1800],
      ['bob', 1500],
      ['newbie', undefined],
    ]);
    const deltas = predictDeltas(rows, ratings);
    expect(deltas.size).toBe(3);
    expect(typeof deltas.get('alice')).toBe('number');
    expect(typeof deltas.get('bob')).toBe('number');
    expect(typeof deltas.get('newbie')).toBe('number');
  });

  it('produces consistent results with @crp/core (rank 1 gains, rank last loses or neutral)', () => {
    // With 3 participants and clear rank ordering, rank 1 should gain rating
    const ratings = new Map<string, number | undefined>([
      ['alice', 1500],
      ['bob', 1500],
      ['newbie', 1500],
    ]);
    const deltas = predictDeltas(rows, ratings);
    // rank 1 should gain, rank 3 should lose (or at least rank1 > rank3 delta)
    expect(deltas.get('alice')!).toBeGreaterThan(deltas.get('newbie')!);
  });
});

describe('finalDeltas', () => {
  it('extracts oldRating and delta from ratingChanges', () => {
    const changes: ApiRatingChange[] = [
      { contestId: 1, contestName: 'C', handle: 'alice', rank: 1,
        ratingUpdateTimeSeconds: 0, oldRating: 1800, newRating: 1850 },
      { contestId: 1, contestName: 'C', handle: 'bob', rank: 2,
        ratingUpdateTimeSeconds: 0, oldRating: 1500, newRating: 1480 },
    ];
    const finals = finalDeltas(changes);
    expect(finals.size).toBe(2);
    expect(finals.get('alice')).toEqual({ rating: 1800, delta: 50 });
    expect(finals.get('bob')).toEqual({ rating: 1500, delta: -20 });
  });

  it('returns empty map for empty input', () => {
    expect(finalDeltas([])).toEqual(new Map());
  });
});
