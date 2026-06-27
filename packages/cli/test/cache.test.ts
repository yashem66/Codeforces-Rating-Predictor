import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonCache } from '../src/cache.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crp-cache-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('JsonCache', () => {
  it('miss 时返回 undefined', async () => {
    const cache = new JsonCache(dir);
    expect(await cache.get('nope')).toBeUndefined();
  });

  it('set 后 get 命中，且能跨实例读取', async () => {
    const a = new JsonCache(dir);
    await a.set('k', { value: 42 });
    expect(await a.get<{ value: number }>('k')).toEqual({ value: 42 });

    const b = new JsonCache(dir);
    expect(await b.get<{ value: number }>('k')).toEqual({ value: 42 });
  });

  it('key 中的非法文件名字符被安全转义', async () => {
    const cache = new JsonCache(dir);
    await cache.set('user.rating?handle=a/b:c', [1, 2, 3]);
    expect(await cache.get('user.rating?handle=a/b:c')).toEqual([1, 2, 3]);
  });
});
