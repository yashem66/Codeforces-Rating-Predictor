import type { ApiContest, ApiRatingChange, ApiUserRatingEntry } from './types.js';
import { JsonCache } from './cache.js';

const API_BASE = 'https://codeforces.com/api';

interface ApiOptions {
  cache: JsonCache;
  /** 两次真实请求的最小间隔（毫秒）。默认 2100，遵守 CF 限频。 */
  minIntervalMs?: number;
  /** 最大重试次数（针对限频/5xx）。默认 4。 */
  maxRetries?: number;
}

type ApiResponse<T> = { status: 'OK'; result: T } | { status: 'FAILED'; comment: string };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class CodeforcesApi {
  private readonly cache: JsonCache;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private lastCallAt = 0;

  constructor(opts: ApiOptions) {
    this.cache = opts.cache;
    this.minIntervalMs = opts.minIntervalMs ?? 2100;
    this.maxRetries = opts.maxRetries ?? 4;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastCallAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  /**
   * 匿名 GET 调用；method 形如 'contest.ratingChanges'，params 为查询参数。
   * opts.emptyOnFailed：当 FAILED 的 comment 匹配该正则时，把 emptyValue 当作结果缓存并返回
   * （用于“评分变化不可用/未计分/未找到”等永久性空结果，避免每次重抓）。
   */
  private async call<T>(
    method: string,
    params: Record<string, string>,
    opts?: { emptyValue: T; emptyOnFailed: RegExp },
  ): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const cacheKey = `${method}?${qs}`;
    const cached = await this.cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.throttle();
      try {
        const res = await fetch(`${API_BASE}/${method}?${qs}`);
        if (res.status === 503 || res.status === 429) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as ApiResponse<T>;
        if (body.status === 'OK') {
          await this.cache.set(cacheKey, body.result);
          return body.result;
        }
        if (opts && opts.emptyOnFailed.test(body.comment)) {
          await this.cache.set(cacheKey, opts.emptyValue);
          return opts.emptyValue;
        }
        if (/limit exceeded/i.test(body.comment)) {
          throw new Error(body.comment);
        }
        throw new Error(`CF API ${method} FAILED: ${body.comment}`);
      } catch (err) {
        lastErr = err;
        const backoff = Math.min(2000 * 2 ** attempt, 30000);
        if (attempt < this.maxRetries) await sleep(backoff);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  getRatingChanges(contestId: number): Promise<ApiRatingChange[]> {
    return this.call<ApiRatingChange[]>(
      'contest.ratingChanges',
      { contestId: String(contestId) },
      { emptyValue: [], emptyOnFailed: /unavailable|not rated|unrated|not found|hidden/i },
    );
  }

  getUserRating(handle: string): Promise<ApiUserRatingEntry[]> {
    return this.call<ApiUserRatingEntry[]>('user.rating', { handle });
  }

  getContestList(): Promise<ApiContest[]> {
    return this.call<ApiContest[]>('contest.list', { gym: 'false' });
  }
}
