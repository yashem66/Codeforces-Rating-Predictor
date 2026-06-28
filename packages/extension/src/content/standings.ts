/**
 * standings.ts — 纯函数：解析 URL、定位表格、提取 handle
 */

import type { StandingsRow } from '../types.js';

/** DOM 分页抓取上限（约 800 页 × 20 人/页） */
export const DOM_STANDINGS_MAX_PAGES = 800;

/** 自适应并发：起始 / 下限 / 上限（遇 503 自动降速，稳定后回升） */
export const DOM_STANDINGS_INITIAL_CONCURRENCY = 12;
export const DOM_STANDINGS_MIN_CONCURRENCY = 6;
export const DOM_STANDINGS_MAX_CONCURRENCY = 14;

/** 固定并发（仅测试注入 options.concurrency 时使用） */
export const DOM_STANDINGS_FETCH_CONCURRENCY = DOM_STANDINGS_INITIAL_CONCURRENCY;

/** 失败页二次重试时的并发范围 */
export const DOM_STANDINGS_RETRY_INITIAL_CONCURRENCY = 4;
export const DOM_STANDINGS_RETRY_MAX_CONCURRENCY = 6;

const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504]);
const FETCH_MAX_RETRIES = 4;
const FETCH_BASE_DELAY_MS = 400;
const RATE_LIMIT_PAUSE_MS = 1000;
const SUCCESS_STREAK_TO_INCREASE = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 503 时限速、成功时逐步恢复并发，避免固定低并发过慢或固定高并发被 CF 封 */
export class AdaptiveFetchThrottle {
  private limit: number;
  private inFlight = 0;
  private pauseUntil = 0;
  private successStreak = 0;

  constructor(
    initial: number,
    private readonly minLimit: number,
    readonly maxLimit: number,
  ) {
    this.limit = initial;
  }

  get currentLimit(): number {
    return this.limit;
  }

  async acquireSlot(): Promise<void> {
    while (true) {
      const now = Date.now();
      if (now < this.pauseUntil) {
        await sleep(this.pauseUntil - now);
        continue;
      }
      if (this.inFlight < this.limit) {
        this.inFlight++;
        return;
      }
      await sleep(20);
    }
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  onRateLimited(): void {
    this.successStreak = 0;
    this.limit = Math.max(this.minLimit, this.limit - 2);
    this.pauseUntil = Math.max(this.pauseUntil, Date.now() + RATE_LIMIT_PAUSE_MS);
  }

  onSuccess(): void {
    this.successStreak++;
    if (this.successStreak >= SUCCESS_STREAK_TO_INCREASE && this.limit < this.maxLimit) {
      this.limit++;
      this.successStreak = 0;
    }
  }
}

export type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ScrapeStandingsOptions {
  fetchImpl?: FetchImpl;
  /** 指定后禁用自适应节流，用于测试 */
  concurrency?: number;
  maxPages?: number;
  /** 每页解析完成后回调，用于并行预取 user.info */
  onPageRows?: (rows: StandingsRow[]) => void;
}

/** 限制并发数执行任务，保持结果与 items 顺序一致 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function parseStandingsPageHtml(html: string): StandingsRow[] {
  const pageDom = new DOMParser().parseFromString(html, 'text/html');
  const tables = findStandingsTables(pageDom);
  return tables.length > 0 ? parseStandingsFromDOM(tables[0]!) : [];
}

async function fetchStandingsPageRows(
  contestId: number,
  page: number,
  fetchImpl: FetchImpl,
  throttle?: AdaptiveFetchThrottle,
): Promise<StandingsRow[]> {
  for (let attempt = 0; attempt <= FETCH_MAX_RETRIES; attempt++) {
    if (throttle) {
      await throttle.acquireSlot();
    }
    try {
      const res = await fetchImpl(`/contest/${contestId}/standings/page/${page}`, {
        credentials: 'include',
      });
      if (res.ok) {
        throttle?.onSuccess();
        const html = await res.text();
        return parseStandingsPageHtml(html);
      }
      if (RETRYABLE_HTTP_STATUS.has(res.status)) {
        throttle?.onRateLimited();
      }
      if (!RETRYABLE_HTTP_STATUS.has(res.status) || attempt === FETCH_MAX_RETRIES) {
        console.warn(`[CRP] standings page ${page}: HTTP ${res.status}`);
        return [];
      }
    } catch (err) {
      if (attempt === FETCH_MAX_RETRIES) {
        console.warn(`[CRP] standings page ${page}: fetch error`, err);
        return [];
      }
    } finally {
      throttle?.release();
    }
    const delay = FETCH_BASE_DELAY_MS * 2 ** attempt + Math.random() * 200;
    await sleep(delay);
  }
  return [];
}

function mergeStandingsPages(
  rowsByPage: Map<number, StandingsRow[]>,
  totalPages: number,
): StandingsRow[] {
  const merged: StandingsRow[] = [];
  for (let page = 1; page <= totalPages; page++) {
    const pageRows = rowsByPage.get(page);
    if (pageRows !== undefined) {
      merged.push(...pageRows);
    }
  }
  return merged;
}

async function fetchStandingsPages(
  contestId: number,
  pageNumbers: number[],
  fetchImpl: FetchImpl,
  workerCount: number,
  throttle: AdaptiveFetchThrottle | undefined,
  onPageRows: ((rows: StandingsRow[]) => void) | undefined,
  progressLabel: string,
): Promise<{ page: number; rows: StandingsRow[] }[]> {
  let completed = 0;
  return mapWithConcurrency(pageNumbers, workerCount, async (page) => {
    const pageRows = await fetchStandingsPageRows(contestId, page, fetchImpl, throttle);
    completed++;
    if (completed % 50 === 0 || completed === pageNumbers.length) {
      const limitHint = throttle ? `, concurrency≈${throttle.currentLimit}` : '';
      console.log(`[CRP] ${progressLabel}: ${completed}/${pageNumbers.length}${limitHint}`);
    }
    if (pageRows.length > 0) {
      onPageRows?.(pageRows);
    }
    return { page, rows: pageRows };
  });
}

/** 从当前页 DOM + 分页 HTML 解析完整官方榜单 */
export async function scrapeStandingsFromDOM(
  contestId: number,
  doc: Document,
  options: ScrapeStandingsOptions = {},
): Promise<StandingsRow[] | null> {
  const tables = findStandingsTables(doc);
  if (tables.length === 0) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? DOM_STANDINGS_MAX_PAGES;
  const fixedConcurrency = options.concurrency;
  const throttle =
    fixedConcurrency === undefined
      ? new AdaptiveFetchThrottle(
          DOM_STANDINGS_INITIAL_CONCURRENCY,
          DOM_STANDINGS_MIN_CONCURRENCY,
          DOM_STANDINGS_MAX_CONCURRENCY,
        )
      : undefined;
  const workerCount = fixedConcurrency ?? DOM_STANDINGS_MAX_CONCURRENCY;

  const rows = parseStandingsFromDOM(tables[0]!);
  const rowsByPage = new Map<number, StandingsRow[]>();
  rowsByPage.set(1, rows);
  options.onPageRows?.(rows);

  const totalPages = Math.min(extractTotalPages(doc), maxPages);
  if (totalPages <= 1) {
    return rows;
  }

  const modeLabel =
    fixedConcurrency === undefined
      ? `adaptive ${DOM_STANDINGS_INITIAL_CONCURRENCY}-${DOM_STANDINGS_MAX_CONCURRENCY}`
      : String(fixedConcurrency);
  console.log(`[CRP] Fetching ${totalPages - 1} more standings pages (${modeLabel})…`);

  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const pageResults = await fetchStandingsPages(
    contestId,
    pageNumbers,
    fetchImpl,
    workerCount,
    throttle,
    options.onPageRows,
    'standings pages',
  );

  for (const { page, rows: pageRows } of pageResults) {
    if (pageRows.length > 0) {
      rowsByPage.set(page, pageRows);
    }
  }

  const failedPages = pageResults.filter(({ rows: pageRows }) => pageRows.length === 0).map(({ page }) => page);
  if (failedPages.length > 0) {
    console.warn(`[CRP] ${failedPages.length} standings pages failed, retrying…`);
    await sleep(400);
    const retryThrottle = new AdaptiveFetchThrottle(
      DOM_STANDINGS_RETRY_INITIAL_CONCURRENCY,
      2,
      DOM_STANDINGS_RETRY_MAX_CONCURRENCY,
    );
    const retryResults = await fetchStandingsPages(
      contestId,
      failedPages,
      fetchImpl,
      DOM_STANDINGS_RETRY_MAX_CONCURRENCY,
      retryThrottle,
      options.onPageRows,
      'standings retry',
    );
    for (const { page, rows: pageRows } of retryResults) {
      if (pageRows.length > 0) {
        rowsByPage.set(page, pageRows);
      }
    }
    const stillFailed = retryResults.filter(({ rows: pageRows }) => pageRows.length === 0).length;
    if (stillFailed > 0) {
      console.warn(`[CRP] ${stillFailed} standings pages still failed after retry`);
    }
  }

  const merged = mergeStandingsPages(rowsByPage, totalPages);
  console.log('[CRP] DOM standings rows =', merged.length);
  return merged;
}

/** 从 URL 中解析 contestId（/contest/{id}/standings） */
export function parseContestId(url: string): number | null {
  const match = url.match(/\/contest\/(\d+)\/standings/);
  if (!match) return null;
  const id = parseInt(match[1]!, 10);
  return isNaN(id) ? null : id;
}

/** 在文档中查找所有 standings 表格 */
export function findStandingsTables(doc: Document = document): HTMLTableElement[] {
  return Array.from(doc.querySelectorAll('table.standings')) as HTMLTableElement[];
}

/** 从表格数据行中提取 handle */
export function extractHandle(row: HTMLTableRowElement): string | null {
  const link = row.querySelector('a[href*="/profile/"]') as HTMLAnchorElement | null;
  if (!link) return null;
  const href = link.getAttribute('href') ?? '';
  const match = href.match(/\/profile\/([^/?#]+)/);
  return match ? match[1] ?? null : null;
}

/** 从表格数据行中提取排名（第一列数字）*/
export function extractRank(row: HTMLTableRowElement): number | null {
  const cell = row.cells[0];
  if (!cell) return null;
  const text = cell.textContent?.trim() ?? '';
  const n = parseInt(text, 10);
  return isNaN(n) ? null : n;
}

/**
 * 判断表格行是否为 unofficial 选手（virtual / out of competition）。
 * 与 API `showUnofficial=false` 语义对齐，避免 DOM 降级时污染 rating 预测。
 */
export function isUnofficialRow(row: HTMLTableRowElement): boolean {
  if (row.classList.contains('virtual-highlighted-row')) return true;

  const rankText = row.cells[0]?.textContent?.trim() ?? '';
  if (rankText.startsWith('*')) return true;

  const contestantCell = row.querySelector('.contestant-cell') ?? row.cells[1];
  if (contestantCell) {
    const html = contestantCell.innerHTML;
    const text = contestantCell.textContent ?? '';
    // 已结束赛 virtual：Who 列 profile 链接前有 *（rank 列为空）
    if (/\*\s*<a\s+[^>]*href="\/profile\//i.test(html)) return true;
    if (/out of competition/i.test(text)) return true;
  }

  return false;
}

/** 直接从页面 DOM 解析榜单（用于比赛进行中 API 不可访问时的降级） */
export function parseStandingsFromDOM(table: HTMLTableElement): StandingsRow[] {
  const rows: StandingsRow[] = [];
  for (const row of Array.from(table.rows)) {
    // 跳过表头行（含 <th>）
    if (row.querySelectorAll('th').length > 0) continue;
    if (isUnofficialRow(row)) continue;
    const handle = extractHandle(row);
    if (!handle) continue;
    const rank = extractRank(row);
    // 官方选手 rank 列必有数字；无 rank 的行跳过（避免误用 autoRank 污染预测）
    if (rank === null) continue;
    rows.push({ handle, rank, points: 0, penalty: 0 });
  }
  return rows;
}

/**
 * 从文档的分页导航中提取总页数。
 * CF 分页链接形如 href="/contest/123/standings/page/5"。
 */
export function extractTotalPages(doc: Document): number {
  let maxPage = 1;
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = (a as HTMLAnchorElement).getAttribute('href') ?? '';
    const m = href.match(/\/standings\/(?:.*\/)?page\/(\d+)/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (!isNaN(n) && n > maxPage) maxPage = n;
    }
  }
  return maxPage;
}
