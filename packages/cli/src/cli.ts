#!/usr/bin/env tsx
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CodeforcesApi } from './api.js';
import { JsonCache } from './cache.js';
import { SAMPLE_CONTEST_IDS, fetchContestData } from './dataset.js';
import { validateContest, type ContestReport } from './validate.js';
import { aggregate, formatReport } from './report.js';
import { listFinishedContests } from './contests.js';
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
        await fetchContestData(api, id);
      }
      process.stdout.write(`done: cached ${ids.length} contests\n`);
      break;
    }
    case 'validate': {
      const ids = parseTargets(target);
      const items: { contestId: number; report: ContestReport }[] = [];
      for (const id of ids) {
        const { rows, priorCounts } = await fetchContestData(api, id);
        const report = validateContest(rows, priorCounts);
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
        const rows = await api.getRatingChanges(meta.id);
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
    default:
      process.stdout.write(
        'usage: crp <fetch|validate|fetch-all|validate-all> [contestId|sample]\n',
      );
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
