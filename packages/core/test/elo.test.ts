import { describe, it, expect } from 'vitest';
import { winProbability, seedAgainst } from '../src/elo.js';

describe('winProbability', () => {
  it('两人 rating 相同时为 0.5', () => {
    expect(winProbability(1500, 1500)).toBeCloseTo(0.5, 12);
  });

  it('rating 高 400 分约 0.909 胜率', () => {
    // P(I beats J) = 1 / (1 + 10^((rJ - rI)/400)); rI=1900, rJ=1500
    expect(winProbability(1900, 1500)).toBeCloseTo(1 / (1 + Math.pow(10, -1)), 12);
  });

  it('对称性：P(a,b) + P(b,a) = 1', () => {
    expect(winProbability(1700, 1300) + winProbability(1300, 1700)).toBeCloseTo(1, 12);
  });
});

describe('seedAgainst', () => {
  it('对手为空时 seed 为 1（期望第 1 名）', () => {
    expect(seedAgainst(1500, [])).toBeCloseTo(1, 12);
  });

  it('一个等分对手贡献 0.5，seed = 1.5', () => {
    expect(seedAgainst(1500, [1500])).toBeCloseTo(1.5, 12);
  });

  it('对手更强时 seed 增大（期望名次更靠后）', () => {
    const weak = seedAgainst(1500, [2000, 2000]);
    const strong = seedAgainst(2500, [2000, 2000]);
    expect(weak).toBeGreaterThan(strong);
  });
});
