// @vitest-environment jsdom
/**
 * 阶段 B 集成测试：完整内容脚本流程 (jsdom)
 *
 * 覆盖场景：
 *  1. E2E 已结束 rated 赛 —— ratingChanges 非空，注入真实值
 *  2. E2E 进行中赛（预测模式）—— ratingChanges 空 + standings + user.info
 *  3. 幂等性：二次调用不重复加列
 *  4. 团队赛行被过滤，DOM 行显示 "—"（不误注入错误数据）
 *  5. 未计分赛降级：standings 也不可用 → 不抛错、不注入任何列
 *  6. 未评分用户（user.info 无 rating）→ 预测使用 1400，rating 列显 "—"
 *  7. fetch 网络错误 → 不抛错、不注入列
 *  8. HTTP 错误 (503) → 不抛错、不注入列
 *  9. API FAILED 响应 → 不抛错、不注入列
 * 10. 无 handle 行（extractHandle 返回 null） → 显示 "—" 而非崩溃
 * 11. 非 standings URL → 不调用 fetch
 * 12. 两列开关 (showRating=false, showDelta=false) → 不调用 fetch 不注入
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { computeRatingChangesFast } from '@crp/core';
import { _api, _clearMemCache } from '../src/lib/cfApi.js';
import { runContentScript } from '../src/content/main.js';
import { extractHandle } from '../src/content/standings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadStandingsFixture(): void {
  const html = readFileSync(resolve(__dirname, 'fixtures/standings-sample.html'), 'utf-8');
  document.body.innerHTML = html;
}

// ─────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────
const CONTEST_URL = 'https://codeforces.com/contest/1234/standings';

// ─────────────────────────────────────────────────────
// 辅助：伪造 fetch 返回值
// ─────────────────────────────────────────────────────
function makeOk<T>(result: T): Response {
  return {
    ok: true,
    json: async () => ({ status: 'OK', result }),
  } as unknown as Response;
}

function makeFailed(comment: string): Response {
  return {
    ok: true,
    json: async () => ({ status: 'FAILED', comment }),
  } as unknown as Response;
}

function makeHtml(html: string): Response {
  return {
    ok: true,
    text: async () => html,
  } as unknown as Response;
}

function makeHttpError(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

// ─────────────────────────────────────────────────────
// 辅助：构造 standings 表格
// ─────────────────────────────────────────────────────
interface TableEntry {
  handle: string;
  rank: number;
}

function buildStandingsTable(entries: TableEntry[]): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'standings';
  // 表头："=" 列用于定位插入位置（inject.ts 会识别）
  table.innerHTML = `
    <thead>
      <tr><th>#</th><th>=</th><th>Score</th></tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody')!;
  for (const { handle, rank } of entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rank}</td>
      <td><a href="/profile/${handle}">${handle}</a></td>
      <td>0</td>
    `;
    tbody.appendChild(tr);
  }
  document.body.appendChild(table);
  return table;
}

// ─────────────────────────────────────────────────────
// 辅助：chrome.storage stub（返回空存储，使用默认设置）
// ─────────────────────────────────────────────────────
function stubChromeDefaults(): void {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn((_key: string, cb: (r: Record<string, unknown>) => void) => cb({})),
        set: vi.fn((_data: unknown, cb: () => void) => cb()),
      },
    },
  });
}

function stubChromeSettings(settings: {
  showRating?: boolean;
  showDelta?: boolean;
  debugForceDomPredict?: boolean;
}): void {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn((_key: string, cb: (r: Record<string, unknown>) => void) =>
          cb({ crp_settings: settings }),
        ),
        set: vi.fn((_data: unknown, cb: () => void) => cb()),
      },
    },
  });
}

// ─────────────────────────────────────────────────────
// 辅助：delta 格式化（与 inject.ts 保持一致）
// ─────────────────────────────────────────────────────
function fmt(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

const EMPTY_TEXT = '\u2014';

// ─────────────────────────────────────────────────────
// 全局 mock fetch
// ─────────────────────────────────────────────────────
const mockFetch = vi.fn();

beforeEach(() => {
  _clearMemCache();
  mockFetch.mockReset();
  _api.fetchImpl = mockFetch as unknown as (url: string) => Promise<Response>;
  stubChromeDefaults();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════
// 场景 1：已结束 rated 赛 —— 真实值模式
// ═══════════════════════════════════════════════════════
describe('E2E: 已结束 rated 赛（ratingChanges 真实值）', () => {
  it('两列注入正确的 oldRating 和 delta', async () => {
    const ratingChanges = [
      {
        contestId: 1234, contestName: 'Test', handle: 'alice', rank: 1,
        ratingUpdateTimeSeconds: 0, oldRating: 1800, newRating: 1850,
      },
      {
        contestId: 1234, contestName: 'Test', handle: 'bob', rank: 2,
        ratingUpdateTimeSeconds: 0, oldRating: 1500, newRating: 1480,
      },
      {
        contestId: 1234, contestName: 'Test', handle: 'charlie', rank: 3,
        ratingUpdateTimeSeconds: 0, oldRating: 1200, newRating: 1200,
      },
    ];
    mockFetch.mockResolvedValueOnce(makeOk(ratingChanges));

    buildStandingsTable([
      { handle: 'alice', rank: 1 },
      { handle: 'bob', rank: 2 },
      { handle: 'charlie', rank: 3 },
    ]);

    await runContentScript(CONTEST_URL, document);

    const rows = Array.from(document.querySelectorAll('tbody tr'));

    // alice: oldRating=1800, delta=+50
    const aliceRating = rows[0]!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(aliceRating.textContent).toBe('1800');
    const aliceDelta = rows[0]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(aliceDelta.textContent).toBe('+50');
    expect(aliceDelta.className).toBe('crp-delta-pos');

    // bob: oldRating=1500, delta=-20
    const bobRating = rows[1]!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(bobRating.textContent).toBe('1500');
    const bobDelta = rows[1]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(bobDelta.textContent).toBe('-20');
    expect(bobDelta.className).toBe('crp-delta-neg');

    // charlie: oldRating=1200, delta=0
    const charlieRating = rows[2]!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(charlieRating.textContent).toBe('1200');
    const charlieDelta = rows[2]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(charlieDelta.textContent).toBe('0');
    expect(charlieDelta.className).toBe('crp-delta-zero');

    // 表头也被注入
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent?.trim());
    expect(headers).toContain('Rating');
    expect(headers).toContain('Pred Δ');
  });

  it('API 返回空时在 Final standings 页面回退解析 rating HTML', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOk([]))
      .mockResolvedValueOnce(
        makeHtml(`
          <table>
            <tr><th>#</th><th>Who</th><th>Rank</th><th>Old Rating</th><th>New Rating</th></tr>
            <tr>
              <td>1</td><td><a href="/profile/alice">alice</a></td><td>1</td>
              <td>1800</td><td>1867</td>
            </tr>
          </table>
        `),
      );

    document.body.innerHTML = '<div>Final standings</div>';
    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await runContentScript(CONTEST_URL, document);

    const row = document.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.querySelector('[data-crp-rating]')!.textContent).toBe('1800');
    expect(row.querySelector('[data-crp-delta]')!.textContent).toBe('+67');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1]![0])).toContain('/contest/1234/rating');
  });

  it('幂等：二次调用不重复加列', async () => {
    const ratingChanges = [
      {
        contestId: 1234, contestName: 'T', handle: 'alice', rank: 1,
        ratingUpdateTimeSeconds: 0, oldRating: 1800, newRating: 1850,
      },
    ];
    // 两次调用各需一次 fetch（不缓存 ratingChanges）
    mockFetch.mockResolvedValue(makeOk(ratingChanges));

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await runContentScript(CONTEST_URL, document);
    const countAfterFirst = document.querySelectorAll('[data-crp-rating]').length;

    await runContentScript(CONTEST_URL, document);
    const countAfterSecond = document.querySelectorAll('[data-crp-rating]').length;

    expect(countAfterSecond).toBe(countAfterFirst);
    expect(countAfterFirst).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// 场景 2：进行中赛 —— 预测模式
// ═══════════════════════════════════════════════════════
describe('E2E: 进行中赛（预测模式）', () => {
  it('注入预测 delta，数值与 @crp/core 直接计算一致', async () => {
    // ratingChanges 为空（比赛尚未结算）
    mockFetch.mockResolvedValueOnce(makeOk([]));

    // standings
    mockFetch.mockResolvedValueOnce(
      makeOk({
        rows: [
          { party: { members: [{ handle: 'alice' }] }, rank: 1, points: 3, penalty: 0 },
          { party: { members: [{ handle: 'bob' }] }, rank: 2, points: 2, penalty: 0 },
          { party: { members: [{ handle: 'charlie' }] }, rank: 3, points: 1, penalty: 0 },
        ],
      }),
    );

    // user.info
    mockFetch.mockResolvedValueOnce(
      makeOk([
        { handle: 'alice', rating: 1800 },
        { handle: 'bob', rating: 1500 },
        { handle: 'charlie', rating: 1200 },
      ]),
    );

    buildStandingsTable([
      { handle: 'alice', rank: 1 },
      { handle: 'bob', rank: 2 },
      { handle: 'charlie', rank: 3 },
    ]);

    await runContentScript(CONTEST_URL, document);

    // 用 core 直接计算期望值
    const coreResult = computeRatingChangesFast([
      { party: 'alice', rank: 1, rating: 1800 },
      { party: 'bob', rank: 2, rating: 1500 },
      { party: 'charlie', rank: 3, rating: 1200 },
    ]);
    const expectedDeltas = new Map(coreResult.map((c) => [c.party, c.delta]));

    const rows = Array.from(document.querySelectorAll('tbody tr'));

    for (const [i, handle] of (['alice', 'bob', 'charlie'] as const).entries()) {
      const deltaEl = rows[i]!.querySelector('[data-crp-delta]') as HTMLElement;
      const expectedDelta = expectedDeltas.get(handle)!;
      expect(deltaEl.textContent, `${handle} delta`).toBe(fmt(expectedDelta));

      // 颜色 class 正确
      if (expectedDelta > 0) expect(deltaEl.className).toBe('crp-delta-pos');
      else if (expectedDelta < 0) expect(deltaEl.className).toBe('crp-delta-neg');
      else expect(deltaEl.className).toBe('crp-delta-zero');
    }

    // rating 列显示当前 rating
    const aliceRatingEl = rows[0]!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(aliceRatingEl.textContent).toBe('1800');
  });

  it('预测模式幂等：二次调用列数不变', async () => {
    mockFetch.mockResolvedValueOnce(makeOk([]));
    mockFetch.mockResolvedValueOnce(
      makeOk({ rows: [{ party: { members: [{ handle: 'alice' }] }, rank: 1, points: 1, penalty: 0 }] }),
    );
    mockFetch.mockResolvedValueOnce(makeOk([{ handle: 'alice', rating: 1500 }]));

    // 第二次调用也需 mock（userInfo 缓存命中不需 fetch，但 ratingChanges / standings 没缓存）
    mockFetch.mockResolvedValueOnce(makeOk([]));
    mockFetch.mockResolvedValueOnce(
      makeOk({ rows: [{ party: { members: [{ handle: 'alice' }] }, rank: 1, points: 1, penalty: 0 }] }),
    );
    // alice 已被缓存，user.info 不会再调 fetch

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await runContentScript(CONTEST_URL, document);
    const cnt1 = document.querySelectorAll('[data-crp-rating]').length;

    await runContentScript(CONTEST_URL, document);
    const cnt2 = document.querySelectorAll('[data-crp-rating]').length;

    expect(cnt2).toBe(cnt1);
  });
});

// ═══════════════════════════════════════════════════════
// 边界：团队赛
// ═══════════════════════════════════════════════════════
describe('边界：团队赛行不被误注入错误数据', () => {
  it('团队成员被过滤后 dataMap 为空，DOM 行显示 "—"', async () => {
    // ratingChanges 为空
    mockFetch.mockResolvedValueOnce(makeOk([]));
    // standings 全为团队行（两成员），getStandings 会全部过滤
    mockFetch.mockResolvedValueOnce(
      makeOk({
        rows: [
          { party: { members: [{ handle: 'a' }, { handle: 'b' }] }, rank: 1, points: 3, penalty: 0 },
          { party: { members: [{ handle: 'c' }, { handle: 'd' }] }, rank: 2, points: 2, penalty: 0 },
        ],
      }),
    );
    // getUserInfos([]) 不发出 fetch 请求

    // DOM 有一行，handle 是团队成员 'a'（但 'a' 不在 dataMap 里）
    const table = document.createElement('table');
    table.className = 'standings';
    table.innerHTML = `
      <thead><tr><th>#</th><th>=</th></tr></thead>
      <tbody>
        <tr>
          <td>1</td>
          <td><a href="/profile/a">TeamAB</a></td>
        </tr>
      </tbody>
    `;
    document.body.appendChild(table);

    await runContentScript(CONTEST_URL, document);

    // 列已注入，但数据为 "—"（不是错误的 rating/delta 数值）
    const dataRows = Array.from(table.querySelectorAll('tbody tr'));
    const ratingTd = dataRows[0]!.querySelector('[data-crp-rating]') as HTMLElement;
    const deltaTd = dataRows[0]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(ratingTd.textContent).toBe('—');
    expect(deltaTd.textContent).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════
// 边界：未计分赛降级
// ═══════════════════════════════════════════════════════
describe('边界：未计分赛 —— 优雅降级', () => {
  it('ratingChanges 为空且 standings API 抛错 → 不抛错、不注入任何列', async () => {
    // ratingChanges 返回 unavailable（EmptyResultError，被 getRatingChanges 内部 catch，返回 []）
    mockFetch.mockResolvedValueOnce(
      makeFailed('Rating changes are unavailable for this contest'),
    );
    // standings 返回普通失败（抛到外层 catch）
    mockFetch.mockResolvedValueOnce(makeFailed('Contest is not ready'));

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    // 不应抛错
    await expect(runContentScript(CONTEST_URL, document)).resolves.toBeUndefined();

    // 没有任何列被注入
    expect(document.querySelectorAll('[data-crp-rating]').length).toBe(0);
    expect(document.querySelectorAll('[data-crp-delta]').length).toBe(0);
  });

  it('standings 成功但返回空行 → 注入列但全部显示 "—"（无崩溃）', async () => {
    mockFetch.mockResolvedValueOnce(makeOk([]));          // ratingChanges 空
    mockFetch.mockResolvedValueOnce(makeOk({ rows: [] })); // standings 空行

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await expect(runContentScript(CONTEST_URL, document)).resolves.toBeUndefined();
    // 列被注入；数据行（tbody tr）中的 rating 单元格显示 "—"（dataMap 为空）
    const aliceDataTd = document.querySelector('tbody tr [data-crp-rating]') as HTMLElement | null;
    if (aliceDataTd !== null) {
      expect(aliceDataTd.textContent).toBe('—');
    }
    // 关键：没有崩溃
  });
});

// ═══════════════════════════════════════════════════════
// 边界：未评分用户 → 1400 处理
// ═══════════════════════════════════════════════════════
describe('边界：未评分用户 user.info 无 rating 字段', () => {
  it('预测以 1400 计算 delta，rating 列显示 "—"', async () => {
    mockFetch.mockResolvedValueOnce(makeOk([])); // ratingChanges 空

    mockFetch.mockResolvedValueOnce(
      makeOk({
        rows: [
          { party: { members: [{ handle: 'alice' }] }, rank: 1, points: 2, penalty: 0 },
          { party: { members: [{ handle: 'newbie' }] }, rank: 2, points: 0, penalty: 0 },
        ],
      }),
    );

    // newbie 没有 rating 字段（未评分用户）
    mockFetch.mockResolvedValueOnce(
      makeOk([
        { handle: 'alice', rating: 1600 },
        { handle: 'newbie' },
      ]),
    );

    buildStandingsTable([
      { handle: 'alice', rank: 1 },
      { handle: 'newbie', rank: 2 },
    ]);

    await runContentScript(CONTEST_URL, document);

    // 用 core 直接计算期望（newbie 用 1400）
    const coreResult = computeRatingChangesFast([
      { party: 'alice', rank: 1, rating: 1600 },
      { party: 'newbie', rank: 2, rating: 1400 },
    ]);
    const newbieExpected = coreResult.find((c) => c.party === 'newbie')!.delta;

    const rows = Array.from(document.querySelectorAll('tbody tr'));

    // newbie delta 与 core（1400 基准）一致
    const newbieDeltaEl = rows[1]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(newbieDeltaEl.textContent).toBe(fmt(newbieExpected));

    // newbie 无 rating → 显示 "—"
    const newbieRatingEl = rows[1]!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(newbieRatingEl.textContent).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════
// 边界：fetch 失败 / API 错误
// ═══════════════════════════════════════════════════════
describe('边界：fetch 失败 / API 错误', () => {
  it('网络错误（fetch 抛 Error）→ 不抛错、不注入列', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await expect(runContentScript(CONTEST_URL, document)).resolves.toBeUndefined();
    expect(document.querySelectorAll('[data-crp-rating]').length).toBe(0);
  });

  it('HTTP 503 → 不抛错、不注入列', async () => {
    mockFetch.mockResolvedValueOnce(makeHttpError(503));

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await expect(runContentScript(CONTEST_URL, document)).resolves.toBeUndefined();
    expect(document.querySelectorAll('[data-crp-rating]').length).toBe(0);
  });

  it('API FAILED（非空结果类错误）→ 不抛错、不注入列', async () => {
    mockFetch.mockResolvedValueOnce(makeFailed('Request limit exceeded'));

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await expect(runContentScript(CONTEST_URL, document)).resolves.toBeUndefined();
    expect(document.querySelectorAll('[data-crp-rating]').length).toBe(0);
  });

  it('user.info fetch 失败 → 不抛错、不注入列', async () => {
    mockFetch.mockResolvedValueOnce(makeOk([])); // ratingChanges 空
    mockFetch.mockResolvedValueOnce(
      makeOk({ rows: [{ party: { members: [{ handle: 'alice' }] }, rank: 1, points: 1, penalty: 0 }] }),
    );
    mockFetch.mockRejectedValueOnce(new Error('user.info fetch failed'));

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);

    await expect(runContentScript(CONTEST_URL, document)).resolves.toBeUndefined();
    expect(document.querySelectorAll('[data-crp-rating]').length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 边界：无 handle 行（extractHandle 返回 null）
// ═══════════════════════════════════════════════════════
describe('边界：表格包含无 handle 行', () => {
  it('无 profile 链接的行显示 "—"，不崩溃', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOk([
        {
          contestId: 1234, contestName: 'T', handle: 'alice', rank: 1,
          ratingUpdateTimeSeconds: 0, oldRating: 1800, newRating: 1850,
        },
      ]),
    );

    const table = document.createElement('table');
    table.className = 'standings';
    table.innerHTML = `
      <thead><tr><th>#</th><th>=</th></tr></thead>
      <tbody>
        <tr><td>1</td><td><a href="/profile/alice">alice</a></td></tr>
        <tr><td>2</td><td>no-handle-here</td></tr>
      </tbody>
    `;
    document.body.appendChild(table);

    await runContentScript(CONTEST_URL, document);

    const dataRows = Array.from(table.querySelectorAll('tbody tr'));
    // alice → 有数据
    const aliceRating = dataRows[0]!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(aliceRating.textContent).toBe('1800');
    // 无 handle 行 → "—"
    const noHandleRating = dataRows[1]!.querySelector('[data-crp-rating]') as HTMLElement;
    expect(noHandleRating.textContent).toBe('—');
  });
});

// ═══════════════════════════════════════════════════════
// 边界：URL 与设置校验
// ═══════════════════════════════════════════════════════
describe('边界：URL 与设置', () => {
  it('非 standings URL → 立即返回，不发出任何 fetch', async () => {
    await runContentScript('https://codeforces.com/contest/1234/problem/A', document);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('showRating=false & showDelta=false → 不发出 fetch、不注入列', async () => {
    stubChromeSettings({ showRating: false, showDelta: false });

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);
    await runContentScript(CONTEST_URL, document);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-crp-rating]').length).toBe(0);
    expect(document.querySelectorAll('[data-crp-delta]').length).toBe(0);
  });

  it('showRating=true, showDelta=false → 只注入 Rating 列', async () => {
    stubChromeSettings({ showRating: true, showDelta: false });

    mockFetch.mockResolvedValueOnce(
      makeOk([
        {
          contestId: 1234, contestName: 'T', handle: 'alice', rank: 1,
          ratingUpdateTimeSeconds: 0, oldRating: 1800, newRating: 1850,
        },
      ]),
    );

    buildStandingsTable([{ handle: 'alice', rank: 1 }]);
    await runContentScript(CONTEST_URL, document);

    expect(document.querySelectorAll('[data-crp-rating]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-crp-delta]').length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// 场景 3：已结束赛页面 + DOM 降级（模拟进行中 API 不可用）
// ═══════════════════════════════════════════════════════
describe('E2E: 已结束赛 DOM 降级（模拟进行中 standings API 不可用）', () => {
  const CONTEST_1900_URL = 'https://codeforces.com/contest/1900/standings';

  const OFFICIAL = [
    { handle: 'tourist', rank: 1, rating: 3800 },
    { handle: 'Petr', rank: 2, rating: 3700 },
    { handle: 'Um_nik', rank: 3, rating: 3500 },
    { handle: 'neal', rank: 4, rating: 3400 },
    { handle: 'A.K.E.E.', rank: 5, rating: 2800 },
  ] as const;

  it('从真实 CF 结构 HTML 解析官方选手，预测 delta 与 @crp/core 一致；unofficial 行显示 "—"', async () => {
    // ratingChanges 空 → 走预测分支（模拟比赛进行中/未结算）
    mockFetch.mockResolvedValueOnce(makeOk([]));
    // standings API 不可用 → 降级 DOM 解析
    mockFetch.mockResolvedValueOnce(makeFailed('Contest standings are unavailable'));
    // user.info 仅官方选手（virtual/ooc 不应被请求——但 getUserInfos 会收到 DOM 过滤后的 handles）
    mockFetch.mockResolvedValueOnce(
      makeOk(OFFICIAL.map(({ handle, rating }) => ({ handle, rating }))),
    );

    loadStandingsFixture();

    await runContentScript(CONTEST_1900_URL, document);

    const expected = computeRatingChangesFast(
      OFFICIAL.map(({ handle, rank, rating }) => ({ party: handle, rank, rating })),
    );
    const expectedDeltas = new Map(expected.map((c) => [c.party, c.delta]));

    const table = document.querySelector('table.standings')!;
    const dataRows = Array.from(table.querySelectorAll('tbody tr')).filter(
      (r) => r.querySelector('a[href*="/profile/"]') !== null,
    );

    for (const { handle } of OFFICIAL) {
      const row = dataRows.find(
        (r) => extractHandle(r as HTMLTableRowElement) === handle,
      ) as HTMLTableRowElement | undefined;
      expect(row, `${handle} row`).toBeDefined();
      const deltaEl = row!.querySelector('[data-crp-delta]') as HTMLElement;
      expect(deltaEl.textContent).toBe(fmt(expectedDeltas.get(handle)!));
    }

    // unofficial 选手不在预测集合中
    for (const unofficial of ['virtual_user', 'ooc_user'] as const) {
      const row = dataRows.find(
        (r) => extractHandle(r as HTMLTableRowElement) === unofficial,
      ) as HTMLTableRowElement | undefined;
      expect(row, `${unofficial} row`).toBeDefined();
      expect(row!.querySelector('[data-crp-rating]')!.textContent).toBe('—');
      expect(row!.querySelector('[data-crp-delta]')!.textContent).toBe('—');
    }

    // user.info 只应请求官方 5 人（不应包含 virtual/ooc）
    const userInfoCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes('user.info'),
    );
    expect(userInfoCall).toBeDefined();
    expect(String(userInfoCall![0])).not.toContain('virtual_user');
    expect(String(userInfoCall![0])).not.toContain('ooc_user');
  });

  it('excludes unofficial DOM rows before predicting official deltas', async () => {
    mockFetch.mockResolvedValueOnce(makeOk([]));
    mockFetch.mockResolvedValueOnce(makeFailed('Contest standings are unavailable'));
    mockFetch.mockResolvedValueOnce(
      makeOk([
        { handle: 'alice', rating: 1800 },
        { handle: 'bob', rating: 1500 },
        { handle: 'ghost', rating: 1400 },
      ]),
    );

    document.body.innerHTML = `
      <table class="standings">
        <thead><tr><th>#</th><th>Who</th><th>=</th></tr></thead>
        <tbody>
          <tr><td>1</td><td class="contestant-cell"><a href="/profile/alice">alice</a></td><td>300</td></tr>
          <tr><td>2</td><td class="contestant-cell"><a href="/profile/bob">bob</a></td><td>200</td></tr>
          <tr>
            <td>3</td>
            <td class="contestant-cell">
              <a href="/profile/ghost">ghost</a><span class="participant-info"> unofficial</span>
            </td>
            <td>100</td>
          </tr>
        </tbody>
      </table>
    `;

    await runContentScript(CONTEST_1900_URL, document);

    const expected = computeRatingChangesFast([
      { party: 'alice', rank: 1, rating: 1800 },
      { party: 'bob', rank: 2, rating: 1500 },
    ]);
    const expectedDeltas = new Map(expected.map((c) => [c.party, c.delta]));
    const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLTableRowElement[];

    for (const handle of ['alice', 'bob'] as const) {
      const row = rows.find((r) => extractHandle(r) === handle)!;
      const deltaEl = row.querySelector('[data-crp-delta]') as HTMLElement;
      expect(deltaEl.textContent, `${handle} delta`).toBe(fmt(expectedDeltas.get(handle)!));
    }

    const unofficialRow = rows.find((r) => extractHandle(r) === 'ghost')!;
    expect(unofficialRow.querySelector('[data-crp-rating]')!.textContent).toBe(EMPTY_TEXT);
    expect(unofficialRow.querySelector('[data-crp-delta]')!.textContent).toBe(EMPTY_TEXT);

    const userInfoCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes('user.info'),
    );
    expect(userInfoCall).toBeDefined();
    expect(String(userInfoCall![0])).not.toContain('ghost');
  });
});

describe('E2E: Debug DOM 预测模式', () => {
  it('uses ratingChanges oldRating instead of current user.info rating when predicting finished contests', async () => {
    stubChromeSettings({ debugForceDomPredict: true });

    const ratingChanges = [
      {
        contestId: 1234, contestName: 'T', handle: 'alice', rank: 1,
        ratingUpdateTimeSeconds: 0, oldRating: 1800, newRating: 1850,
      },
      {
        contestId: 1234, contestName: 'T', handle: 'bob', rank: 2,
        ratingUpdateTimeSeconds: 0, oldRating: 1500, newRating: 1480,
      },
    ];

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('contest.ratingChanges')) return makeOk(ratingChanges);
      if (url.includes('user.info')) {
        return makeOk([
          { handle: 'alice', rating: 2400 },
          { handle: 'bob', rating: 1000 },
        ]);
      }
      return makeFailed(`Unexpected URL: ${url}`);
    });

    buildStandingsTable([
      { handle: 'alice', rank: 1 },
      { handle: 'bob', rank: 2 },
    ]);

    await runContentScript(CONTEST_URL, document);

    const expected = computeRatingChangesFast([
      { party: 'alice', rank: 1, rating: 1800 },
      { party: 'bob', rank: 2, rating: 1500 },
    ]);
    const expectedDeltas = new Map(expected.map((c) => [c.party, c.delta]));
    const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLTableRowElement[];

    const aliceRating = rows[0]!.querySelector('[data-crp-rating]') as HTMLElement;
    const aliceDelta = rows[0]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(aliceRating.textContent).toBe('1800');
    expect(aliceDelta.textContent).toBe(fmt(expectedDeltas.get('alice')!));

    const bobRating = rows[1]!.querySelector('[data-crp-rating]') as HTMLElement;
    const bobDelta = rows[1]!.querySelector('[data-crp-delta]') as HTMLElement;
    expect(bobRating.textContent).toBe('1500');
    expect(bobDelta.textContent).toBe(fmt(expectedDeltas.get('bob')!));

    expect(mockFetch.mock.calls.some((c) => String(c[0]).includes('user.info'))).toBe(false);
  });

  it('recomputes ranks from official DOM rows before predicting deltas', async () => {
    stubChromeSettings({ debugForceDomPredict: true });

    const ratingChanges = [
      {
        contestId: 1234, contestName: 'T', handle: 'alice', rank: 1,
        ratingUpdateTimeSeconds: 0, oldRating: 1800, newRating: 1850,
      },
      {
        contestId: 1234, contestName: 'T', handle: 'bob', rank: 2,
        ratingUpdateTimeSeconds: 0, oldRating: 1500, newRating: 1480,
      },
    ];

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('contest.ratingChanges')) return makeOk(ratingChanges);
      return makeFailed(`Unexpected URL: ${url}`);
    });

    document.body.innerHTML = `
      <table class="standings">
        <thead><tr><th>#</th><th>Who</th><th>=</th><th>*</th></tr></thead>
        <tbody>
          <tr><td>1</td><td class="contestant-cell"><small>*</small><a href="/profile/ghost">ghost</a></td><td>300</td><td>10</td></tr>
          <tr><td>2</td><td class="contestant-cell"><a href="/profile/alice">alice</a></td><td>250</td><td>20</td></tr>
          <tr><td>3</td><td class="contestant-cell"><a href="/profile/bob">bob</a></td><td>150</td><td>40</td></tr>
        </tbody>
      </table>
    `;

    await runContentScript(CONTEST_URL, document);

    const expected = computeRatingChangesFast([
      { party: 'alice', rank: 1, rating: 1800 },
      { party: 'bob', rank: 2, rating: 1500 },
    ]);
    const expectedDeltas = new Map(expected.map((c) => [c.party, c.delta]));
    const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    const aliceRow = rows.find((r) => extractHandle(r) === 'alice')!;
    const bobRow = rows.find((r) => extractHandle(r) === 'bob')!;

    expect(aliceRow.querySelector('[data-crp-delta]')!.textContent).toBe(fmt(expectedDeltas.get('alice')!));
    expect(bobRow.querySelector('[data-crp-delta]')!.textContent).toBe(fmt(expectedDeltas.get('bob')!));
  });
});
