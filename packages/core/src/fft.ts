/** 原地迭代 radix-2 FFT。re/im 长度必须为 2 的幂。 */
function fftInPlace(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (invert ? 1 : -1);
    const wpr = Math.cos(ang);
    const wpi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const xr = re[i + k + half]!;
        const xi = im[i + k + half]!;
        const vr = xr * wr - xi * wi;
        const vi = xr * wi + xi * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nwr;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i]! /= n;
      im[i]! /= n;
    }
  }
}

/** 实数线性卷积，返回长度 a.length + b.length - 1。 */
export function convolveReal(a: Float64Array, b: Float64Array): Float64Array {
  const resultLen = a.length + b.length - 1;
  let n = 1;
  while (n < resultLen) n <<= 1;
  const are = new Float64Array(n);
  const aim = new Float64Array(n);
  const bre = new Float64Array(n);
  const bim = new Float64Array(n);
  are.set(a);
  bre.set(b);
  fftInPlace(are, aim, false);
  fftInPlace(bre, bim, false);
  for (let i = 0; i < n; i++) {
    const r = are[i]! * bre[i]! - aim[i]! * bim[i]!;
    const im2 = are[i]! * bim[i]! + aim[i]! * bre[i]!;
    are[i] = r;
    aim[i] = im2;
  }
  fftInPlace(are, aim, true);
  const out = new Float64Array(resultLen);
  for (let i = 0; i < resultLen; i++) out[i] = are[i]!;
  return out;
}
