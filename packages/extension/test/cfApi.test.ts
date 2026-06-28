import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRatingChanges,
  getStandings,
  getUserInfos,
  UserRatingPrefetcher,
  _clearMemCache,
  _api,
} from '../src/lib/cfApi.js';

// Mock fetch 通过对象属性注入（ESM read-only export 的 workaround）
const mockFetch = vi.fn();

function makeOk<T>(result: T): Response {
  return {
    ok: true,
    json: async () => ({ status: 'OK', result }),
  } as unknown as Response;
}

function makeFailed(comment: string): Response {
  return {
    ok: true,
    json: async () => ({ status: 'FAILED', comment }),
  } as unknown as Response;
}

beforeEach(() => {
  _clearMemCache();
  mockFetch.mockReset();
  // 注入 mock fetch（通过对象属性，ESM 中可修改对象属性）
  _api.fetchImpl = mockFetch as unknown as (url: string) => Promise<Response>;
  // Stub chrome as unavailable (降级到内存缓存)
  vi.stubGlobal('chrome', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRatingChanges', () => {
  it('returns parsed rating changes on OK response', async () => {
    const data = [
      { contestId: 1, contestName: 'Test', handle: 'user1', rank: 1,
        ratingUpdateTimeSeconds: 0, oldRating: 1500, newRating: 1550 },
    ];
    mockFetch.mockResolvedValueOnce(makeOk(data));
    const result = await getRatingChanges(1);
    expect(result).toHaveLength(1);
    expect(result[0]!.handle).toBe('user1');
    expect(result[0]!.newRating - result[0]!.oldRating).toBe(50);
  });

  it('returns empty array when contest is unrated/unavailable', async () => {
    mockFetch.mockResolvedValueOnce(makeFailed('Rating changes are unavailable for this contest'));
    const result = await getRatingChanges(999);
    expect(result).toEqual([]);
  });

  it('returns empty array when "not found" in comment', async () => {
    mockFetch.mockResolvedValueOnce(makeFailed('No such contest, not found'));
    const result = await getRatingChanges(404);
    expect(result).toEqual([]);
  });

  it('throws on non-empty-result errors', async () => {
    mockFetch.mockResolvedValueOnce(makeFailed('Request limit exceeded'));
    await expect(getRatingChanges(1)).rejects.toThrow('CF API error');
  });
});

describe('getStandings', () => {
  it('parses individual-contest standings rows', async () => {
    const data = {
      contest: { id: 1, name: 'Test' },
      problems: [],
      rows: [
        { party: { members: [{ handle: 'alice' }] }, rank: 1, points: 3, penalty: 10 },
        { party: { members: [{ handle: 'bob' }] }, rank: 2, points: 2, penalty: 5 },
      ],
    };
    mockFetch.mockResolvedValueOnce(makeOk(data));
    const rows = await getStandings(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.handle).toBe('alice');
    expect(rows[1]!.rank).toBe(2);
  });

  it('skips team contest rows (multiple members)', async () => {
    const data = {
      contest: { id: 1 },
      problems: [],
      rows: [
        { party: { members: [{ handle: 'a' }, { handle: 'b' }] }, rank: 1, points: 1, penalty: 0 },
        { party: { members: [{ handle: 'solo' }] }, rank: 2, points: 0, penalty: 0 },
      ],
    };
    mockFetch.mockResolvedValueOnce(makeOk(data));
    const rows = await getStandings(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.handle).toBe('solo');
  });
});

describe('getUserInfos', () => {
  it('fetches and returns user info', async () => {
    const data = [
      { handle: 'alice', rating: 1600 },
      { handle: 'bob' }, // unrated — no rating field
    ];
    mockFetch.mockResolvedValueOnce(makeOk(data));
    const infos = await getUserInfos(['alice', 'bob']);
    expect(infos).toHaveLength(2);
    const alice = infos.find((u) => u.handle === 'alice')!;
    expect(alice.rating).toBe(1600);
    const bob = infos.find((u) => u.handle === 'bob')!;
    expect(bob.rating).toBeUndefined();
  });

  it('uses memory cache and does not re-fetch cached handles', async () => {
    const data = [{ handle: 'cached', rating: 1700 }];
    mockFetch.mockResolvedValueOnce(makeOk(data));

    // First call — fetches
    await getUserInfos(['cached']);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — should use cache
    const infos = await getUserInfos(['cached']);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no new fetch
    expect(infos[0]!.rating).toBe(1700);
  });

  it('merges results across handles', async () => {
    const handles = ['u1', 'u2', 'u3'];
    const data = handles.map((h, i) => ({ handle: h, rating: 1000 + i }));
    mockFetch.mockResolvedValueOnce(makeOk(data));
    const infos = await getUserInfos(handles);
    expect(infos).toHaveLength(3);
  });
});

describe('UserRatingPrefetcher', () => {
  it('prefetches ratings so a later getUserInfos hits cache', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeOk([
          { handle: 'alice', rating: 1600 },
          { handle: 'bob', rating: 1700 },
        ]),
      )
      .mockResolvedValueOnce(makeOk([{ handle: 'carol', rating: 1800 }]));

    const prefetcher = new UserRatingPrefetcher();
    prefetcher.add(['alice', 'bob']);
    await prefetcher.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const infos = await getUserInfos(['alice', 'bob', 'carol']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(infos.find((u) => u.handle === 'alice')!.rating).toBe(1600);
    expect(infos.find((u) => u.handle === 'carol')!.rating).toBe(1800);
  });
});
