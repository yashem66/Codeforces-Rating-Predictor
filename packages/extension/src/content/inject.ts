import type { RowData } from '../types.js';

const INJECTED_ATTR = 'data-crp-injected';
const RATING_ATTR = 'data-crp-rating';
const DELTA_ATTR = 'data-crp-delta';

/** 从表格行中提取选手 handle（通过 profile 链接） */
function extractHandleFromRow(row: HTMLTableRowElement): string | null {
  const link = row.querySelector('a[href*="/profile/"]') as HTMLAnchorElement | null;
  if (!link) return null;
  const href = link.getAttribute('href') ?? '';
  const match = href.match(/\/profile\/([^/?#]+)/);
  return match ? match[1] ?? null : null;
}

/** 判断是否是表头行 */
function isHeaderRow(row: HTMLTableRowElement): boolean {
  return row.querySelectorAll('th').length > 0;
}

/** 判断是否是分隔行（CF 里通常是含"…"或 colspan 的行） */
function isSeparatorRow(row: HTMLTableRowElement): boolean {
  const cells = Array.from(row.querySelectorAll('td'));
  if (cells.length === 0) return false;
  // 单个大 colspan 或文字为 "…"
  if (cells.length === 1) return true;
  const text = row.textContent?.trim() ?? '';
  return text === '…' || text === '...' || text === '';
}

/** 格式化 delta 文字（+12 / -8 / 0） */
function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

/** 给 delta td 添加颜色 class */
function colorClass(delta: number): string {
  if (delta > 0) return 'crp-delta-pos';
  if (delta < 0) return 'crp-delta-neg';
  return 'crp-delta-zero';
}

/**
 * 幂等地向 standings 表格注入 Rating + Pred Δ 两列。
 * @param table 目标表格
 * @param data  handle → { rating?, delta? }
 * @param opts  { showRating, showDelta }
 */
export function injectColumns(
  table: HTMLTableElement,
  data: Map<string, RowData>,
  opts: { showRating: boolean; showDelta: boolean },
): void {
  if (!opts.showRating && !opts.showDelta) return;
  // 已注入且选项未变 → 幂等退出
  if (table.getAttribute(INJECTED_ATTR) === `${opts.showRating}:${opts.showDelta}`) return;
  // 若已有注入但 opts 变化，先清除旧注入
  if (table.hasAttribute(INJECTED_ATTR)) {
    for (const el of Array.from(table.querySelectorAll(`[${RATING_ATTR}],[${DELTA_ATTR}]`))) {
      el.remove();
    }
  }

  const rows = Array.from(table.rows);

  for (const row of rows) {
    if (isHeaderRow(row)) {
      // 插入表头 th（找"选手名"列后，这里简单插在第 2 列之后）
      const cells = Array.from(row.cells);
      // 找 th 中包含 "=" 或 "Who"/"Handle" 字样的列，若无则插在末尾
      let insertAfterIdx = cells.length - 1;
      for (let i = 0; i < cells.length; i++) {
        const text = (cells[i] as HTMLTableCellElement).textContent?.trim().toLowerCase() ?? '';
        if (text === '=' || text === 'who' || text === 'handle' || text === '#') {
          insertAfterIdx = i;
          break;
        }
      }
      const refCell = cells[insertAfterIdx] as HTMLTableCellElement;

      if (opts.showRating) {
        const th = document.createElement('th');
        th.textContent = 'Rating';
        th.setAttribute(RATING_ATTR, '1');
        refCell.insertAdjacentElement('afterend', th);
      }
      if (opts.showDelta) {
        const th = document.createElement('th');
        th.textContent = 'Pred Δ';
        th.setAttribute(DELTA_ATTR, '1');
        // 如果我们刚插了 Rating，delta 列应在 rating 后面
        const ratingTh = row.querySelector(`th[${RATING_ATTR}]`);
        if (ratingTh) {
          ratingTh.insertAdjacentElement('afterend', th);
        } else {
          refCell.insertAdjacentElement('afterend', th);
        }
      }
      continue;
    }

    if (isSeparatorRow(row)) {
      // 分隔行：各列加空 td 占位（保持列对齐）
      if (opts.showRating) {
        const td = document.createElement('td');
        td.setAttribute(RATING_ATTR, '1');
        row.appendChild(td);
      }
      if (opts.showDelta) {
        const td = document.createElement('td');
        td.setAttribute(DELTA_ATTR, '1');
        row.appendChild(td);
      }
      continue;
    }

    const handle = extractHandleFromRow(row);
    const rowData = handle ? data.get(handle) : undefined;

    if (opts.showRating) {
      const td = document.createElement('td');
      td.setAttribute(RATING_ATTR, '1');
      td.textContent =
        rowData?.rating !== undefined ? String(rowData.rating) : '—';
      row.appendChild(td);
    }

    if (opts.showDelta) {
      const td = document.createElement('td');
      td.setAttribute(DELTA_ATTR, '1');
      if (rowData?.delta !== undefined) {
        td.textContent = formatDelta(rowData.delta);
        td.className = colorClass(rowData.delta);
      } else {
        td.textContent = '—';
      }
      row.appendChild(td);
    }
  }

  table.setAttribute(INJECTED_ATTR, `${opts.showRating}:${opts.showDelta}`);
}
