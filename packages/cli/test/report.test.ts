import { describe, it, expect } from 'vitest';
import { formatReport, aggregate } from '../src/report.js';
import type { ContestReport } from '../src/validate.js';

function report(over: Partial<ContestReport>): ContestReport {
  return {
    n: 100,
    exactRate: 0.99,
    meanAbsError: 0.1,
    medianAbsError: 0,
    maxAbsError: 2,
    worst: [],
    ...over,
  };
}

describe('formatReport', () => {
  it('输出包含关键指标的可读文本', () => {
    const text = formatReport(1623, report({}));
    expect(text).toContain('1623');
    expect(text).toContain('exactRate');
  });
});

describe('aggregate', () => {
  it('按参赛人数加权汇总 exactRate', () => {
    const agg = aggregate([
      { contestId: 1, report: report({ n: 100, exactRate: 1 }) },
      { contestId: 2, report: report({ n: 100, exactRate: 0 }) },
    ]);
    expect(agg.totalN).toBe(200);
    expect(agg.weightedExactRate).toBeCloseTo(0.5, 12);
  });
});
