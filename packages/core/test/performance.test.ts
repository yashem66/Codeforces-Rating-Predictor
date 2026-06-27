import { describe, it, expect } from 'vitest';
import { performanceRating } from '../src/performance.js';

describe('performanceRating', () => {
  it('名次居中时，表现分落在对手 rating 范围内', () => {
    const others = [1000, 1200, 1400, 1600, 1800];
    const perf = performanceRating(3, others);
    expect(perf).toBeGreaterThan(1000);
    expect(perf).toBeLessThan(1800);
  });

  it('名次越好表现分越高（单调）', () => {
    const others = [1000, 1200, 1400, 1600, 1800];
    expect(performanceRating(1, others)).toBeGreaterThan(performanceRating(5, others));
  });
});
