// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseContestId,
  findStandingsTables,
  extractHandle,
  isUnofficialRow,
  parseStandingsFromDOM,
  mapWithConcurrency,
  scrapeStandingsFromDOM,
  AdaptiveFetchThrottle,
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

describe('mapWithConcurrency', () => {
  it('limits in-flight tasks to the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 25 }, (_, i) => i);
    await mapWithConcurrency(items, 5, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('preserves result order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('AdaptiveFetchThrottle', () => {
  it('reduces concurrency and pauses after rate limit, then recovers on success streak', async () => {
    vi.useFakeTimers();
    const throttle = new AdaptiveFetchThrottle(12, 6, 14);

    throttle.onRateLimited();
    expect(throttle.currentLimit).toBe(10);

    let acquired = false;
    const acquirePromise = throttle.acquireSlot().then(() => {
      acquired = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(acquired).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    await acquirePromise;
    expect(acquired).toBe(true);

    throttle.release();
    for (let i = 0; i < 25; i++) {
      throttle.onSuccess();
    }
    expect(throttle.currentLimit).toBe(11);

    vi.useRealTimers();
  });
});

function buildStandingsPageHtml(entries: { handle: string; rank: number }[]): string {
  const rows = entries
    .map(
      (e) =>
        `<tr><td>${e.rank}</td><td class="contestant-cell"><a href="/profile/${e.handle}">${e.handle}</a></td></tr>`,
    )
    .join('');
  return `<html><body><table class="standings"><tbody>${rows}</tbody></table></body></html>`;
}

function fetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('scrapeStandingsFromDOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when no standings table on page', async () => {
    document.body.innerHTML = '<div>no table</div>';
    const rows = await scrapeStandingsFromDOM(1, document, { fetchImpl: vi.fn() });
    expect(rows).toBeNull();
  });

  it('fetches remaining pages with bounded concurrency and merges in page order', async () => {
    document.body.innerHTML = `
      <table class="standings">
        <tbody>
          <tr><td>1</td><td class="contestant-cell"><a href="/profile/alice">alice</a></td></tr>
        </tbody>
      </table>
      <a href="/contest/99/standings/page/2">2</a>
      <a href="/contest/99/standings/page/3">3</a>
    `;

    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      const pageMatch = url.match(/page\/(\d+)/);
      const page = pageMatch ? parseInt(pageMatch[1]!, 10) : 0;
      const html =
        page === 2
          ? buildStandingsPageHtml([{ handle: 'bob', rank: 2 }])
          : buildStandingsPageHtml([{ handle: 'carol', rank: 3 }]);
      return { ok: true, text: async () => html } as Response;
    });

    const onPageRows = vi.fn();
    const rows = await scrapeStandingsFromDOM(99, document, {
      fetchImpl,
      concurrency: 2,
      onPageRows,
    });

    expect(rows!.map((r) => r.handle)).toEqual(['alice', 'bob', 'carol']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(onPageRows).toHaveBeenCalled();
  });

  it('retries on HTTP 503 and still merges rows in page order', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <table class="standings">
        <tbody>
          <tr><td>1</td><td class="contestant-cell"><a href="/profile/alice">alice</a></td></tr>
        </tbody>
      </table>
      <a href="/contest/99/standings/page/2">2</a>
    `;

    let page2Attempts = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes('/page/2')) {
        page2Attempts++;
        if (page2Attempts < 2) {
          return { ok: false, status: 503, text: async () => '' } as Response;
        }
        return {
          ok: true,
          text: async () => buildStandingsPageHtml([{ handle: 'bob', rank: 2 }]),
        } as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as Response;
    });

    const scrapePromise = scrapeStandingsFromDOM(99, document, { fetchImpl, concurrency: 1 });
    await vi.runAllTimersAsync();
    const rows = await scrapePromise;

    expect(rows!.map((r) => r.handle)).toEqual(['alice', 'bob']);
    expect(page2Attempts).toBe(2);
    vi.useRealTimers();
  });
});
