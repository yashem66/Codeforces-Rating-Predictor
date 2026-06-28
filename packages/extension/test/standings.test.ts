// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { parseContestId, findStandingsTables, extractHandle } from '../src/content/standings.js';

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
