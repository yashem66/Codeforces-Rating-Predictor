import { describe, it, expect } from 'vitest';
import { offsetForContestCount, displayToCalc, calcToDisplay } from '../src/newAccount.js';

describe('offsetForContestCount', () => {
  it('按已完成 rated 场次返回偏移：[1400,900,550,300,150,50]，>=6 为 0', () => {
    expect(offsetForContestCount(0)).toBe(1400);
    expect(offsetForContestCount(1)).toBe(900);
    expect(offsetForContestCount(2)).toBe(550);
    expect(offsetForContestCount(3)).toBe(300);
    expect(offsetForContestCount(4)).toBe(150);
    expect(offsetForContestCount(5)).toBe(50);
    expect(offsetForContestCount(6)).toBe(0);
    expect(offsetForContestCount(20)).toBe(0);
  });
});

describe('display<->calc 换算', () => {
  it('全新账号（k=0）：显示 0 对应计算分 1400', () => {
    expect(displayToCalc(0, 0)).toBe(1400);
  });

  it('成熟账号（k>=6）：显示分即计算分', () => {
    expect(displayToCalc(1873, 6)).toBe(1873);
    expect(calcToDisplay(1873, 6)).toBe(1873);
  });

  it('官方示例链路：k=0 赛后 calc=1400+d1，显示应为 500+d1', () => {
    const d1 = 123;
    const calcNew = 1400 + d1;
    expect(calcToDisplay(calcNew, 1)).toBe(500 + d1);
  });
});
