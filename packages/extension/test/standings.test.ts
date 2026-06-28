// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseContestId,
  findStandingsTables,
  extractHandle,
  isUnofficialRow,
  parseStandingsFromDOM,
} from '../src/content/standings.js';

describe('parseContestId', () => {
  it('extracts id from standard standings URL', () => {
    expect(parseContestId('https://codeforces.com/contest/1234/standings')).toBe(1234);
  });

  it('extracts id from URL with extra query params', () => {
    expect(parseContestId('https://codeforces.com/contest/567/standings?friend=true')).toBe(567);
  });

  it('returns null for non-standings URL', () => {
    expect(parseContestId('https://codeforces.com/contest/123/problem/A')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(parseContestId('https://codeforces.com/')).toBeNull();
  });
});

describe('findStandingsTables', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds table with class standings', () => {
    document.body.innerHTML = '<table class="standings"><tr><td>x</td></tr></table>';
    const tables = findStandingsTables(document);
    expect(tables).toHaveLength(1);
  });

  it('finds multiple standings tables', () => {
    document.body.innerHTML = `
      <table class="standings"></table>
      <table class="standings"></table>
    `;
    const tables = findStandingsTables(document);
    expect(tables).toHaveLength(2);
  });

  it('returns empty array when no standings tables', () => {
    document.body.innerHTML = '<table class="other"></table>';
    const tables = findStandingsTables(document);
    expect(tables).toHaveLength(0);
  });
});

describe('extractHandle', () => {
  it('extracts handle from profile link', () => {
    const row = document.createElement('tr');
    row.innerHTML = '<td><a href="/profile/tourist">tourist</a></td>';
    expect(extractHandle(row)).toBe('tourist');
  });

  it('handles handles with dots and underscores', () => {
    const row = document.createElement('tr');
    row.innerHTML = '<td><a href="/profile/A.K.E.E.">A.K.E.E.</a></td>';
    expect(extractHandle(row)).toBe('A.K.E.E.');
  });

  it('returns null when no profile link', () => {
    const row = document.createElement('tr');
    row.innerHTML = '<td>no link here</td>';
    expect(extractHandle(row)).toBeNull();
  });
});

describe('isUnofficialRow', () => {
  it('detects virtual-highlighted-row class', () => {
    const row = document.createElement('tr');
    row.className = 'virtual-highlighted-row';
    row.innerHTML = '<td>1</td><td class="contestant-cell"><a href="/profile/u">u</a></td>';
    expect(isUnofficialRow(row)).toBe(true);
  });

  it('detects * prefix in rank cell', () => {
    const row = document.createElement('tr');
    row.innerHTML = '<td>*42</td><td class="contestant-cell"><a href="/profile/u">u</a></td>';
    expect(isUnofficialRow(row)).toBe(true);
  });

  it('detects * before profile link in contestant cell (real CF finished contest)', () => {
    const row = document.createElement('tr');
    row.innerHTML =
      '<td></td><td class="contestant-cell">*<a href="/profile/virtual_user">virtual_user</a></td>';
    expect(isUnofficialRow(row)).toBe(true);
  });

  it('detects out of competition text in contestant cell', () => {
    const row = document.createElement('tr');
    row.innerHTML =
      '<td>6</td><td class="contestant-cell"><a href="/profile/ooc">ooc</a> out of competition</td>';
    expect(isUnofficialRow(row)).toBe(true);
  });

  it('returns false for official contestant row', () => {
    const row = document.createElement('tr');
    row.innerHTML = '<td>1</td><td class="contestant-cell"><a href="/profile/alice">alice</a></td>';
    expect(isUnofficialRow(row)).toBe(false);
  });
});

describe('parseStandingsFromDOM', () => {
  it('skips unofficial rows and keeps official contestants only', () => {
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr><th>#</th><th>Who</th></tr></thead>
      <tbody>
        <tr><td>1</td><td class="contestant-cell"><a href="/profile/alice">alice</a></td></tr>
        <tr><td>2</td><td class="contestant-cell"><a href="/profile/bob">bob</a></td></tr>
        <tr class="virtual-highlighted-row"><td>*3</td><td class="contestant-cell"><a href="/profile/virtual">virtual</a></td></tr>
        <tr><td></td><td class="contestant-cell">*<a href="/profile/mirror">mirror</a></td></tr>
        <tr><td>4</td><td class="contestant-cell"><a href="/profile/ooc">ooc</a> out of competition</td></tr>
      </tbody>
    `;
    const rows = parseStandingsFromDOM(table);
    expect(rows.map((r) => r.handle)).toEqual(['alice', 'bob']);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(2);
  });
});
