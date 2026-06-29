import { extractHandle, isUnofficialRow } from './standings.js';
import type { RowData } from '../types.js';

const INJECTED_ATTR = 'data-crp-injected';
const RATING_ATTR = 'data-crp-rating';
const DELTA_ATTR = 'data-crp-delta';
const STYLE_ID = 'crp-injected-style';
const EMPTY_CELL_TEXT = '\u2014';

/** 返回 CF 段位对应的十六进制颜色字符串（小写） */
export function ratingColor(rating: number): string {
  if (rating < 1200) return '#808080';
  if (rating < 1400) return '#008000';
  if (rating < 1600) return '#03a89e';
  if (rating < 1900) return '#0000ff';
  if (rating < 2100) return '#aa00aa';
  if (rating < 2400) return '#ff8c00';
  return '#ff0000';
}

/** 幂等地向 document.head 注入一次性列宽 + 涨跌色样式 */
function ensureStyleInjected(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.standings th[data-crp-rating], .standings td[data-crp-rating],
.standings th[data-crp-delta], .standings td[data-crp-delta] {
  width: 4em;
  text-align: center;
  white-space: nowrap;
}
.standings td[data-crp-rating], .standings td[data-crp-delta] {
  font-weight: bold;
}
.standings td.crp-delta-pos { color: #008000; }
.standings td.crp-delta-neg { color: #ff0000; }
.standings td.crp-delta-zero { color: #808080; }
`;
  doc.head.appendChild(style);
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
 * 找出 standings 表格中「选手列」的索引。
 * 优先在表头中匹配 "who"/"участник"/"handle"/"="；
 * 若表头无法识别，则在第一个数据行中找含 profile 链接的单元格；
 * 默认返回 1（CF 典型布局：# 在 0，选手名在 1）。
 */
function findContestantColIndex(table: HTMLTableElement): number {
  // 1. 表头行：按文字匹配选手列（避免误匹配 "#" 导致插入到排名列后）
  for (const row of Array.from(table.rows)) {
    if (!isHeaderRow(row)) continue;
    const cells = Array.from(row.cells);
    for (let i = 0; i < cells.length; i++) {
      const text = cells[i]!.textContent?.trim().toLowerCase() ?? '';
      if (text === 'who' || text === 'участник' || text === 'handle' || text === '=') {
        return i;
      }
    }
    break; // 只检查第一个表头行
  }

  // 2. 第一个数据行：找含 profile 链接的单元格
  for (const row of Array.from(table.rows)) {
    if (isHeaderRow(row) || isSeparatorRow(row)) continue;
    const cells = Array.from(row.cells);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]!.querySelector('a[href*="/profile/"]')) {
        return i;
      }
    }
    break; // 只检查第一个数据行
  }

  return 1; // 默认值：第二列
}

/**
 * 幂等地向 standings 表格注入 Rating + Pred Δ 两列。
 * 两列均插入在选手列（"Who" / "=" / contestant-cell）之后，
 * 保证表头与数据行列对齐。
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

  // 注入列宽 + 涨跌色样式（幂等）
  ensureStyleInjected(table.ownerDocument);

  // 已注入且选项未变 → 幂等退出
  if (table.getAttribute(INJECTED_ATTR) === `${opts.showRating}:${opts.showDelta}`) return;
  // 若已有注入但 opts 变化，先清除旧注入
  if (table.hasAttribute(INJECTED_ATTR)) {
    for (const el of Array.from(table.querySelectorAll(`[${RATING_ATTR}],[${DELTA_ATTR}]`))) {
      el.remove();
    }
  }

  const contestantColIdx = findContestantColIndex(table);
  const rows = Array.from(table.rows);

  for (const row of rows) {
    if (isHeaderRow(row)) {
      const cells = Array.from(row.cells);
      const refCell = cells[Math.min(contestantColIdx, cells.length - 1)] as HTMLTableCellElement;

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
      const cells = Array.from(row.cells);
      const refCell = cells[Math.min(contestantColIdx, cells.length - 1)] as HTMLTableCellElement;

      if (opts.showRating) {
        const td = document.createElement('td');
        td.setAttribute(RATING_ATTR, '1');
        refCell.insertAdjacentElement('afterend', td);
      }
      if (opts.showDelta) {
        const td = document.createElement('td');
        td.setAttribute(DELTA_ATTR, '1');
        const ratingTd = row.querySelector(`td[${RATING_ATTR}]`);
        if (ratingTd) {
          ratingTd.insertAdjacentElement('afterend', td);
        } else {
          refCell.insertAdjacentElement('afterend', td);
        }
      }
      continue;
    }

    // 数据行：插入在选手列之后（与表头列对齐）
    const handle = extractHandle(row);
    const rowData = !isUnofficialRow(row) && handle ? data.get(handle) : undefined;
    const cells = Array.from(row.cells);
    const refCell = cells[Math.min(contestantColIdx, cells.length - 1)] as HTMLTableCellElement;

    if (opts.showRating) {
      const td = document.createElement('td');
      td.setAttribute(RATING_ATTR, '1');
      td.textContent =
        rowData?.rating !== undefined ? String(rowData.rating) : EMPTY_CELL_TEXT;
      if (rowData?.rating !== undefined) {
        td.style.color = ratingColor(rowData.rating);
      }
      refCell.insertAdjacentElement('afterend', td);
    }

    if (opts.showDelta) {
      const td = document.createElement('td');
      td.setAttribute(DELTA_ATTR, '1');
      if (rowData?.delta !== undefined) {
        td.textContent = formatDelta(rowData.delta);
        td.className = colorClass(rowData.delta);
      } else {
        td.textContent = EMPTY_CELL_TEXT;
      }
      const ratingTd = row.querySelector(`td[${RATING_ATTR}]`);
      if (ratingTd) {
        ratingTd.insertAdjacentElement('afterend', td);
      } else {
        refCell.insertAdjacentElement('afterend', td);
      }
    }
  }

  table.setAttribute(INJECTED_ATTR, `${opts.showRating}:${opts.showDelta}`);
}
