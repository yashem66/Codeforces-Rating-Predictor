// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { injectColumns } from '../src/content/inject.js';
import type { RowData } from '../src/types.js';

/** 构造一个简单的 standings 表格 */
function buildTable(): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'standings';
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>=</th>
        <th>Score</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td><a href="/profile/alice">alice</a></td>
        <td>300</td>
      </tr>
      <tr>
        <td>2</td>
        <td><a href="/profile/bob">bob</a></td>
        <td>200</td>
      </tr>
      <tr>
        <td>3</td>
        <td><a href="/profile/charlie">charlie</a></td>
        <td>100</td>
      </tr>
      <tr>
        <td colspan="3">…</td>
      </tr>
      <tr>
        <td>4</td>
        <td>no-handle-row</td>
        <td>0</td>
      </tr>
    </tbody>
  `;
  return table;
}

function buildData(): Map<string, RowData> {
  return new Map<string, RowData>([
    ['alice', { rating: 1800, delta: 25 }],
    ['bob', { rating: 1500, delta: -10 }],
    ['charlie', { rating: 1200, delta: 0 }],
  ]);
}

describe('injectColumns', () => {
  let table: HTMLTableElement;
  let data: Map<string, RowData>;

  beforeEach(() => {
    table = buildTable();
    data = buildData();
    document.body.appendChild(table);
  });

  it('injects Rating and Pred Δ headers', () => {
    injectColumns(table, data, { showRating: true, showDelta: true });
    const headers = Array.from(table.querySelectorAll('th')).map((th) => th.textContent?.trim());
    expect(headers).toContain('Rating');
    expect(headers).toContain('Pred Δ');
  });

  it('injects correct rating values', () => {
    injectColumns(table, data, { showRating: true, showDelta: false });
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    // alice row
    const aliceTds = Array.from(rows[0]!.querySelectorAll('[data-crp-rating]'));
    expect(aliceTds[0]!.textContent).toBe('1800');
    // bob row
    const bobTds = Array.from(rows[1]!.querySelectorAll('[data-crp-rating]'));
    expect(bobTds[0]!.textContent).toBe('1500');
  });

  it('injects delta with correct text and color class', () => {
    injectColumns(table, data, { showRating: false, showDelta: true });
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    // alice: +25, green
    const aliceDelta = rows[0]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(aliceDelta.textContent).toBe('+25');
    expect(aliceDelta.className).toBe('crp-delta-pos');
    // bob: -10, red
    const bobDelta = rows[1]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(bobDelta.textContent).toBe('-10');
    expect(bobDelta.className).toBe('crp-delta-neg');
    // charlie: 0, gray
    const charlieDelta = rows[2]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(charlieDelta.textContent).toBe('0');
    expect(charlieDelta.className).toBe('crp-delta-zero');
  });

  it('fills "—" for rows with no matching data', () => {
    injectColumns(table, data, { showRating: true, showDelta: true });
    // 最后一行没有 handle，应该填 "—"
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const noHandleRow = rows[rows.length - 1]!;
    const ratingTd = noHandleRow.querySelector('[data-crp-rating]') as HTMLElement;
    expect(ratingTd.textContent).toBe('—');
  });

  it('is idempotent: calling twice does not duplicate columns', () => {
    injectColumns(table, data, { showRating: true, showDelta: true });
    const countBefore = table.querySelectorAll('[data-crp-rating]').length;
    injectColumns(table, data, { showRating: true, showDelta: true });
    const countAfter = table.querySelectorAll('[data-crp-rating]').length;
    expect(countAfter).toBe(countBefore);
  });

  it('injects only rating column when showDelta=false', () => {
    injectColumns(table, data, { showRating: true, showDelta: false });
    expect(table.querySelector('[data-crp-rating]')).not.toBeNull();
    expect(table.querySelector('[data-crp-delta]')).toBeNull();
  });

  it('does not inject when both opts are false', () => {
    injectColumns(table, data, { showRating: false, showDelta: false });
    expect(table.querySelector('[data-crp-rating]')).toBeNull();
    expect(table.querySelector('[data-crp-delta]')).toBeNull();
  });
});
