import { describe, it, expect } from 'vitest';
import { convolveReal } from '../src/fft.js';

function naiveConv(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j]! += a[i]! * b[j]!;
  return out;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('convolveReal', () => {
  it('与朴素卷积一致（小整数）', () => {
    const a = Float64Array.from([1, 2, 3]);
    const b = Float64Array.from([4, 5, 6]);
    const got = Array.from(convolveReal(a, b));
    const exp = naiveConv([1, 2, 3], [4, 5, 6]);
    expect(got.length).toBe(exp.length);
    for (let i = 0; i < exp.length; i++) expect(got[i]!).toBeCloseTo(exp[i]!, 6);
  });

  it('与朴素卷积一致（随机浮点，长度非 2 幂）', () => {
    const rng = mulberry32(42);
    const a = Float64Array.from({ length: 50 }, () => rng());
    const b = Float64Array.from({ length: 37 }, () => rng());
    const got = Array.from(convolveReal(a, b));
    const exp = naiveConv(Array.from(a), Array.from(b));
    for (let i = 0; i < exp.length; i++) expect(got[i]!).toBeCloseTo(exp[i]!, 6);
  });
});
