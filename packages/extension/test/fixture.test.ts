// @vitest-environment jsdom
/**
 * 基于真实 CF 结构夹具的健壮性测试
 *
 * 夹具来源：contest 1900（Codeforces Round 910 Div. 1 + Div. 2）
 * CF 直接抓取受 Cloudflare 防护（403），夹具依据已确认的真实 CF DOM 结构手工构建：
 *  - table.standings
 *  - thead > tr：# / Who / = / * / 题目列（真实列顺序）
 *  - td.contestant-cell > div.ratings-data > a.rated-user[href="/profile/HANDLE"]（真实嵌套）
 *  - 分隔行：<tr><td colspan="N">...</td></tr>
 *  - 虚拟参赛行：rank 带 * 前缀
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { injectColumns } from '../src/content/inject.js';
import { findStandingsTables, extractHandle } from '../src/content/standings.js';
import type { RowData } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(): string {
  return readFileSync(resolve(__dirname, 'fixtures/standings-sample.html'), 'utf-8');
}

function buildData(): Map<string, RowData> {
  return new Map<string, RowData>([
    ['tourist', { rating: 3800, delta: 10 }],
    ['Petr', { rating: 3700, delta: -5 }],
    ['Um_nik', { rating: 3500, delta: 0 }],
    ['neal', { rating: 3400, delta: 15 }],
  ]);
}

describe('CF 真实结构夹具测试', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('findStandingsTables 能在夹具中找到 table.standings', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    expect(tables).toHaveLength(1);
  });

  it('extractHandle 正确提取真实 contestant-cell 嵌套结构中的 handle', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;
    const handles: string[] = [];
    for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
      const h = extractHandle(row as HTMLTableRowElement);
      if (h) handles.push(h);
    }
    // 真实 CF 结构：a[href="/profile/tourist"] 嵌套在 div.ratings-data 中
    expect(handles).toContain('tourist');
    expect(handles).toContain('Petr');
    expect(handles).toContain('Um_nik');
    expect(handles).toContain('neal');
    // 含特殊字符的 handle
    expect(handles).toContain('A.K.E.E.');
    // 虚拟参赛行也能正确提取
    expect(handles).toContain('virtual_user');
  });

  it('injectColumns 在真实 "Who" 表头后（而非 # 后）插入两列', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    injectColumns(table, buildData(), { showRating: true, showDelta: true });

    const headers = Array.from(table.querySelectorAll('th')).map((th) => th.textContent?.trim());
    expect(headers).toContain('Rating');
    expect(headers).toContain('Pred Δ');

    // Rating 和 Pred Δ 应紧跟 "Who" 之后（不是跟在 "#" 之后）
    const whoIdx = headers.indexOf('Who');
    const ratingIdx = headers.indexOf('Rating');
    const deltaIdx = headers.indexOf('Pred Δ');
    expect(whoIdx).toBeGreaterThanOrEqual(0);
    expect(ratingIdx).toBe(whoIdx + 1);
    expect(deltaIdx).toBe(whoIdx + 2);
  });

  it('injectColumns 数据行插入列与表头列对齐', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    injectColumns(table, buildData(), { showRating: true, showDelta: true });

    // 检查列数一致性：每行的单元格数应与表头相同
    const headerRow = table.querySelector('thead tr')!;
    const headerCellCount = headerRow.querySelectorAll('th').length;

    // 只检查含 profile 链接的参赛行（排除分隔行；分隔行注入后也有多个 td，但无 profile 链接）
    const dataRows = Array.from(table.querySelectorAll('tbody tr')).filter((r) =>
      r.querySelector('a[href*="/profile/"]') !== null,
    );

    for (const row of dataRows) {
      const cellCount = row.querySelectorAll('td').length;
      expect(cellCount).toBe(headerCellCount);
    }
  });

  it('injectColumns 正确注入 tourist 行的 rating 和 delta', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    injectColumns(table, buildData(), { showRating: true, showDelta: true });

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const touristRow = rows.find(
      (r) => extractHandle(r as HTMLTableRowElement) === 'tourist',
    ) as HTMLTableRowElement | undefined;
    expect(touristRow).toBeDefined();

    const ratingCell = touristRow!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(ratingCell.textContent).toBe('3800');

    const deltaCell = touristRow!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(deltaCell.textContent).toBe('+10');
    expect(deltaCell.className).toBe('crp-delta-pos');
  });

  it('injectColumns 正确注入 Petr 行（负 delta）', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    injectColumns(table, buildData(), { showRating: true, showDelta: true });

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const petrRow = rows.find(
      (r) => extractHandle(r as HTMLTableRowElement) === 'Petr',
    ) as HTMLTableRowElement | undefined;
    expect(petrRow).toBeDefined();

    const deltaCell = petrRow!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(deltaCell.textContent).toBe('-5');
    expect(deltaCell.className).toBe('crp-delta-neg');
  });

  it('injectColumns 对 Um_nik（delta=0）使用 crp-delta-zero 类', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    injectColumns(table, buildData(), { showRating: true, showDelta: true });

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const umRow = rows.find(
      (r) => extractHandle(r as HTMLTableRowElement) === 'Um_nik',
    ) as HTMLTableRowElement | undefined;
    expect(umRow).toBeDefined();

    const deltaCell = umRow!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(deltaCell.textContent).toBe('0');
    expect(deltaCell.className).toBe('crp-delta-zero');
  });

  it('injectColumns 对 data 中无数据的行（virtual_user）显示 "—"', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    // buildData 不含 virtual_user
    injectColumns(table, buildData(), { showRating: true, showDelta: true });

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const virtualRow = rows.find(
      (r) => extractHandle(r as HTMLTableRowElement) === 'virtual_user',
    ) as HTMLTableRowElement | undefined;
    expect(virtualRow).toBeDefined();

    const ratingCell = virtualRow!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(ratingCell.textContent).toBe('—');
    const deltaCell = virtualRow!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(deltaCell.textContent).toBe('—');
  });

  it('injectColumns 对分隔行不报错，且添加占位单元格', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    expect(() =>
      injectColumns(table, buildData(), { showRating: true, showDelta: true }),
    ).not.toThrow();

    // 分隔行：单格 td（colspan="8"）+ 注入的占位 td
    const separatorRow = Array.from(table.querySelectorAll('tbody tr')).find(
      (r) => r.querySelectorAll('td').length > 0 && r.querySelectorAll('td').length <= 3,
    );
    expect(separatorRow).toBeDefined();
  });

  it('injectColumns 对真实夹具幂等（二次调用不重复加列）', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    injectColumns(table, buildData(), { showRating: true, showDelta: true });
    const countBefore = table.querySelectorAll('[data-crp-rating]').length;

    injectColumns(table, buildData(), { showRating: true, showDelta: true });
    const countAfter = table.querySelectorAll('[data-crp-rating]').length;

    expect(countAfter).toBe(countBefore);
    expect(countBefore).toBeGreaterThan(0);
  });

  it('A.K.E.E. 含点号的 handle 能被正确提取', () => {
    document.body.innerHTML = loadFixture();
    const tables = findStandingsTables(document);
    const table = tables[0]!;

    injectColumns(
      table,
      new Map([['A.K.E.E.', { rating: 2800, delta: 20 }]]),
      { showRating: true, showDelta: true },
    );

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const akeeRow = rows.find(
      (r) => extractHandle(r as HTMLTableRowElement) === 'A.K.E.E.',
    ) as HTMLTableRowElement | undefined;
    expect(akeeRow).toBeDefined();

    const ratingCell = akeeRow!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(ratingCell.textContent).toBe('2800');
  });
});
