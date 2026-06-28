import { getRatingChanges, getStandings, getUserInfos, StandingsUnavailableError } from '../lib/cfApi.js';
import { finalDeltas, predictDeltas } from '../lib/predict.js';
import { getSettings } from '../lib/settings.js';
import { injectColumns } from './inject.js';
import { parseContestId, findStandingsTables, parseStandingsFromDOM, extractTotalPages } from './standings.js';
import type { RowData } from '../types.js';

/**
 * 内容脚本核心逻辑（可注入 url/doc，便于测试）。
 * 运行时由 main() 以 location.href 和 document 调用。
 */
export async function runContentScript(url: string, doc: Document = document): Promise<void> {
  console.log('[CRP] content script running on', url);

  const contestId = parseContestId(url);
  if (contestId === null) {
    console.warn('[CRP] no contestId parsed from URL, aborting');
    return;
  }
  console.log('[CRP] contestId =', contestId);

  const settings = await getSettings();
  console.log('[CRP] settings =', settings);
  if (!settings.showRating && !settings.showDelta) {
    console.warn('[CRP] both columns disabled in settings, aborting');
    return;
  }

  let dataMap: Map<string, RowData>;

  try {
    // 先尝试已结束赛的真实 ratingChanges
    const ratingChanges = await getRatingChanges(contestId);
    console.log('[CRP] ratingChanges length =', ratingChanges.length);
    if (ratingChanges.length > 0) {
      // 已结束 rated 赛：用真实值
      const finals = finalDeltas(ratingChanges);
      dataMap = new Map<string, RowData>();
      for (const [handle, { rating, delta }] of finals) {
        dataMap.set(handle, { rating, delta });
      }
    } else {
      // 进行中 / 未结算：预测
      let rows;
      try {
        rows = await getStandings(contestId);
      } catch (e) {
        if (e instanceof StandingsUnavailableError) {
          // API 不可访问时降级：从当前页面 DOM + 分页 HTML 解析完整榜单
          console.info('[CRP] Standings API unavailable, falling back to HTML page scraping:', e.message);
          const tables = findStandingsTables(doc);
          if (tables.length === 0) {
            console.warn('[CRP] No standings table found in DOM, skipping injection');
            return;
          }
          rows = parseStandingsFromDOM(tables[0]!);

          // 拉取剩余分页（每批 10 页并发，最多 800 页 = ~16000 人）
          const MAX_PAGES = 800;
          const BATCH = 10;
          const totalPages = Math.min(extractTotalPages(doc), MAX_PAGES);
          if (totalPages > 1) {
            console.log(`[CRP] Fetching ${totalPages - 1} more standings pages…`);
            for (let start = 2; start <= totalPages; start += BATCH) {
              const end = Math.min(start + BATCH - 1, totalPages);
              const pageResults = await Promise.all(
                Array.from({ length: end - start + 1 }, async (_, i) => {
                  const page = start + i;
                  try {
                    const res = await fetch(
                      `/contest/${contestId}/standings/page/${page}`,
                      { credentials: 'include' },
                    );
                    if (!res.ok) return [] as typeof rows;
                    const html = await res.text();
                    const pageDom = new DOMParser().parseFromString(html, 'text/html');
                    const pt = findStandingsTables(pageDom);
                    return pt.length > 0 ? parseStandingsFromDOM(pt[0]!) : ([] as typeof rows);
                  } catch {
                    return [] as typeof rows;
                  }
                }),
              );
              let anyEmpty = false;
              for (const pageRows of pageResults) {
                if (pageRows.length === 0) { anyEmpty = true; break; }
                rows.push(...pageRows);
              }
              if (anyEmpty) break;
            }
          }
          console.log('[CRP] DOM standings rows =', rows.length);
        } else {
          throw e;
        }
      }
      const handles = rows.map((r) => r.handle);
      const userInfos = await getUserInfos(handles);
      const ratingsMap = new Map<string, number | undefined>();
      for (const u of userInfos) {
        ratingsMap.set(u.handle, u.rating);
      }
      const deltas = predictDeltas(rows, ratingsMap);
      dataMap = new Map<string, RowData>();
      for (const row of rows) {
        const rating = ratingsMap.get(row.handle);
        const delta = deltas.get(row.handle);
        const rowData: RowData = {};
        if (rating !== undefined) rowData.rating = rating;
        if (delta !== undefined) rowData.delta = delta;
        dataMap.set(row.handle, rowData);
      }
    }
  } catch (e) {
    // 静默降级：API 失败不破坏页面
    console.warn('[CRP] Failed to load data, skipping injection:', e);
    return;
  }

  console.log('[CRP] data ready, entries =', dataMap.size);

  const tables = findStandingsTables(doc);
  console.log('[CRP] standings tables found =', tables.length);
  if (tables.length === 0) {
    console.warn(
      '[CRP] no "table.standings" found on page — the standings table selector may not match this page',
    );
  }
  for (const table of tables) {
    try {
      injectColumns(table, dataMap, settings);
    } catch (e) {
      console.warn('[CRP] Failed to inject columns:', e);
    }
  }
}

async function main(): Promise<void> {
  return runContentScript(location.href, document);
}

main().catch((e) => console.warn('[CRP] Unhandled error:', e));
