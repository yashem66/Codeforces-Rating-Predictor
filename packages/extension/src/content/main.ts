import { getRatingChanges, getStandings, getUserInfos } from '../lib/cfApi.js';
import { finalDeltas, predictDeltas } from '../lib/predict.js';
import { getSettings } from '../lib/settings.js';
import { injectColumns } from './inject.js';
import { parseContestId, findStandingsTables } from './standings.js';
import type { RowData } from '../types.js';

/**
 * 内容脚本核心逻辑（可注入 url/doc，便于测试）。
 * 运行时由 main() 以 location.href 和 document 调用。
 */
export async function runContentScript(url: string, doc: Document = document): Promise<void> {
  const contestId = parseContestId(url);
  if (contestId === null) return;

  const settings = await getSettings();
  if (!settings.showRating && !settings.showDelta) return;

  let dataMap: Map<string, RowData>;

  try {
    // 先尝试已结束赛的真实 ratingChanges
    const ratingChanges = await getRatingChanges(contestId);
    if (ratingChanges.length > 0) {
      // 已结束 rated 赛：用真实值
      const finals = finalDeltas(ratingChanges);
      dataMap = new Map<string, RowData>();
      for (const [handle, { rating, delta }] of finals) {
        dataMap.set(handle, { rating, delta });
      }
    } else {
      // 进行中 / 未结算：预测
      const rows = await getStandings(contestId);
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

  const tables = findStandingsTables(doc);
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
