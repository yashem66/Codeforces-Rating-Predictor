/**
 * standings.ts — 纯函数：解析 URL、定位表格、提取 handle
 */

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
