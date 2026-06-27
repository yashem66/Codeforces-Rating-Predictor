import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeforcesApi } from '../src/api.js';
import { JsonCache } from '../src/cache.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crp-api-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('CodeforcesApi.getRatingChanges', () => {
  it('解析 status=OK 的 result，并命中缓存避免二次请求', async () => {
    const payload = {
      status: 'OK',
      result: [
        {
          contestId: 1,
          contestName: 'T',
          handle: 'h',
          rank: 1,
          ratingUpdateTimeSeconds: 100,
          oldRating: 1500,
          newRating: 1530,
        },
      ],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = new CodeforcesApi({ cache: new JsonCache(dir), minIntervalMs: 0 });
    const a = await api.getRatingChanges(1);
    const b = await api.getRatingChanges(1);

    expect(a).toHaveLength(1);
    expect(a[0]!.handle).toBe('h');
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('status=FAILED 抛出包含 comment 的错误', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'FAILED', comment: 'boom' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new CodeforcesApi({ cache: new JsonCache(dir), minIntervalMs: 0, maxRetries: 0 });
    await expect(api.getRatingChanges(2)).rejects.toThrow(/boom/);
  });
});
