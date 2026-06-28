/**
 * standings.ts — 纯函数：解析 URL、定位表格、提取 handle
 */

import type { StandingsRow } from '../types.js';

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

/** 直接从页面 DOM 解析榜单（用于比赛进行中 API 不可访问时的降级） */
export function parseStandingsFromDOM(table: HTMLTableElement): StandingsRow[] {
  const rows: StandingsRow[] = [];
  let autoRank = 1;
  for (const row of Array.from(table.rows)) {
    // 跳过表头行（含 <th>）
    if (row.querySelectorAll('th').length > 0) continue;
    const handle = extractHandle(row);
    if (!handle) continue;
    const rank = extractRank(row) ?? autoRank;
    rows.push({ handle, rank, points: 0, penalty: 0 });
    autoRank = rank + 1;
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
