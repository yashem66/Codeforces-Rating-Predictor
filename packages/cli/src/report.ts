import type { ContestReport } from './validate.js';

export function formatReport(contestId: number, r: ContestReport): string {
  const lines = [
    `Contest ${contestId}: n=${r.n}`,
    `  exactRate     = ${(r.exactRate * 100).toFixed(2)}%`,
    `  meanAbsError  = ${r.meanAbsError.toFixed(3)}`,
    `  medianAbsError= ${r.medianAbsError}`,
    `  maxAbsError   = ${r.maxAbsError}`,
  ];
  if (r.worst.length > 0) {
    lines.push('  worst:');
    for (const m of r.worst.slice(0, 5)) {
      lines.push(
        `    ${m.handle} rank=${m.rank} k=${m.priorCount} pred=${m.predictedNewRating} actual=${m.actualNewRating} |err|=${m.absError}`,
      );
    }
  }
  return lines.join('\n');
}

export interface AggregateResult {
  totalN: number;
  weightedExactRate: number;
  maxAbsError: number;
}

export function aggregate(
  items: { contestId: number; report: ContestReport }[],
): AggregateResult {
  let totalN = 0;
  let exactSum = 0;
  let maxAbsError = 0;
  for (const { report } of items) {
    totalN += report.n;
    exactSum += report.exactRate * report.n;
    maxAbsError = Math.max(maxAbsError, report.maxAbsError);
  }
  return {
    totalN,
    weightedExactRate: totalN === 0 ? 1 : exactSum / totalN,
    maxAbsError,
  };
}
