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
