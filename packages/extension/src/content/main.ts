import { getRatingChanges, getStandings, getUserInfos, UserRatingPrefetcher, StandingsUnavailableError } from '../lib/cfApi.js';
import { finalDeltas, predictDeltas } from '../lib/predict.js';
import { getSettings } from '../lib/settings.js';
import { injectColumns } from './inject.js';
import { parseContestId, findStandingsTables, scrapeStandingsFromDOM } from './standings.js';
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
    const ratingChanges = settings.debugForceDomPredict
      ? []
      : await getRatingChanges(contestId);
    console.log('[CRP] ratingChanges length =', ratingChanges.length);
    if (ratingChanges.length > 0) {
      const finals = finalDeltas(ratingChanges);
      dataMap = new Map<string, RowData>();
      for (const [handle, { rating, delta }] of finals) {
        dataMap.set(handle, { rating, delta });
      }
    } else {
      let rows;
      if (settings.debugForceDomPredict) {
        console.info('[CRP] Debug: using DOM scrape as primary standings source');
        const prefetcher = new UserRatingPrefetcher();
        rows = await scrapeStandingsFromDOM(contestId, doc, {
          onPageRows: (pageRows) => prefetcher.add(pageRows.map((r) => r.handle)),
        });
        if (rows === null) {
          console.warn('[CRP] No standings table found in DOM, skipping injection');
          return;
        }
        await prefetcher.flush();
      } else {
        try {
          rows = await getStandings(contestId);
        } catch (e) {
          if (e instanceof StandingsUnavailableError) {
            console.info('[CRP] Standings API unavailable, falling back to HTML page scraping:', e.message);
            const prefetcher = new UserRatingPrefetcher();
            rows = await scrapeStandingsFromDOM(contestId, doc, {
              onPageRows: (pageRows) => prefetcher.add(pageRows.map((r) => r.handle)),
            });
            if (rows === null) {
              console.warn('[CRP] No standings table found in DOM, skipping injection');
              return;
            }
            await prefetcher.flush();
          } else {
            throw e;
          }
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
