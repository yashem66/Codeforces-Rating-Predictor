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

const INDEX_FROM = Math.floor(
  Date.parse(process.env.CRP_INDEX_FROM ?? '2020-05-01T00:00:00Z') / 1000,
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
      for (const meta of contests) {
        let rows;
        try {
          rows = await api.getRatingChanges(meta.id);
        } catch {
          continue;
        }
        if (rows.length > 0) index.addContest(rows);
      }
      index.finalize();

      const rows = await api.getRatingChanges(id);
      const contestTime = rows[0]!.ratingUpdateTimeSeconds;
      const naive = process.env.CRP_NAIVE === '1';
      const fn = naive ? computeRatingChanges : computeRatingChangesFast;

      const contestants: Contestant[] = rows.map((r) => {
        const k = index.priorCount(r.handle, contestTime);
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
        const k = index.priorCount(r.handle, contestTime);
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
    default:
      process.stdout.write(
        'usage: crp <fetch|validate|fetch-all|validate-all|diag> [contestId|sample]\n',
      );
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
