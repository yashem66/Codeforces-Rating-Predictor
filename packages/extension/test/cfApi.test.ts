// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRatingChanges,
  getStandings,
  getUserInfos,
  parseRatingChangesHtml,
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

function makeHtml(html: string): Response {
  return {
    ok: true,
    text: async () => html,
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

  it('falls back to contest rating HTML when API returns an empty result', async () => {
    mockFetch.mockResolvedValueOnce(makeOk([]));
    mockFetch.mockImplementationOnce(async (url: string) => {
      if (!url.endsWith('/contest/1106/ratings')) return makeHtml('');
      return makeHtml(`
          <table class="ratings">
            <thead>
              <tr>
                <th>#</th><th>Who</th><th>Rank</th>
                <th>Old Rating</th><th>New Rating</th><th>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td><td><a href="/profile/alice">alice</a></td><td>2</td>
                <td>1800</td><td>1867</td><td>+67</td>
              </tr>
            </tbody>
          </table>
        `);
    });

    const result = await getRatingChanges(1106, { htmlFallback: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1]![0])).toContain('/contest/1106/ratings');
    expect(result).toEqual([
      {
        contestId: 1106,
        contestName: '',
        handle: 'alice',
        rank: 2,
        ratingUpdateTimeSeconds: 0,
        oldRating: 1800,
        newRating: 1867,
      },
    ]);
  });
});

describe('parseRatingChangesHtml', () => {
  it('parses old and new rating columns', () => {
    const rows = parseRatingChangesHtml(
      `
        <table>
          <tr><th>#</th><th>Who</th><th>Rank</th><th>Old Rating</th><th>New Rating</th></tr>
          <tr>
            <td>1</td><td><a href="/profile/tourist">tourist</a></td><td>4</td>
            <td>3800</td><td>3821</td>
          </tr>
        </table>
      `,
      42,
    );

    expect(rows).toEqual([
      {
        contestId: 42,
        contestName: '',
        handle: 'tourist',
        rank: 4,
        ratingUpdateTimeSeconds: 0,
        oldRating: 3800,
        newRating: 3821,
      },
    ]);
  });

  it('parses new rating plus delta columns', () => {
    const rows = parseRatingChangesHtml(
      `
        <table>
          <tr><th>Rank</th><th>Who</th><th>Rating</th><th>Delta</th></tr>
          <tr>
            <td>10</td><td><a href="/profile/bob">bob</a></td>
            <td>1512</td><td>-18</td>
          </tr>
        </table>
      `,
      43,
    );

    expect(rows).toEqual([
      {
        contestId: 43,
        contestName: '',
        handle: 'bob',
        rank: 10,
        ratingUpdateTimeSeconds: 0,
        oldRating: 1530,
        newRating: 1512,
      },
    ]);
  });

  it('parses rating transition cells', () => {
    const rows = parseRatingChangesHtml(
      `
        <table>
          <tr><th>Rank</th><th>Who</th><th>Rating change</th><th>Rating</th></tr>
          <tr>
            <td>5</td><td><a href="/profile/carol">carol</a></td>
            <td>+97</td><td>1277 -> 1374</td>
          </tr>
        </table>
      `,
      44,
    );

    expect(rows).toEqual([
      {
        contestId: 44,
        contestName: '',
        handle: 'carol',
        rank: 5,
        ratingUpdateTimeSeconds: 0,
        oldRating: 1277,
        newRating: 1374,
      },
    ]);
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
