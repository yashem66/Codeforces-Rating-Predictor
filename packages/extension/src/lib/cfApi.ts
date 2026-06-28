import type { ApiRatingChange, StandingsRow, UserInfo } from '../types.js';

const CF_API = 'https://codeforces.com/api';

/**
 * 可替换的 fetch 实现（供测试注入 mock）。
 * 生产代码使用全局 fetch；测试中可修改 _api.fetchImpl。
 */
export const _api = {
  fetchImpl: (url: string): Promise<Response> => fetch(url),
};

// 内存缓存（测试 & 生产共用）
const memCache = new Map<string, { value: unknown; expiresAt: number }>();
const RATINGS_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时

function isChromeStorageAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined'
  );
}

async function chromeGet<T>(key: string): Promise<T | undefined> {
  if (!isChromeStorageAvailable()) return undefined;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

async function chromeSet(key: string, value: unknown): Promise<void> {
  if (!isChromeStorageAvailable()) return;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

async function getCached<T>(key: string): Promise<T | undefined> {
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.value as T;
  }
  const stored = await chromeGet<CacheEntry<T>>(key);
  if (stored && stored.expiresAt > Date.now()) {
    memCache.set(key, stored);
    return stored.value;
  }
  return undefined;
}

async function setCached<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
  memCache.set(key, entry);
  await chromeSet(key, entry);
}

/** 判断 API 失败是否属于"空结果"类型（比赛未计分、未找到等） */
function isEmptyResultError(comment: string): boolean {
  const lower = comment.toLowerCase();
  return (
    lower.includes('unavailable') ||
    lower.includes('unrated') ||
    lower.includes('not found') ||
    lower.includes('no such contest') ||
    lower.includes('rating changes are unavailable')
  );
}

async function cfFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${CF_API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await _api.fetchImpl(url.toString());
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  const json = (await res.json()) as { status: string; result?: T; comment?: string };
  if (json.status !== 'OK') {
    const comment = json.comment ?? 'Unknown error';
    if (isEmptyResultError(comment)) {
      // 返回"空"标记让调用方知道这是已知的无数据情况
      throw new EmptyResultError(comment);
    }
    throw new Error(`CF API error: ${comment}`);
  }
  return json.result as T;
}

export class EmptyResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyResultError';
  }
}

/** 获取已结束赛的 rating 变化；若未计分/未找到则返回空数组 */
export async function getRatingChanges(contestId: number): Promise<ApiRatingChange[]> {
  try {
    const result = await cfFetch<ApiRatingChange[]>('contest.ratingChanges', {
      contestId: String(contestId),
    });
    return result;
  } catch (e) {
    if (e instanceof EmptyResultError) return [];
    throw e;
  }
}

/** 获取比赛榜单行（仅需 handle/rank/points/penalty） */
export async function getStandings(contestId: number): Promise<StandingsRow[]> {
  interface RawRow {
    party: { members: { handle: string }[]; teamName?: string };
    rank: number;
    points: number;
    penalty: number;
  }
  interface StandingsResult {
    rows: RawRow[];
  }
  const result = await cfFetch<StandingsResult>('contest.standings', {
    contestId: String(contestId),
    showUnofficial: 'false',
  });
  const rows: StandingsRow[] = [];
  for (const row of result.rows) {
    // 跳过团队赛（多成员）
    if (row.party.members.length !== 1) continue;
    const handle = row.party.members[0]!.handle;
    rows.push({ handle, rank: row.rank, points: row.points, penalty: row.penalty });
  }
  return rows;
}

/** 分批获取用户 rating 信息（每批 ≤ 10000） */
export async function getUserInfos(handles: string[]): Promise<UserInfo[]> {
  const BATCH = 10000;
  const results: UserInfo[] = [];
  const toFetch: string[] = [];

  // 先查内存缓存
  for (const handle of handles) {
    const cacheKey = `userRating:${handle}`;
    const cached = await getCached<number | null>(cacheKey);
    if (cached !== undefined) {
      // exactOptionalPropertyTypes: 只在有值时包含 rating 属性
      const info: UserInfo = cached !== null ? { handle, rating: cached } : { handle };
      results.push(info);
    } else {
      toFetch.push(handle);
    }
  }

  // 分批请求未缓存的
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    interface RawUser {
      handle: string;
      rating?: number;
    }
    const batchResult = await cfFetch<RawUser[]>('user.info', {
      handles: batch.join(';'),
    });
    for (const u of batchResult) {
      const info: UserInfo = u.rating !== undefined ? { handle: u.handle, rating: u.rating } : { handle: u.handle };
      results.push(info);
      await setCached<number | null>(`userRating:${u.handle}`, u.rating ?? null, RATINGS_TTL_MS);
    }
  }

  return results;
}

/** 仅供测试：清空内存缓存 */
export function _clearMemCache(): void {
  memCache.clear();
}
