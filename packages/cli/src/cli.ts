#!/usr/bin/env tsx
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  computeRatingChanges,
  computeRatingChangesFast,
  displayToCalc,
  calcToDisplay,
  type Contestant,
} from '@crp/core';
import { CodeforcesApi } from './api.js';
import { JsonCache } from './cache.js';
import { SAMPLE_CONTEST_IDS } from './dataset.js';
import { validateContest, type ContestReport } from './validate.js';
import { aggregate, formatReport } from './report.js';
import { listFinishedContests } from './contests.js';
import { ParticipationIndex } from './participationIndex.js';
import { runValidateAll } from './full.js';

const DATA_DIR = join(process.cwd(), 'data', 'cache');

// 索引覆盖新评分体系生效以来（2020 起）即可：是否新体系账号由“首场 oldRating==0”判定，
// 老用户最早出现的那场 oldRating>0 即会被正确识别为非新体系（offset 0）。
const INDEX_FROM = Math.floor(
  Date.parse(process.env.CRP_INDEX_FROM ?? '2020-01-01T00:00:00Z') / 1000,
);
const VALIDATE_FROM = Math.floor(
  Date.parse(process.env.CRP_VALIDATE_FROM ?? '2022-01-01T00:00:00Z') / 1000,
);
const NOW_SEC = Math.floor(Date.now() / 1000);

function parseTargets(arg: string | undefined): number[] {
  if (!arg || arg === 'sample') return SAMPLE_CONTEST_IDS;
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`invalid contest target: ${arg}`);
  }
  return [id];
}

async function main(): Promise<void> {
  const [command, target] = process.argv.slice(2);
  const api = new CodeforcesApi({ cache: new JsonCache(DATA_DIR) });

  switch (command) {
    case 'fetch': {
      const ids = parseTargets(target);
      for (const id of ids) {
        process.stdout.write(`fetching ${id} ...\n`);
        const rows = await api.getRatingChanges(id);
        process.stdout.write(`  ${id}: ${rows.length} rows\n`);
      }
      process.stdout.write(`done: cached ${ids.length} contests\n`);
      break;
    }
    case 'validate': {
      // 样本检查点：按成熟用户假设（空 priorCounts -> 偏移 0）快速校验核心算法；
      // 新账号会作为 mismatch 出现在 worst 列表，全量验证（validate-all）才用索引精确求 k。
      const ids = parseTargets(target);
      const fn = process.env.CRP_NAIVE === '1' ? computeRatingChanges : computeRatingChangesFast;
      const items: { contestId: number; report: ContestReport }[] = [];
      for (const id of ids) {
        const rows = await api.getRatingChanges(id);
        const report = validateContest(rows, new Map(), fn);
        items.push({ contestId: id, report });
        process.stdout.write(formatReport(id, report) + '\n\n');
      }
      const agg = aggregate(items);
      process.stdout.write(
        `AGGREGATE: contests=${items.length} totalN=${agg.totalN} ` +
          `weightedExactRate=${(agg.weightedExactRate * 100).toFixed(2)}% ` +
          `maxAbsError=${agg.maxAbsError}\n`,
      );
      break;
    }
    case 'fetch-all': {
      const contests = await listFinishedContests(api, INDEX_FROM, NOW_SEC);
      process.stdout.write(`enumerated ${contests.length} finished contests\n`);
      let rated = 0;
      for (const meta of contests) {
        let rows: Awaited<ReturnType<CodeforcesApi['getRatingChanges']>>;
        try {
          rows = await api.getRatingChanges(meta.id);
        } catch (err) {
          process.stdout.write(
            `  ${meta.id} ${meta.name}: SKIP (${err instanceof Error ? err.message : String(err)})\n`,
          );
          continue;
        }
        if (rows.length > 0) rated++;
        process.stdout.write(`  ${meta.id} ${meta.name}: ${rows.length} rows\n`);
      }
      process.stdout.write(`done: ${rated} rated contests cached\n`);
      break;
    }
    case 'validate-all': {
      const result = await runValidateAll({
        listContests: () => listFinishedContests(api, INDEX_FROM, NOW_SEC),
        getRatingChanges: (id) => api.getRatingChanges(id),
        validateFromSec: VALIDATE_FROM,
        onProgress: (msg) => process.stdout.write(msg + '\n'),
      });
      await mkdir(join(process.cwd(), 'data'), { recursive: true });
      const outPath = join(process.cwd(), 'data', 'full-report.json');
      await writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');
      const agg = result.aggregate;
      process.stdout.write(
        `\nFULL AGGREGATE: contests=${result.validated.length} totalN=${agg.totalN} ` +
          `weightedExactRate=${(agg.weightedExactRate * 100).toFixed(3)}% ` +
          `weightedMeanAbsError=${agg.weightedMeanAbsError.toFixed(3)} ` +
          `maxAbsError=${agg.maxAbsError}\nreport: ${outPath}\n`,
      );
      break;
    }
    case 'diag': {
      const id = Number(target);
      if (!Number.isInteger(id) || id <= 0) throw new Error(`invalid contest id: ${target}`);

      // 用缓存重建全局参赛索引（全部命中缓存，较快）。
      const contests = await listFinishedContests(api, INDEX_FROM, NOW_SEC);
      const index = new ParticipationIndex();
      let indexedContests = 0;
      for (const meta of contests) {
        let rows;
        try {
          rows = await api.getRatingChanges(meta.id);
        } catch {
          continue;
        }
        if (rows.length > 0) {
          index.addContest(rows);
          indexedContests++;
        }
      }
      index.finalize();
      const ist = index.stats();
      process.stdout.write(
        `INDEX: enumerated=${contests.length} ratedIndexed=${indexedContests} ` +
          `handles=${ist.handles} totalEntries=${ist.totalEntries} maxEntriesPerHandle=${ist.maxEntries}\n`,
      );

      const rows = await api.getRatingChanges(id);
      const contestTime = rows[0]!.ratingUpdateTimeSeconds;
      const naive = process.env.CRP_NAIVE === '1';
      const fn = naive ? computeRatingChanges : computeRatingChangesFast;

      const kEffOf = (handle: string): number => index.effectiveK(handle, contestTime);

      // 调试：dump 前若干成熟用户(k>=6, 无 boost) 的 myCalcDelta vs actualCalcDelta。
      {
        const pre = fn(
          rows.map((r) => ({
            party: r.handle,
            rank: r.rank,
            rating: displayToCalc(r.oldRating, kEffOf(r.handle)),
          })),
        );
        const m = new Map(pre.map((c) => [c.party, c.delta]));
        let d2 = 0;
        for (const r of rows) {
          if (index.priorCount(r.handle, contestTime) >= 6) {
            const my = m.get(r.handle)!;
            const act = r.newRating - r.oldRating;
            process.stdout.write(
              `  k>=6 ${r.handle}: old=${r.oldRating} rank=${r.rank} myDelta=${my} actDelta=${act} diff=${my - act}\n`,
            );
            if (++d2 >= 8) break;
          }
        }
      }

      const contestants: Contestant[] = rows.map((r) => {
        const k = kEffOf(r.handle);
        return { party: r.handle, rank: r.rank, rating: displayToCalc(r.oldRating, k) };
      });
      const changes = fn(contestants);
      const byParty = new Map(changes.map((c) => [c.party, c]));

      // 按 oldRating 分档统计 signed/abs 误差与精确率。
      const bands: { label: string; lo: number; hi: number }[] = [
        { label: '   <800', lo: -10000, hi: 799 },
        { label: '800-1199', lo: 800, hi: 1199 },
        { label: '1200-1599', lo: 1200, hi: 1599 },
        { label: '1600-1899', lo: 1600, hi: 1899 },
        { label: '1900-2099', lo: 1900, hi: 2099 },
        { label: '2100-2399', lo: 2100, hi: 2399 },
        { label: '  >=2400', lo: 2400, hi: 100000 },
      ];
      const stats = bands.map((b) => ({ ...b, n: 0, exact: 0, sumSigned: 0, sumAbs: 0 }));
      const kStats = { newN: 0, newExact: 0, matureN: 0, matureExact: 0 };

      for (const r of rows) {
        const k = kEffOf(r.handle);
        const ch = byParty.get(r.handle)!;
        const predDisplay = calcToDisplay(ch.newRating, k + 1);
        const signed = predDisplay - r.newRating;
        for (const s of stats) {
          if (r.oldRating >= s.lo && r.oldRating <= s.hi) {
            s.n++;
            s.sumSigned += signed;
            s.sumAbs += Math.abs(signed);
            if (signed === 0) s.exact++;
            break;
          }
        }
        if (k < 6) {
          kStats.newN++;
          if (signed === 0) kStats.newExact++;
        } else {
          kStats.matureN++;
          if (signed === 0) kStats.matureExact++;
        }
      }

      let sumPred = 0;
      let sumActual = 0;
      let sumMyCalcDelta = 0;
      let sumMyBoost = 0;
      const offsets = [1400, 900, 550, 300, 150, 50, 0];
      const off = (kk: number): number => offsets[Math.min(kk, 6)]!;
      for (const r of rows) {
        const k = kEffOf(r.handle);
        const ch = byParty.get(r.handle)!;
        sumPred += calcToDisplay(ch.newRating, k + 1) - r.oldRating;
        sumActual += r.newRating - r.oldRating;
        sumMyCalcDelta += ch.delta;
        sumMyBoost += off(k) - off(k + 1);
      }
      process.stdout.write(
        `DEBUG sumPredDelta=${sumPred} sumActualDelta=${sumActual} ` +
          `meanPred=${(sumPred / rows.length).toFixed(2)} meanActual=${(sumActual / rows.length).toFixed(2)}\n` +
          `DEBUG sumMyCalcDelta=${sumMyCalcDelta} sumMyBoost=${sumMyBoost} n=${rows.length}\n`,
      );
      process.stdout.write(`diag contest ${id} (n=${rows.length}, algo=${naive ? 'naive' : 'fast'})\n`);
      process.stdout.write(`band        n     exact%   meanSigned  meanAbs\n`);
      for (const s of stats) {
        if (s.n === 0) continue;
        process.stdout.write(
          `${s.label}  ${String(s.n).padStart(6)}  ${((s.exact / s.n) * 100).toFixed(1).padStart(6)}  ` +
            `${(s.sumSigned / s.n).toFixed(2).padStart(10)}  ${(s.sumAbs / s.n).toFixed(2).padStart(7)}\n`,
        );
      }
      process.stdout.write(
        `k<6:    n=${kStats.newN} exact=${kStats.newN ? ((kStats.newExact / kStats.newN) * 100).toFixed(1) : '-'}%\n` +
          `k>=6:   n=${kStats.matureN} exact=${kStats.matureN ? ((kStats.matureExact / kStats.matureN) * 100).toFixed(1) : '-'}%\n`,
      );
      break;
    }
    case 'diagperfect': {
      // 用 user.rating 为该场所有选手取“完美 k + 是否新体系”，验证算法在零 k 误差下的精度。
      const id = Number(target);
      if (!Number.isInteger(id) || id <= 0) throw new Error(`invalid contest id: ${target}`);
      const NEW_SYSTEM = Math.floor(Date.parse('2020-05-01T00:00:00Z') / 1000);
      const rows = await api.getRatingChanges(id);
      const contestTime = rows[0]!.ratingUpdateTimeSeconds;
      const naive = process.env.CRP_NAIVE === '1';
      const fn = naive ? computeRatingChanges : computeRatingChangesFast;

      const kEffMap = new Map<string, number>();
      let done = 0;
      for (const r of rows) {
        const hist = await api.getUserRating(r.handle);
        const before = hist.filter((h) => h.ratingUpdateTimeSeconds < contestTime);
        const trueK = before.length;
        const newSystem =
          hist.length > 0 ? hist[0]!.oldRating === 0 && hist[0]!.ratingUpdateTimeSeconds >= NEW_SYSTEM : false;
        kEffMap.set(r.handle, newSystem ? trueK : 6);
        if (++done % 500 === 0) process.stdout.write(`  fetched ${done}/${rows.length}\n`);
      }

      const validRows = rows.filter((r) => r.newRating !== 0);
      const contestants: Contestant[] = validRows.map((r) => ({
        party: r.handle,
        rank: r.rank,
        rating: displayToCalc(r.oldRating, kEffMap.get(r.handle)!),
      }));
      const changes = fn(contestants);
      const byParty = new Map(changes.map((c) => [c.party, c]));
      let exact = 0;
      let sumAbs = 0;
      let sumSigned = 0;
      for (const r of validRows) {
        const k = kEffMap.get(r.handle)!;
        const pred = calcToDisplay(byParty.get(r.handle)!.newRating, k + 1);
        const e = pred - r.newRating;
        if (e === 0) exact++;
        sumAbs += Math.abs(e);
        sumSigned += e;
      }
      const nn = validRows.length;
      process.stdout.write(
        `diagperfect ${id}: n=${nn} exact=${((exact / nn) * 100).toFixed(1)}% ` +
          `meanAbs=${(sumAbs / nn).toFixed(2)} meanSigned=${(sumSigned / nn).toFixed(2)}\n`,
      );
      break;
    }
    case 'checkk': {
      const id = Number(target);
      if (!Number.isInteger(id) || id <= 0) throw new Error(`invalid contest id: ${target}`);
      const NEW_SYSTEM = Math.floor(Date.parse('2020-05-01T00:00:00Z') / 1000);

      // 建索引（缓存）
      const contests = await listFinishedContests(api, INDEX_FROM, NOW_SEC);
      const index = new ParticipationIndex();
      for (const meta of contests) {
        let rs;
        try {
          rs = await api.getRatingChanges(meta.id);
        } catch {
          continue;
        }
        if (rs.length > 0) index.addContest(rs);
      }
      index.finalize();

      const rows = await api.getRatingChanges(id);
      const contestTime = rows[0]!.ratingUpdateTimeSeconds;
      // 抽样 ~40 个用户，用 user.rating 取真实 k 对比索引 k
      const sample = Math.max(1, Math.floor(rows.length / 40));
      let mismatches = 0;
      let checked = 0;
      let preNew = 0;
      for (let i = 0; i < rows.length; i += sample) {
        const r = rows[i]!;
        const hist = await api.getUserRating(r.handle);
        const trueK = hist.filter((h) => h.ratingUpdateTimeSeconds < contestTime).length;
        const idxK = index.priorCount(r.handle, contestTime);
        const firstTime = hist.length > 0 ? hist[0]!.ratingUpdateTimeSeconds : contestTime;
        const isPreNew = firstTime < NEW_SYSTEM;
        if (isPreNew) preNew++;
        checked++;
        if (trueK !== idxK || (isPreNew && idxK < 6)) {
          mismatches++;
          process.stdout.write(
            `  ${r.handle}: idxK=${idxK} trueK=${trueK} firstBefore2020-05=${isPreNew} old=${r.oldRating}\n`,
          );
        }
      }
      process.stdout.write(
        `checkk ${id}: checked=${checked} mismatches=${mismatches} preNewSystem=${preNew}\n`,
      );
      break;
    }
    default:
      process.stdout.write(
        'usage: crp <fetch|validate|fetch-all|validate-all|diag|checkk> [contestId|sample]\n',
      );
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
