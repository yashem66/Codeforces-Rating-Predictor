# Codeforces Rating Predictor 核心算法 + 离线验证 + 基建 实现计划

> 2026-06-29 刷新说明：这是历史执行计划，不是最新任务清单。当前实现和命令以 `README.md`、
> `docs/algorithm.md`、`docs/cli.md`、`docs/development.md` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个 TypeScript monorepo，实现可复用的 Codeforces rating 预测算法核心包，并用真实比赛数据离线验证其准确度，同时补齐工程基建与 Cursor Agent 文件。

**Architecture:** `packages/core` 是零 I/O 纯函数算法库（在“计算分/1400 基准”空间运算，含显示分↔计算分换算、两步通胀修正）。算法有两条等价实现：朴素 O(N²) 版作为正确性基准与小赛路径；FFT O(N log N) 版用于全量大赛。`packages/cli` 是 Node 工具，负责枚举/抓取 `contest.ratingChanges`、缓存到磁盘、从全量语料构建“全局参赛索引”反推每人赛前场次 k、调用 core、与官方真值对比并输出误差报告。当前 core 已提供 `performanceRating`，升档 delta 仍需后续 API 设计。

**Scope:** 本计划包含**全量验证**——当前实现默认枚举 2020-01 起的全部 rated 比赛建立 k 索引，并验证 2022-01 至今全部 rated 个人赛（窗口可配置、可按评分机制变动缩小）。

**Tech Stack:** pnpm workspaces、TypeScript（strict）、Vitest、tsx、ESLint、Prettier、GitHub Actions、Node ≥ 18（内置 fetch）；自实现 FFT 卷积。

---

## 关键约定（所有任务通用）

- 所有 rating 计算在 **计算分**（calculation rating，新账号 1400 基准）空间进行。API 返回的是 **显示分**，由 CLI 在喂给 core 前换算。
- 整数算术与截断：CF 参考实现用整数除法向零截断。TS 中对应位置一律用 `Math.trunc`，务必与下文代码一致，否则会出现 ±1 误差。
- 提交信息使用 Conventional Commits（`feat:` / `test:` / `chore:` / `docs:`）。
- 测试命令统一用 pnpm filter：`pnpm --filter @crp/core test`、`pnpm --filter @crp/cli test`。
- 注意：本仓库当前 `AGENTS.md` 要求所有 Shell 命令带 `required_permissions: ["all"]`；不要在 `no exit status`
  上排查终端集成问题。

---

## Task 0: 根 monorepo 脚手架

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.prettierrc.json`
- Create: `eslint.config.js`

- [ ] **Step 1: 创建 `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: 创建根 `package.json`**

```json
{
  "name": "codeforces-rating-predictor",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {}
}
```

- [ ] **Step 3: 创建 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: 创建 `.gitignore`**

```gitignore
node_modules/
dist/
*.tsbuildinfo
data/
.DS_Store
coverage/
```

- [ ] **Step 5: 创建 `.editorconfig`**

```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- [ ] **Step 6: 创建 `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 7: 创建 `eslint.config.js`（flat config，最小可用）**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

- [ ] **Step 8: 安装根开发依赖**

Run: `pnpm add -Dw typescript typescript-eslint @eslint/js eslint prettier vitest tsx`
Expected: 命令成功，根 `package.json` 的 `devDependencies` 被填入真实版本号，生成 `pnpm-lock.yaml`。

- [ ] **Step 9: 提交**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .editorconfig .prettierrc.json eslint.config.js pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with ts/eslint/prettier/vitest"
```

---

## Task 1: `@crp/core` 包脚手架与类型

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: 创建 `packages/core/package.json`**

```json
{
  "name": "@crp/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 2: 创建 `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/core/src/types.ts`**

```ts
/** 一名参赛者（喂给算法时 rating 必须是“计算分”，即 1400 基准）。 */
export interface Contestant {
  /** 选手标识（handle）。 */
  party: string;
  /** 实际名次，1-based；并列者共享相同名次值。 */
  rank: number;
  /** 计算分（calculation rating）。 */
  rating: number;
}

/** 单名参赛者的 rating 变化结果（均为计算分空间）。 */
export interface RatingChange {
  party: string;
  rank: number;
  oldRating: number;
  delta: number;
  newRating: number;
}
```

- [ ] **Step 4: 创建占位 `packages/core/src/index.ts`**

```ts
export * from './types.js';
```

- [ ] **Step 5: 验证类型检查通过**

Run: `pnpm --filter @crp/core typecheck`
Expected: 无错误退出。

- [ ] **Step 6: 提交**

```bash
git add packages/core
git commit -m "feat(core): scaffold @crp/core package and core types"
```

---

## Task 2: Elo 概率与 seed（TDD）

**Files:**

- Create: `packages/core/src/elo.ts`
- Test: `packages/core/test/elo.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 写失败测试 `packages/core/test/elo.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/core test`
Expected: FAIL，提示找不到模块 `../src/elo.js` / 导出未定义。

- [ ] **Step 3: 实现 `packages/core/src/elo.ts`**

```ts
/**
 * 选手 I 比选手 J 取得更好成绩的概率：
 * P = 1 / (1 + 10^((ratingJ - ratingI) / 400))
 */
export function winProbability(ratingI: number, ratingJ: number): number {
  return 1 / (1 + Math.pow(10, (ratingJ - ratingI) / 400));
}

/**
 * 给定 rating 的选手，在一组对手 ratings 中的期望名次（seed）：
 * seed = 1 + Σ P(对手胜过我) = 1 + Σ winProbability(对手, 我)
 * 注意：otherRatings 不包含选手本人。
 */
export function seedAgainst(rating: number, otherRatings: number[]): number {
  let s = 1;
  for (const other of otherRatings) {
    s += winProbability(other, rating);
  }
  return s;
}
```

- [ ] **Step 4: 在 index 导出**

将 `packages/core/src/index.ts` 改为：

```ts
export * from './types.js';
export * from './elo.js';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @crp/core test`
Expected: PASS，全部用例通过。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/elo.ts packages/core/test/elo.test.ts packages/core/src/index.ts
git commit -m "feat(core): add elo win probability and seed"
```

---

## Task 3: 新账号显示分↔计算分换算（TDD）

**Files:**

- Create: `packages/core/src/newAccount.ts`
- Test: `packages/core/test/newAccount.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 写失败测试 `packages/core/test/newAccount.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/core test`
Expected: FAIL，提示找不到 `../src/newAccount.js`。

- [ ] **Step 3: 实现 `packages/core/src/newAccount.ts`**

```ts
/**
 * 2020 新账号规则：计算分从 1400 起，显示分从 0 起；
 * 前 6 场显示分额外叠加 500/350/250/150/100/50（合计 1400）。
 * 下表是“计算分 − 显示分”的偏移，按【已完成 rated 场次 k】索引。
 */
export const NEW_ACCOUNT_OFFSETS = [1400, 900, 550, 300, 150, 50] as const;

/** 已完成 k 场 rated 比赛时，计算分相对显示分的偏移；k>=6 为 0。 */
export function offsetForContestCount(k: number): number {
  if (k < 0) throw new Error(`contest count must be >= 0, got ${k}`);
  return k >= NEW_ACCOUNT_OFFSETS.length ? 0 : NEW_ACCOUNT_OFFSETS[k]!;
}

/** 显示分 -> 计算分（k = 本场之前已完成的 rated 场次）。 */
export function displayToCalc(display: number, k: number): number {
  return display + offsetForContestCount(k);
}

/** 计算分 -> 显示分（k = 截至该计算分时已完成的 rated 场次）。 */
export function calcToDisplay(calc: number, k: number): number {
  return calc - offsetForContestCount(k);
}
```

- [ ] **Step 4: 在 index 导出**

将 `packages/core/src/index.ts` 改为：

```ts
export * from './types.js';
export * from './elo.js';
export * from './newAccount.js';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @crp/core test`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/newAccount.ts packages/core/test/newAccount.test.ts packages/core/src/index.ts
git commit -m "feat(core): add new-account display/calc rating conversion"
```

---

## Task 4: 核心评分变化算法 `computeRatingChanges`（TDD）

**Files:**

- Create: `packages/core/src/rating.ts`
- Test: `packages/core/test/rating.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 写失败测试 `packages/core/test/rating.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeRatingChanges } from '../src/rating.js';
import type { Contestant } from '../src/types.js';

function makeField(): Contestant[] {
  // 6 名成熟选手，名次与 rating 高度正相关 + 一个“爆发/翻车”反例
  return [
    { party: 'a', rank: 1, rating: 2000 },
    { party: 'b', rank: 2, rating: 1800 },
    { party: 'c', rank: 3, rating: 1600 },
    { party: 'd', rank: 4, rating: 1400 },
    { party: 'e', rank: 5, rating: 1200 },
    { party: 'f', rank: 6, rating: 1000 },
  ];
}

describe('computeRatingChanges', () => {
  it('返回与输入等长、字段完整的结果', () => {
    const res = computeRatingChanges(makeField());
    expect(res).toHaveLength(6);
    for (const r of res) {
      expect(r.newRating).toBe(r.oldRating + r.delta);
    }
  });

  it('整体 delta 之和为非正（通胀控制）', () => {
    const sum = computeRatingChanges(makeField()).reduce((s, r) => s + r.delta, 0);
    expect(sum).toBeLessThanOrEqual(0);
  });

  it('同样 old rating 下，名次更好者 delta 不更差（单调性）', () => {
    const field: Contestant[] = [
      { party: 'p1', rank: 1, rating: 1500 },
      { party: 'p2', rank: 2, rating: 1500 },
      { party: 'p3', rank: 3, rating: 1500 },
      { party: 'p4', rank: 4, rating: 1500 },
    ];
    const res = computeRatingChanges(field);
    const byParty = Object.fromEntries(res.map((r) => [r.party, r.delta]));
    expect(byParty.p1!).toBeGreaterThanOrEqual(byParty.p2!);
    expect(byParty.p2!).toBeGreaterThanOrEqual(byParty.p3!);
    expect(byParty.p3!).toBeGreaterThanOrEqual(byParty.p4!);
  });

  it('远超 seed 的选手 delta 为正，远不及的为负', () => {
    // 一个 1000 分选手拿了第 1，应大涨；一个 2000 分选手垫底，应下跌
    const field: Contestant[] = [
      { party: 'rocket', rank: 1, rating: 1000 },
      { party: 'mid1', rank: 2, rating: 1500 },
      { party: 'mid2', rank: 3, rating: 1500 },
      { party: 'flop', rank: 4, rating: 2000 },
    ];
    const res = computeRatingChanges(field);
    const byParty = Object.fromEntries(res.map((r) => [r.party, r.delta]));
    expect(byParty.rocket!).toBeGreaterThan(0);
    expect(byParty.flop!).toBeLessThan(0);
  });

  it('并列名次：相同 rank 不同 rating 时，rating 低者 delta 更高', () => {
    const field: Contestant[] = [
      { party: 'x', rank: 1, rating: 1500 },
      { party: 'tieHigh', rank: 2, rating: 1800 },
      { party: 'tieLow', rank: 2, rating: 1200 },
      { party: 'y', rank: 4, rating: 1500 },
    ];
    const res = computeRatingChanges(field);
    const byParty = Object.fromEntries(res.map((r) => [r.party, r.delta]));
    expect(byParty.tieLow!).toBeGreaterThan(byParty.tieHigh!);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/core test`
Expected: FAIL，提示找不到 `../src/rating.js`。

- [ ] **Step 3: 实现 `packages/core/src/rating.ts`**

```ts
import { winProbability } from './elo.js';
import type { Contestant, RatingChange } from './types.js';

/** 计算给定 rating 在“除 excludeIndex 之外”的对手中的 seed（期望名次）。 */
function getSeed(rating: number, ratings: number[], excludeIndex: number): number {
  let s = 1;
  for (let j = 0; j < ratings.length; j++) {
    if (j === excludeIndex) continue;
    s += winProbability(ratings[j]!, rating);
  }
  return s;
}

/** 二分查找使 seed(R) == targetSeed 的整数 rating R（seed 关于 rating 单调递减）。 */
function searchRating(targetSeed: number, ratings: number[], excludeIndex: number): number {
  let lo = 1;
  let hi = 8000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (getSeed(mid, ratings, excludeIndex) < targetSeed) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return lo;
}

/**
 * 复现 Codeforces 当前评分算法（计算分空间）：
 * 1) 每人 seed_i（对手为其余全体）；
 * 2) m_i = sqrt(seed_i * rank_i)；
 * 3) 二分表现分 R_i 使 seed(R_i) = m_i；d_i = trunc((R_i - r_i) / 2)；
 * 4) 修正①：inc = trunc(-Σd/n) - 1，全员加；
 * 5) 修正②：取按 rating 降序前 s=min(n, round(4√n)) 人，inc = clamp(trunc(-Σd_s/s), -10, 0)，全员加。
 */
export function computeRatingChanges(contestants: Contestant[]): RatingChange[] {
  const n = contestants.length;
  if (n === 0) return [];

  const ratings = contestants.map((c) => c.rating);
  const deltas = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const seedI = getSeed(ratings[i]!, ratings, i);
    const midRank = Math.sqrt(seedI * contestants[i]!.rank);
    const r = searchRating(midRank, ratings, i);
    deltas[i] = Math.trunc((r - ratings[i]!) / 2);
  }

  // 修正①：使 Σd 接近 0 且非正
  {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += deltas[i]!;
    const inc = Math.trunc(-sum / n) - 1;
    for (let i = 0; i < n; i++) deltas[i]! += inc;
  }

  // 修正②：高分组总变化下调不超过约 10 分
  {
    const order = [...Array(n).keys()].sort((a, b) => ratings[b]! - ratings[a]!);
    const s = Math.min(n, Math.round(4 * Math.sqrt(n)));
    let sum = 0;
    for (let t = 0; t < s; t++) sum += deltas[order[t]!]!;
    const inc = Math.min(Math.max(Math.trunc(-sum / s), -10), 0);
    for (let i = 0; i < n; i++) deltas[i]! += inc;
  }

  return contestants.map((c, i) => ({
    party: c.party,
    rank: c.rank,
    oldRating: c.rating,
    delta: deltas[i]!,
    newRating: c.rating + deltas[i]!,
  }));
}
```

- [ ] **Step 4: 在 index 导出**

将 `packages/core/src/index.ts` 改为：

```ts
export * from './types.js';
export * from './elo.js';
export * from './newAccount.js';
export * from './rating.js';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @crp/core test`
Expected: PASS，全部用例通过。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/rating.ts packages/core/test/rating.test.ts packages/core/src/index.ts
git commit -m "feat(core): implement computeRatingChanges (CF rating algorithm)"
```

---

## Task 5: performanceRating（为未来直播预留，TDD）

**Files:**

- Create: `packages/core/src/performance.ts`
- Test: `packages/core/test/performance.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 写失败测试 `packages/core/test/performance.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { performanceRating } from '../src/performance.js';

describe('performanceRating', () => {
  it('名次居中时，表现分接近对手 rating 中位区间', () => {
    const others = [1000, 1200, 1400, 1600, 1800];
    // 取得正中间名次（3）时，表现分应落在对手 rating 范围内
    const perf = performanceRating(3, others);
    expect(perf).toBeGreaterThan(1000);
    expect(perf).toBeLessThan(1800);
  });

  it('名次越好表现分越高（单调）', () => {
    const others = [1000, 1200, 1400, 1600, 1800];
    expect(performanceRating(1, others)).toBeGreaterThan(performanceRating(5, others));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/core test`
Expected: FAIL，找不到 `../src/performance.js`。

- [ ] **Step 3: 实现 `packages/core/src/performance.ts`**

```ts
import { seedAgainst } from './elo.js';

/**
 * 表现分：在给定对手中，达到目标名次 rank 所需的 rating。
 * 即求 R 使 seedAgainst(R, others) == rank（seed 关于 R 单调递减）。
 * 用于未来直播列“performance”（delta 为 0 时的 rating）。
 */
export function performanceRating(rank: number, otherRatings: number[]): number {
  let lo = 1;
  let hi = 8000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (seedAgainst(mid, otherRatings) < rank) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return lo;
}
```

- [ ] **Step 4: 在 index 导出**

将 `packages/core/src/index.ts` 末尾追加一行：

```ts
export * from './performance.js';
```

最终 `index.ts` 为：

```ts
export * from './types.js';
export * from './elo.js';
export * from './newAccount.js';
export * from './rating.js';
export * from './performance.js';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @crp/core test`
Expected: PASS。

- [ ] **Step 6: 校验整包类型 + 构建**

Run: `pnpm --filter @crp/core typecheck && pnpm --filter @crp/core build`
Expected: 无错误，生成 `packages/core/dist`。

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/performance.ts packages/core/test/performance.test.ts packages/core/src/index.ts
git commit -m "feat(core): add performanceRating for future live mode"
```

---

## Task 6: `@crp/cli` 包脚手架

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/types.ts`

- [ ] **Step 1: 创建 `packages/cli/package.json`**

```json
{
  "name": "@crp/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "crp": "./src/cli.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json",
    "crp": "tsx src/cli.ts"
  },
  "dependencies": {
    "@crp/core": "workspace:*"
  }
}
```

- [ ] **Step 2: 创建 `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/cli/src/types.ts`（CF API 返回结构）**

```ts
/** contest.ratingChanges 的单条记录（CF 返回的是“显示分”）。 */
export interface ApiRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

/** user.rating 的单条历史记录。 */
export interface ApiUserRatingEntry {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

/** contest.list 的单条记录（仅用到部分字段）。 */
export interface ApiContest {
  id: number;
  name: string;
  phase: string;
  type: string;
  startTimeSeconds?: number;
}
```

- [ ] **Step 4: 安装 Node 类型**

Run: `pnpm --filter @crp/cli add -D @types/node`
Expected: 成功写入 devDependency。

- [ ] **Step 5: 校验类型**

Run: `pnpm --filter @crp/cli typecheck`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/types.ts pnpm-lock.yaml
git commit -m "feat(cli): scaffold @crp/cli package and CF API types"
```

---

## Task 7: 磁盘缓存（TDD）

**Files:**

- Create: `packages/cli/src/cache.ts`
- Test: `packages/cli/test/cache.test.ts`

- [ ] **Step 1: 写失败测试 `packages/cli/test/cache.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonCache } from '../src/cache.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crp-cache-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('JsonCache', () => {
  it('miss 时返回 undefined', async () => {
    const cache = new JsonCache(dir);
    expect(await cache.get('nope')).toBeUndefined();
  });

  it('set 后 get 命中，且能跨实例读取', async () => {
    const a = new JsonCache(dir);
    await a.set('k', { value: 42 });
    expect(await a.get<{ value: number }>('k')).toEqual({ value: 42 });

    const b = new JsonCache(dir);
    expect(await b.get<{ value: number }>('k')).toEqual({ value: 42 });
  });

  it('key 中的非法文件名字符被安全转义', async () => {
    const cache = new JsonCache(dir);
    await cache.set('user.rating?handle=a/b:c', [1, 2, 3]);
    expect(await cache.get('user.rating?handle=a/b:c')).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/cache.js`。

- [ ] **Step 3: 实现 `packages/cli/src/cache.ts`**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** 简单的 JSON 磁盘缓存：每个 key 一个文件，存于指定目录。 */
export class JsonCache {
  constructor(private readonly dir: string) {}

  private fileFor(key: string): string {
    const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    return join(this.dir, `${safe}.${hash}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.fileFor(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.fileFor(key), JSON.stringify(value), 'utf8');
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/cache.ts packages/cli/test/cache.test.ts
git commit -m "feat(cli): add JSON disk cache"
```

---

## Task 8: CF API 客户端（限频 + 缓存 + 重试，TDD）

**Files:**

- Create: `packages/cli/src/api.ts`
- Test: `packages/cli/test/api.test.ts`

- [ ] **Step 1: 写失败测试 `packages/cli/test/api.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeforcesApi } from '../src/api.js';
import { JsonCache } from '../src/cache.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crp-api-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('CodeforcesApi.getRatingChanges', () => {
  it('解析 status=OK 的 result，并命中缓存避免二次请求', async () => {
    const payload = {
      status: 'OK',
      result: [
        {
          contestId: 1,
          contestName: 'T',
          handle: 'h',
          rank: 1,
          ratingUpdateTimeSeconds: 100,
          oldRating: 1500,
          newRating: 1530,
        },
      ],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = new CodeforcesApi({ cache: new JsonCache(dir), minIntervalMs: 0 });
    const a = await api.getRatingChanges(1);
    const b = await api.getRatingChanges(1); // 第二次应走缓存

    expect(a).toHaveLength(1);
    expect(a[0]!.handle).toBe('h');
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('status=FAILED 抛出包含 comment 的错误', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'FAILED', comment: 'boom' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new CodeforcesApi({ cache: new JsonCache(dir), minIntervalMs: 0 });
    await expect(api.getRatingChanges(2)).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/api.js`。

- [ ] **Step 3: 实现 `packages/cli/src/api.ts`**

```ts
import type { ApiContest, ApiRatingChange, ApiUserRatingEntry } from './types.js';
import { JsonCache } from './cache.js';

const API_BASE = 'https://codeforces.com/api';

interface ApiOptions {
  cache: JsonCache;
  /** 两次真实请求的最小间隔（毫秒）。默认 2100，遵守 CF 限频。 */
  minIntervalMs?: number;
  /** 最大重试次数（针对限频/5xx）。默认 4。 */
  maxRetries?: number;
}

type ApiResponse<T> = { status: 'OK'; result: T } | { status: 'FAILED'; comment: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class CodeforcesApi {
  private readonly cache: JsonCache;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private lastCallAt = 0;

  constructor(opts: ApiOptions) {
    this.cache = opts.cache;
    this.minIntervalMs = opts.minIntervalMs ?? 2100;
    this.maxRetries = opts.maxRetries ?? 4;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastCallAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  /** 匿名 GET 调用；method 形如 'contest.ratingChanges'，params 为查询参数。 */
  private async call<T>(method: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const cacheKey = `${method}?${qs}`;
    const cached = await this.cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.throttle();
      try {
        const res = await fetch(`${API_BASE}/${method}?${qs}`);
        if (res.status === 503 || res.status === 429) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as ApiResponse<T>;
        if (body.status === 'OK') {
          await this.cache.set(cacheKey, body.result);
          return body.result;
        }
        // 限频类错误重试，其余直接抛出
        if (/limit exceeded/i.test(body.comment)) {
          throw new Error(body.comment);
        }
        throw new Error(`CF API ${method} FAILED: ${body.comment}`);
      } catch (err) {
        lastErr = err;
        const backoff = Math.min(2000 * 2 ** attempt, 30000);
        if (attempt < this.maxRetries) await sleep(backoff);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  getRatingChanges(contestId: number): Promise<ApiRatingChange[]> {
    return this.call<ApiRatingChange[]>('contest.ratingChanges', {
      contestId: String(contestId),
    });
  }

  getUserRating(handle: string): Promise<ApiUserRatingEntry[]> {
    return this.call<ApiUserRatingEntry[]>('user.rating', { handle });
  }

  getContestList(): Promise<ApiContest[]> {
    return this.call<ApiContest[]>('contest.list', { gym: 'false' });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/api.ts packages/cli/test/api.test.ts
git commit -m "feat(cli): add rate-limited, cached Codeforces API client"
```

---

## Task 9: 参赛场次解析 contestCounts（TDD）

**Files:**

- Create: `packages/cli/src/contestCounts.ts`
- Test: `packages/cli/test/contestCounts.test.ts`

- [ ] **Step 1: 写失败测试 `packages/cli/test/contestCounts.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { priorRatedCount } from '../src/contestCounts.js';
import type { ApiUserRatingEntry } from '../src/types.js';

function entry(contestId: number, t: number): ApiUserRatingEntry {
  return {
    contestId,
    contestName: `c${contestId}`,
    handle: 'h',
    rank: 1,
    ratingUpdateTimeSeconds: t,
    oldRating: 0,
    newRating: 0,
  };
}

describe('priorRatedCount', () => {
  const history = [entry(10, 100), entry(20, 200), entry(30, 300)];

  it('目标比赛之前的历史条数即为 k', () => {
    expect(priorRatedCount(history, 300)).toBe(2); // 早于 300 的有 2 场
  });

  it('首战（最早时间）之前 k=0', () => {
    expect(priorRatedCount(history, 100)).toBe(0);
  });

  it('晚于全部历史时 k=历史长度', () => {
    expect(priorRatedCount(history, 999)).toBe(3);
  });

  it('历史无序也能正确计数', () => {
    const shuffled = [entry(30, 300), entry(10, 100), entry(20, 200)];
    expect(priorRatedCount(shuffled, 300)).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/contestCounts.js`。

- [ ] **Step 3: 实现 `packages/cli/src/contestCounts.ts`**

```ts
import type { ApiUserRatingEntry } from './types.js';

/**
 * 给定某 handle 的完整 rating 历史，返回在 ratingUpdateTime 严格早于
 * beforeTimeSeconds 的比赛场次数（即该用户进入目标比赛前已完成的 rated 场次 k）。
 */
export function priorRatedCount(history: ApiUserRatingEntry[], beforeTimeSeconds: number): number {
  let count = 0;
  for (const e of history) {
    if (e.ratingUpdateTimeSeconds < beforeTimeSeconds) count++;
  }
  return count;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/contestCounts.ts packages/cli/test/contestCounts.test.ts
git commit -m "feat(cli): add prior rated contest count resolver"
```

---

## Task 10: 验证流水线 validate（TDD）

**Files:**

- Create: `packages/cli/src/validate.ts`
- Test: `packages/cli/test/validate.test.ts`

说明：`validateContest` 接收“原始显示分记录 + 每个 handle 的赛前场次 k”，完成
显示分→计算分→core→计算分→显示分 的换算并对比，产出每场误差指标。
为可单测，函数把 `computeRatingChanges` 作为依赖注入（默认用 core 实现）。

- [ ] **Step 1: 写失败测试 `packages/cli/test/validate.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { validateContest } from '../src/validate.js';
import type { ApiRatingChange } from '../src/types.js';

function rc(handle: string, rank: number, oldR: number, newR: number): ApiRatingChange {
  return {
    contestId: 1,
    contestName: 'T',
    handle,
    rank,
    ratingUpdateTimeSeconds: 1000,
    oldRating: oldR,
    newRating: newR,
  };
}

describe('validateContest', () => {
  it('当预测与真值完全一致时，maxAbsError=0、exactRate=1', () => {
    const rows = [rc('a', 1, 1500, 1530), rc('b', 2, 1500, 1470)];
    const counts = new Map<string, number>([
      ['a', 10],
      ['b', 10],
    ]);
    // 注入一个“完美预测”的算法：直接返回真值 delta
    const fakeCore = (cs: { party: string; rank: number; rating: number }[]) =>
      cs.map((c) => {
        const truth = rows.find((r) => r.handle === c.party)!;
        const delta = truth.newRating - truth.oldRating;
        return {
          party: c.party,
          rank: c.rank,
          oldRating: c.rating,
          delta,
          newRating: c.rating + delta,
        };
      });

    const report = validateContest(rows, counts, fakeCore);
    expect(report.n).toBe(2);
    expect(report.maxAbsError).toBe(0);
    expect(report.exactRate).toBe(1);
    expect(report.worst).toHaveLength(0);
  });

  it('成熟用户(k>=6)：calc 等于 display，换算不改变输入', () => {
    const rows = [rc('a', 1, 1500, 1530), rc('b', 2, 1500, 1470)];
    const counts = new Map<string, number>([
      ['a', 6],
      ['b', 6],
    ]);
    const seen: number[] = [];
    const spyCore = (cs: { party: string; rank: number; rating: number }[]) => {
      for (const c of cs) seen.push(c.rating);
      return cs.map((c) => ({
        party: c.party,
        rank: c.rank,
        oldRating: c.rating,
        delta: 0,
        newRating: c.rating,
      }));
    };
    validateContest(rows, counts, spyCore);
    expect(seen.sort()).toEqual([1500, 1500]); // 未被偏移
  });

  it('统计 mismatch：预测 newRating 与真值差 5 时计入误差', () => {
    const rows = [rc('a', 1, 1500, 1530)];
    const counts = new Map<string, number>([['a', 10]]);
    const offBy5 = (cs: { party: string; rank: number; rating: number }[]) =>
      cs.map((c) => ({
        party: c.party,
        rank: c.rank,
        oldRating: c.rating,
        delta: 35, // 真值 delta=30，预测 35 -> 显示新分差 5
        newRating: c.rating + 35,
      }));
    const report = validateContest(rows, counts, offBy5);
    expect(report.maxAbsError).toBe(5);
    expect(report.exactRate).toBe(0);
    expect(report.worst[0]!.handle).toBe('a');
    expect(report.worst[0]!.absError).toBe(5);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/validate.js`。

- [ ] **Step 3: 实现 `packages/cli/src/validate.ts`**

```ts
import { computeRatingChanges, displayToCalc, calcToDisplay } from '@crp/core';
import type { Contestant, RatingChange } from '@crp/core';
import type { ApiRatingChange } from './types.js';

export interface Mismatch {
  handle: string;
  rank: number;
  predictedNewRating: number;
  actualNewRating: number;
  absError: number;
  priorCount: number;
}

export interface ContestReport {
  n: number;
  exactRate: number;
  meanAbsError: number;
  medianAbsError: number;
  maxAbsError: number;
  /** 误差最大的若干条（绝对误差降序，最多 20 条）。 */
  worst: Mismatch[];
}

type RatingFn = (contestants: Contestant[]) => RatingChange[];

/**
 * 对单场比赛验证算法：
 * 显示 oldRating --(k, displayToCalc)--> 计算分 -> core -> 计算分 newRating
 *   --((k+1), calcToDisplay)--> 预测显示 newRating，与真值显示 newRating 对比。
 */
export function validateContest(
  rows: ApiRatingChange[],
  priorCounts: Map<string, number>,
  ratingFn: RatingFn = computeRatingChanges,
): ContestReport {
  const contestants: Contestant[] = rows.map((r) => {
    const k = priorCounts.get(r.handle) ?? 6; // 默认按成熟用户处理（偏移 0）
    return { party: r.handle, rank: r.rank, rating: displayToCalc(r.oldRating, k) };
  });

  const changes = ratingFn(contestants);
  const byParty = new Map(changes.map((c) => [c.party, c]));

  const mismatches: Mismatch[] = [];
  for (const r of rows) {
    const k = priorCounts.get(r.handle) ?? 6;
    const change = byParty.get(r.handle)!;
    const predictedDisplay = calcToDisplay(change.newRating, k + 1);
    const absError = Math.abs(predictedDisplay - r.newRating);
    mismatches.push({
      handle: r.handle,
      rank: r.rank,
      predictedNewRating: predictedDisplay,
      actualNewRating: r.newRating,
      absError,
      priorCount: k,
    });
  }

  const errors = mismatches.map((m) => m.absError).sort((a, b) => a - b);
  const n = errors.length;
  const exact = errors.filter((e) => e === 0).length;
  const sum = errors.reduce((s, e) => s + e, 0);
  const median = n === 0 ? 0 : errors[Math.floor((n - 1) / 2)]!;
  const worst = [...mismatches]
    .filter((m) => m.absError > 0)
    .sort((a, b) => b.absError - a.absError)
    .slice(0, 20);

  return {
    n,
    exactRate: n === 0 ? 1 : exact / n,
    meanAbsError: n === 0 ? 0 : sum / n,
    medianAbsError: median,
    maxAbsError: n === 0 ? 0 : errors[n - 1]!,
    worst,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/validate.ts packages/cli/test/validate.test.ts
git commit -m "feat(cli): add contest validation pipeline with error metrics"
```

---

## Task 11: 数据集编排 dataset（样本清单 + 抓取，TDD）

**Files:**

- Create: `packages/cli/src/dataset.ts`
- Test: `packages/cli/test/dataset.test.ts`

- [ ] **Step 1: 写失败测试 `packages/cli/test/dataset.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { SAMPLE_CONTEST_IDS, buildPriorCounts } from '../src/dataset.js';
import type { ApiUserRatingEntry } from '../src/types.js';

describe('SAMPLE_CONTEST_IDS', () => {
  it('是一组非空、去重的正整数 contestId', () => {
    expect(SAMPLE_CONTEST_IDS.length).toBeGreaterThan(0);
    expect(new Set(SAMPLE_CONTEST_IDS).size).toBe(SAMPLE_CONTEST_IDS.length);
    for (const id of SAMPLE_CONTEST_IDS) expect(Number.isInteger(id) && id > 0).toBe(true);
  });
});

describe('buildPriorCounts', () => {
  it('按每个 handle 的历史，统计目标比赛前的场次 k', () => {
    const histories = new Map<string, ApiUserRatingEntry[]>([
      [
        'a',
        [
          {
            contestId: 1,
            contestName: '',
            handle: 'a',
            rank: 1,
            ratingUpdateTimeSeconds: 50,
            oldRating: 0,
            newRating: 0,
          },
          {
            contestId: 2,
            contestName: '',
            handle: 'a',
            rank: 1,
            ratingUpdateTimeSeconds: 150,
            oldRating: 0,
            newRating: 0,
          },
        ],
      ],
      ['b', []],
    ]);
    const counts = buildPriorCounts(histories, 100);
    expect(counts.get('a')).toBe(1); // 仅 t=50 < 100
    expect(counts.get('b')).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/dataset.js`。

- [ ] **Step 3: 实现 `packages/cli/src/dataset.ts`**

```ts
import type { ApiUserRatingEntry } from './types.js';
import { priorRatedCount } from './contestCounts.js';
import { CodeforcesApi } from './api.js';

/**
 * 小样本验证用的比赛清单（2022+，覆盖不同档次/赛制的 rated 个人赛）。
 * 选取兼顾规模与多样性；后续可扩展到全量。
 */
export const SAMPLE_CONTEST_IDS: number[] = [
  1623, // Codeforces Round 763 (Div. 2) 2022-01
  1627, // Educational Codeforces Round 121 2022-01
  1654, // Codeforces Round 778 (Div. 1/2) 2022-03
  1675, // Codeforces Round 787 (Div. 3) 2022-05
  1692, // Codeforces Round 799 (Div. 4) 2022-07
  1716, // Codeforces Round 815 (Div. 2) 2022-08
  1736, // Educational Codeforces Round 135 2022-10
  1830, // Codeforces Round 875 (Div. 1) 2023-05
  1850, // Codeforces Round 886 (Div. 4) 2023-07
  1925, // Codeforces Round 922 (Div. 1) 2024-02
];

/** 用各 handle 的历史构建“赛前场次 k”映射。 */
export function buildPriorCounts(
  histories: Map<string, ApiUserRatingEntry[]>,
  contestTimeSeconds: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [handle, history] of histories) {
    counts.set(handle, priorRatedCount(history, contestTimeSeconds));
  }
  return counts;
}

/**
 * 抓取单场比赛验证所需的全部数据：
 * - contest.ratingChanges（真值 + rank + 显示 oldRating/newRating）
 * - 每个 handle 的 user.rating（用于求 k）
 * 返回 rows 与 priorCounts。所有请求经 api 内部缓存与限频。
 */
export async function fetchContestData(
  api: CodeforcesApi,
  contestId: number,
): Promise<{
  rows: Awaited<ReturnType<CodeforcesApi['getRatingChanges']>>;
  priorCounts: Map<string, number>;
}> {
  const rows = await api.getRatingChanges(contestId);
  if (rows.length === 0) {
    return { rows, priorCounts: new Map() };
  }
  const contestTime = rows[0]!.ratingUpdateTimeSeconds;

  const histories = new Map<string, ApiUserRatingEntry[]>();
  for (const row of rows) {
    if (histories.has(row.handle)) continue;
    const history = await api.getUserRating(row.handle);
    histories.set(row.handle, history);
  }

  return { rows, priorCounts: buildPriorCounts(histories, contestTime) };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 校验类型**

Run: `pnpm --filter @crp/cli typecheck`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add packages/cli/src/dataset.ts packages/cli/test/dataset.test.ts
git commit -m "feat(cli): add sample dataset list and per-contest data fetch"
```

---

## Task 12: CLI 入口接线（fetch / validate / report）

**Files:**

- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/report.ts`
- Test: `packages/cli/test/report.test.ts`

- [ ] **Step 1: 写失败测试 `packages/cli/test/report.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/report.js`。

- [ ] **Step 3: 实现 `packages/cli/src/report.ts`**

```ts
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

export function aggregate(items: { contestId: number; report: ContestReport }[]): AggregateResult {
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 实现 `packages/cli/src/cli.ts`**

```ts
#!/usr/bin/env tsx
import { join } from 'node:path';
import { CodeforcesApi } from './api.js';
import { JsonCache } from './cache.js';
import { SAMPLE_CONTEST_IDS, fetchContestData } from './dataset.js';
import { validateContest } from './validate.js';
import { aggregate, formatReport } from './report.js';

const DATA_DIR = join(process.cwd(), 'data', 'cache');

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
      const items: { contestId: number; report: ReturnType<typeof validateContest> }[] = [];
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
    default:
      process.stdout.write('usage: crp <fetch|validate> [contestId|sample]\n');
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 6: 校验类型**

Run: `pnpm --filter @crp/cli typecheck`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add packages/cli/src/cli.ts packages/cli/src/report.ts packages/cli/test/report.test.ts
git commit -m "feat(cli): wire up fetch/validate commands and report formatting"
```

---

## Task 13: 文档、Cursor Agent 文件与 CI

**Files:**

- Create: `README.md`（覆盖现有单行内容）
- Create: `AGENTS.md`
- Create: `.cursor/rules/project.mdc`
- Create: `docs/algorithm.md`
- Create: `docs/api-notes.md`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 覆盖 `README.md`**

````markdown
# Codeforces Rating Predictor

辅助 Codeforces 竞赛的工具集：核心是 rating 预测算法，目标是为浏览器插件在 Standing
中展示 `Rating` 与 `Pred Rating Delta`。这是当时的 README 草稿；当前项目已包含 Chrome 扩展实现。

## 包结构（pnpm monorepo）

- `packages/core` — 纯算法库（零 I/O），可被 Node 与浏览器复用。
- `packages/cli` — Node 工具：抓取 CF 数据、缓存、跑算法、与官方真值对比并报告误差。

## 快速开始

```bash
pnpm install
pnpm test                       # 跑所有单测
pnpm --filter @crp/cli crp validate sample   # 用样本比赛验证算法准确度
```
````

抓取的原始数据缓存在 `data/`（已 gitignore）。

## 设计与计划

- 设计：`docs/superpowers/specs/2026-06-28-rating-predictor-core-design.md`
- 计划：`docs/superpowers/plans/2026-06-28-rating-predictor-core.md`
- 算法：`docs/algorithm.md` ／ API 现状：`docs/api-notes.md`

````

- [ ] **Step 2: 创建 `AGENTS.md`**

```markdown
# AGENTS

## 项目概览
TypeScript monorepo（pnpm）。`packages/core` 为零 I/O 纯算法库；`packages/cli` 为 Node
数据/验证工具。核心目标：高精度复现 Codeforces rating 计算，并用真实比赛离线验证。

## 常用命令
- 安装：`pnpm install`
- 全部测试：`pnpm test`
- 单包测试：`pnpm --filter @crp/core test` / `pnpm --filter @crp/cli test`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
- 验证算法：`pnpm --filter @crp/cli crp validate sample`

## 约定
- `@crp/core` 必须保持纯函数、零 I/O（不得引入 fs/fetch/node 依赖），以便浏览器复用。
- rating 计算在“计算分（1400 基准）”空间进行；显示分↔计算分换算只在 CLI 边界做。
- 整数算术处用 `Math.trunc`，与 CF 参考实现保持一致。
- TDD：先写失败测试再实现。声明“完成/通过”前必须实际跑过测试。
- 提交用 Conventional Commits。

## 关键资料
- 算法说明与出处见 `docs/algorithm.md`，CF API 现状见 `docs/api-notes.md`。
````

- [ ] **Step 3: 创建 `.cursor/rules/project.mdc`**

```markdown
---
description: 项目级工程约定
alwaysApply: true
---

- `@crp/core` 保持纯函数、零 I/O；不要在 core 中引入 `node:`、`fs`、`fetch`。
- rating 计算统一在“计算分（1400 基准）”空间；显示分↔计算分换算只在 `@crp/cli` 边界进行。
- CF 参考实现使用整数截断除法，对应 TS 代码必须使用 `Math.trunc`。
- 遵循 TDD：先写失败测试，再实现；未实际运行测试前不得声称通过。
- 提交信息使用 Conventional Commits（feat/fix/docs/chore/test）。
```

- [ ] **Step 4: 创建 `docs/algorithm.md`**

```markdown
# Codeforces 评分算法说明

## 公式（计算分空间）

- 胜率：`P(I 胜 J) = 1 / (1 + 10^((rJ - rI) / 400))`
- 期望名次：`seed_i = 1 + Σ_{j≠i} P(j 胜 i)`
- 几何平均：`m_i = sqrt(seed_i * rank_i)`（rank_i 为实际名次，并列共享同名次）
- 表现分：二分 `R_i` 使 `seed(R_i) = m_i`；`d_i = trunc((R_i - r_i) / 2)`
- 修正①：`inc = trunc(-Σd / n) - 1`，全员加
- 修正②：按 rating 降序取前 `s = min(n, round(4√n))` 人，
  `inc = clamp(trunc(-Σd_s / s), -10, 0)`，全员加

## 2020 新账号规则

- 计算分从 1400 起，显示分从 0 起；前 6 场显示分叠加 500/350/250/150/100/50。
- “计算分 − 显示分”偏移（按已完成 rated 场次 k）：`[1400,900,550,300,150,50]`，k≥6 为 0。

## 准确度与已知近似

- 成熟用户（k≥6）应逐人精确命中。
- 残余误差主要来源：并列名次的名次取值约定、取整时机、二分边界、极端低分被 [1,8000] 钳制。
  这些通过 `crp validate` 的最差 mismatch 清单驱动定位与修正。

## 出处

- 2015 算法：https://codeforces.com/blog/entry/20762
- 2020 新账号：https://codeforces.com/blog/entry/77890
- 参考实现 Carrot：https://github.com/meooow25/carrot
- TLE rating_calculator.py：https://github.com/cheran-senthil/TLE
```

- [ ] **Step 5: 创建 `docs/api-notes.md`**

```markdown
# Codeforces API 现状（2026 记录）

## 端点

- `contest.ratingChanges?contestId=X`：返回每人 `handle/rank/oldRating/newRating`（均为显示分）。
  作为离线验证真值。已实测可用。
- `contest.standings?contestId=X`：2026-04 曾被限制为仅 gym/mashup；现已恢复
  “匿名、仅一个 `contestId` 参数”的公开模式，返回完整官方榜单。不可附加
  `from/count/handles/showUnofficial`/鉴权等参数。直播阶段才需要。
- `user.rating?handle=X`：用户完整 rating 历史，用于求“赛前场次 k”。可缓存。
- `user.info?handles=...`：批量当前显示 rating（未来直播取选手当前分用）。

## 注意

- API 返回的是“显示分”：`ratingChanges` 中出现过 `oldRating:0`（计算分不可能为 0），
  证明需要做显示分↔计算分换算。
- 限频：客户端约 1 req / 2.1s，并对 5xx / “limit exceeded” 做指数退避重试 + 磁盘缓存。
```

- [ ] **Step 6: 创建 `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 7: 运行整体校验**

Run: `pnpm install && pnpm typecheck && pnpm lint && pnpm test`
Expected: 全部通过（lint 如有少量告警可按需在 eslint.config.js 调整规则，但不得有 error）。

- [ ] **Step 8: 提交**

```bash
git add README.md AGENTS.md .cursor/rules/project.mdc docs/algorithm.md docs/api-notes.md .github/workflows/ci.yml
git commit -m "docs: add README, AGENTS, cursor rules, algorithm/API notes and CI"
```

---

## Task 14: 样本端到端验证（检查点）

> 这是小样本检查点，用于在投入全量前确认算法正确。全量验证见 Task 15–20。

**Files:**

- Modify（按需）: `packages/core/src/rating.ts`
- Create: `docs/validation-results.md`

- [ ] **Step 1: 抓取样本数据并验证**

Run: `pnpm --filter @crp/cli crp validate sample`
Expected: 打印每场报告与 AGGREGATE 行。记录 `weightedExactRate` 与 `maxAbsError`。

- [ ] **Step 2: 分析最差 mismatch**

查看每场报告的 `worst` 列表，判断误差来源：

- 若集中在 `k < 6` 的新账号 → 检查换算（Task 3）与 k 计算（Task 9/11）。
- 若集中在并列名次选手 → 调整 `computeRatingChanges` 中并列名次取值（见下一步）。
- 若是普遍 ±1 → 检查 `Math.trunc` 与二分返回值。

- [ ] **Step 3:（条件）并列名次修正**

若验证显示并列名次导致系统性误差，则在 `packages/core/src/rating.ts` 的循环里，
把每名选手使用的名次替换为“其并列组内的最小名次”（与 CF 榜单显示一致）。具体做法：
先构造 `rank` 到该 rank 是否需要规整的映射；若 API 已对并列给出相同 rank 值，则无需改动。
将下面这段加在 `for` 循环前并在循环内使用 `effectiveRank`：

```ts
// 并列组规整：相同 rank 的选手共享该组最小名次（与 CF 榜单一致）。
const minRankByRank = new Map<number, number>();
for (const c of contestants) {
  const cur = minRankByRank.get(c.rank);
  if (cur === undefined || c.rank < cur) minRankByRank.set(c.rank, c.rank);
}
```

> 注：CF `ratingChanges` 通常已对并列给出相同 rank；只有当验证暴露偏差时才需要此步。
> 任何改动后必须重跑 `pnpm --filter @crp/core test` 与 `crp validate sample`。

- [ ] **Step 4: 重跑验证直至达标**

Run: `pnpm --filter @crp/cli crp validate sample`
Expected（成功标准）：成熟用户（k≥6）`exactRate` 接近 100%；`medianAbsError = 0`；
残余 `maxAbsError` 仅取整级（≤1~2）或可被新账号/边界解释。

- [ ] **Step 5: 记录结果 `docs/validation-results.md`**

```markdown
# 验证结果（样本）

- 命令：`crp validate sample`
- 样本比赛：见 `packages/cli/src/dataset.ts` 的 `SAMPLE_CONTEST_IDS`
- 指标：
  - weightedExactRate: <填实测值>
  - maxAbsError: <填实测值>
  - medianAbsError: <填实测值>
- 残余 mismatch 说明：<逐类解释，如新账号 k 边界 / 并列名次 / 取整>
- 结论：<是否达标；如需扩到全量与 FFT 优化的后续计划>
```

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/rating.ts docs/validation-results.md
git commit -m "test: validate algorithm on sample contests and record results"
```

---

## Task 15: FFT 复数卷积（TDD）

**Files:**

- Create: `packages/core/src/fft.ts`
- Test: `packages/core/test/fft.test.ts`

- [ ] **Step 1: 写失败测试 `packages/core/test/fft.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { convolveReal } from '../src/fft.js';

function naiveConv(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
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

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/core test`
Expected: FAIL，找不到 `../src/fft.js`。

- [ ] **Step 3: 实现 `packages/core/src/fft.ts`**

```ts
/** 原地迭代 radix-2 FFT。re/im 长度必须为 2 的幂。 */
function fftInPlace(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
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
        const ur = re[i + k];
        const ui = im[i + k];
        const xr = re[i + k + half];
        const xi = im[i + k + half];
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
      re[i] /= n;
      im[i] /= n;
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
    const r = are[i] * bre[i] - aim[i] * bim[i];
    const im2 = are[i] * bim[i] + aim[i] * bre[i];
    are[i] = r;
    aim[i] = im2;
  }
  fftInPlace(are, aim, true);
  const out = new Float64Array(resultLen);
  for (let i = 0; i < resultLen; i++) out[i] = are[i];
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/core test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/fft.ts packages/core/test/fft.test.ts
git commit -m "feat(core): add iterative FFT real convolution"
```

---

## Task 16: FFT 加速版评分算法 `computeRatingChangesFast`（TDD：与朴素版等价）

**Files:**

- Create: `packages/core/src/ratingFast.ts`
- Test: `packages/core/test/ratingFast.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 写失败测试 `packages/core/test/ratingFast.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeRatingChanges } from '../src/rating.js';
import { computeRatingChangesFast } from '../src/ratingFast.js';
import type { Contestant } from '../src/types.js';

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomField(n: number, seed: number): Contestant[] {
  const rng = mulberry32(seed);
  const cs: Contestant[] = [];
  for (let i = 0; i < n; i++) {
    cs.push({ party: `p${i}`, rank: 0, rating: Math.round(400 + rng() * 3000) });
  }
  // 按 rating 反向打乱后赋名次（制造与 rating 不完全相关的真实场景）
  const shuffled = [...cs].sort(() => rng() - 0.5);
  shuffled.forEach((c, i) => (c.rank = i + 1));
  return cs;
}

describe('computeRatingChangesFast 与朴素版等价', () => {
  it('小场景：逐人 delta 完全一致', () => {
    const field: Contestant[] = [
      { party: 'a', rank: 1, rating: 2000 },
      { party: 'b', rank: 2, rating: 1500 },
      { party: 'c', rank: 3, rating: 1500 },
      { party: 'd', rank: 4, rating: 1000 },
    ];
    const slow = computeRatingChanges(field);
    const fast = computeRatingChangesFast(field);
    const bySlow = Object.fromEntries(slow.map((r) => [r.party, r.delta]));
    for (const r of fast) expect(r.delta).toBe(bySlow[r.party]);
  });

  it('随机中等场景（n=300，多种子）：最大逐人误差 <= 1', () => {
    for (const seed of [1, 7, 99]) {
      const field = randomField(300, seed);
      const slow = computeRatingChanges(field);
      const fast = computeRatingChangesFast(field);
      const bySlow = new Map(slow.map((r) => [r.party, r.delta]));
      let maxDiff = 0;
      for (const r of fast) maxDiff = Math.max(maxDiff, Math.abs(r.delta - bySlow.get(r.party)!));
      expect(maxDiff).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/core test`
Expected: FAIL，找不到 `../src/ratingFast.js`。

- [ ] **Step 3: 实现 `packages/core/src/ratingFast.ts`**

```ts
import { convolveReal } from './fft.js';
import type { Contestant, RatingChange } from './types.js';

/** ELO 核：g(x) = 1 / (1 + 10^(x/400))，等价于“rating 比我高 x 的对手胜过我”的概率。 */
function gKernel(x: number): number {
  return 1 / (1 + Math.pow(10, x / 400));
}

/**
 * FFT 加速版：与 computeRatingChanges 数学等价，但用一次卷积预计算
 * S(R) = 1 + Σ_r cnt[r] g(R - r)，把每人 seed 与二分查找降到近似 O(N log N)。
 * 适用于大赛（数万人）。极小概率因浮点误差与朴素版相差 ±1。
 */
export function computeRatingChangesFast(contestants: Contestant[]): RatingChange[] {
  const n = contestants.length;
  if (n === 0) return [];

  let minR = 1;
  let maxR = 8000;
  for (const c of contestants) {
    if (c.rating < minR) minR = c.rating;
    if (c.rating > maxR) maxR = c.rating;
  }
  const Dlo = Math.min(minR, 1);
  const Dhi = Math.max(maxR, 8000);
  const L = Dhi - Dlo + 1;

  const cnt = new Float64Array(L);
  for (const c of contestants) cnt[c.rating - Dlo] += 1;

  const kern = new Float64Array(2 * L - 1);
  for (let j = 0; j < 2 * L - 1; j++) kern[j] = gKernel(j - (L - 1));

  const conv = convolveReal(cnt, kern); // 长度 3L-2
  // S(Dlo + s) = 1 + conv[s + (L-1)]
  const S = (rating: number): number => 1 + conv[rating - Dlo + (L - 1)];

  const deltas = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const ri = contestants[i].rating;
    const seedI = S(ri) - 0.5; // 排除自身（g(0)=0.5）
    const midRank = Math.sqrt(seedI * contestants[i].rank);
    let lo = 1;
    let hi = 8000;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const seedOthers = S(mid) - gKernel(mid - ri); // 排除自身在该候选 rating 下的贡献
      if (seedOthers < midRank) hi = mid;
      else lo = mid;
    }
    deltas[i] = Math.trunc((lo - ri) / 2);
  }

  {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += deltas[i];
    const inc = Math.trunc(-sum / n) - 1;
    for (let i = 0; i < n; i++) deltas[i] += inc;
  }
  {
    const order = [...Array(n).keys()].sort(
      (a, b) => contestants[b].rating - contestants[a].rating,
    );
    const s = Math.min(n, Math.round(4 * Math.sqrt(n)));
    let sum = 0;
    for (let t = 0; t < s; t++) sum += deltas[order[t]];
    const inc = Math.min(Math.max(Math.trunc(-sum / s), -10), 0);
    for (let i = 0; i < n; i++) deltas[i] += inc;
  }

  return contestants.map((c, i) => ({
    party: c.party,
    rank: c.rank,
    oldRating: c.rating,
    delta: deltas[i],
    newRating: c.rating + deltas[i],
  }));
}
```

- [ ] **Step 4: 在 index 追加导出**

`packages/core/src/index.ts` 追加：

```ts
export * from './fft.js';
export * from './ratingFast.js';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @crp/core test`
Expected: PASS（等价性测试通过）。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/ratingFast.ts packages/core/test/ratingFast.test.ts packages/core/src/index.ts
git commit -m "feat(core): add FFT-accelerated computeRatingChangesFast"
```

---

## Task 17: 比赛枚举与日期过滤（TDD）

**Files:**

- Create: `packages/cli/src/contests.ts`
- Test: `packages/cli/test/contests.test.ts`

- [ ] **Step 1: 写失败测试 `packages/cli/test/contests.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { filterContests } from '../src/contests.js';
import type { ApiContest } from '../src/types.js';

function c(id: number, phase: string, t?: number): ApiContest {
  return { id, name: `c${id}`, phase, type: 'CF', startTimeSeconds: t };
}

describe('filterContests', () => {
  it('仅保留 FINISHED、有开始时间、落在 [from,to] 的比赛，并按时间升序', () => {
    const all = [
      c(1, 'FINISHED', 100),
      c(2, 'BEFORE', 150),
      c(3, 'FINISHED'), // 无开始时间
      c(4, 'FINISHED', 50),
      c(5, 'FINISHED', 300),
    ];
    const out = filterContests(all, 60, 250);
    expect(out.map((x) => x.id)).toEqual([1]); // 仅 id=1（t=100 在 [60,250]）
  });

  it('升序返回', () => {
    const all = [c(1, 'FINISHED', 300), c(2, 'FINISHED', 100), c(3, 'FINISHED', 200)];
    const out = filterContests(all, 0, 1000);
    expect(out.map((x) => x.startTimeSeconds)).toEqual([100, 200, 300]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/contests.js`。

- [ ] **Step 3: 实现 `packages/cli/src/contests.ts`**

```ts
import type { ApiContest } from './types.js';
import { CodeforcesApi } from './api.js';

export interface ContestMeta {
  id: number;
  name: string;
  startTimeSeconds: number;
}

/** 从 contest.list 选出 FINISHED、有开始时间、落在 [fromSec, toSec] 的比赛（时间升序）。 */
export function filterContests(all: ApiContest[], fromSec: number, toSec: number): ContestMeta[] {
  const out: ContestMeta[] = [];
  for (const c of all) {
    if (c.phase !== 'FINISHED') continue;
    if (typeof c.startTimeSeconds !== 'number') continue;
    if (c.startTimeSeconds < fromSec || c.startTimeSeconds > toSec) continue;
    out.push({ id: c.id, name: c.name, startTimeSeconds: c.startTimeSeconds });
  }
  out.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  return out;
}

export async function listFinishedContests(
  api: CodeforcesApi,
  fromSec: number,
  toSec: number,
): Promise<ContestMeta[]> {
  const all = await api.getContestList();
  return filterContests(all, fromSec, toSec);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/contests.ts packages/cli/test/contests.test.ts
git commit -m "feat(cli): add contest enumeration and date filtering"
```

---

## Task 18: 全局参赛索引（TDD）

**Files:**

- Create: `packages/cli/src/participationIndex.ts`
- Test: `packages/cli/test/participationIndex.test.ts`

- [ ] **Step 1: 写失败测试 `packages/cli/test/participationIndex.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ParticipationIndex } from '../src/participationIndex.js';
import type { ApiRatingChange } from '../src/types.js';

function rc(handle: string, t: number): ApiRatingChange {
  return {
    contestId: 1,
    contestName: '',
    handle,
    rank: 1,
    ratingUpdateTimeSeconds: t,
    oldRating: 0,
    newRating: 0,
  };
}

describe('ParticipationIndex', () => {
  it('统计某 handle 在给定时间之前的参赛场次', () => {
    const idx = new ParticipationIndex();
    idx.addContest([rc('a', 100), rc('b', 100)]);
    idx.addContest([rc('a', 200)]);
    idx.addContest([rc('a', 300), rc('b', 300)]);
    idx.finalize();
    expect(idx.priorCount('a', 300)).toBe(2); // t=100,200 < 300
    expect(idx.priorCount('a', 100)).toBe(0);
    expect(idx.priorCount('b', 300)).toBe(1);
    expect(idx.priorCount('unknown', 300)).toBe(0);
  });

  it('乱序加入也能正确二分计数', () => {
    const idx = new ParticipationIndex();
    idx.addContest([rc('a', 300)]);
    idx.addContest([rc('a', 100)]);
    idx.addContest([rc('a', 200)]);
    idx.finalize();
    expect(idx.priorCount('a', 250)).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/participationIndex.js`。

- [ ] **Step 3: 实现 `packages/cli/src/participationIndex.ts`**

```ts
import type { ApiRatingChange } from './types.js';

/** 全局参赛索引：handle -> 该用户所有参赛的 ratingUpdateTime（finalize 后升序）。 */
export class ParticipationIndex {
  private readonly map = new Map<string, number[]>();

  addContest(rows: ApiRatingChange[]): void {
    for (const r of rows) {
      const arr = this.map.get(r.handle);
      if (arr) arr.push(r.ratingUpdateTimeSeconds);
      else this.map.set(r.handle, [r.ratingUpdateTimeSeconds]);
    }
  }

  finalize(): void {
    for (const arr of this.map.values()) arr.sort((a, b) => a - b);
  }

  /** 该 handle 在 beforeTimeSeconds 之前的参赛场次数（即赛前 k）。 */
  priorCount(handle: string, beforeTimeSeconds: number): number {
    const arr = this.map.get(handle);
    if (!arr) return 0;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < beforeTimeSeconds) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/participationIndex.ts packages/cli/test/participationIndex.test.ts
git commit -m "feat(cli): add global participation index for k resolution"
```

---

## Task 19: CLI 全量命令 fetch-all / validate-all

**Files:**

- Modify: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/full.ts`
- Test: `packages/cli/test/full.test.ts`

说明：`full.ts` 提供 `runValidateAll`，把“枚举→抓取→建索引→逐场验证→汇总+写 JSON”串起来；
为可单测，外部依赖（列举、取 ratingChanges）通过参数注入。

- [ ] **Step 1: 写失败测试 `packages/cli/test/full.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { runValidateAll } from '../src/full.js';
import type { ApiRatingChange } from '../src/types.js';
import type { ContestMeta } from '../src/contests.js';

function rc(handle: string, rank: number, oldR: number, newR: number, t: number): ApiRatingChange {
  return {
    contestId: 0,
    contestName: '',
    handle,
    rank,
    ratingUpdateTimeSeconds: t,
    oldRating: oldR,
    newRating: newR,
  };
}

describe('runValidateAll', () => {
  it('用注入的依赖完成全链路，并只验证 validateFrom 之后的比赛', async () => {
    const contests: ContestMeta[] = [
      { id: 1, name: 'old', startTimeSeconds: 100 },
      { id: 2, name: 'new', startTimeSeconds: 1000 },
    ];
    const data: Record<number, ApiRatingChange[]> = {
      1: [rc('a', 1, 1500, 1500, 100)],
      2: [rc('a', 1, 1500, 1530, 1000), rc('b', 2, 1500, 1470, 1000)],
    };
    const result = await runValidateAll({
      listContests: async () => contests,
      getRatingChanges: async (id) => data[id]!,
      validateFromSec: 500,
      // 完美预测算法：直接返回真值 delta（验证链路连通性）
      ratingFn: (cs) =>
        cs.map((c) => {
          const row = data[2]!.find((r) => r.handle === c.party)!;
          const delta = row.newRating - row.oldRating;
          return {
            party: c.party,
            rank: c.rank,
            oldRating: c.rating,
            delta,
            newRating: c.rating + delta,
          };
        }),
    });
    expect(result.validated.map((v) => v.contestId)).toEqual([2]); // 只验证 id=2
    expect(result.aggregate.totalN).toBe(2);
    expect(result.aggregate.maxAbsError).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @crp/cli test`
Expected: FAIL，找不到 `../src/full.js`。

- [ ] **Step 3: 实现 `packages/cli/src/full.ts`**

```ts
import { computeRatingChangesFast } from '@crp/core';
import type { Contestant, RatingChange } from '@crp/core';
import type { ApiRatingChange } from './types.js';
import type { ContestMeta } from './contests.js';
import { ParticipationIndex } from './participationIndex.js';
import { displayToCalc, calcToDisplay } from '@crp/core';
import { validateContest, type ContestReport } from './validate.js';
import { aggregate, type AggregateResult } from './report.js';

export interface RunValidateAllDeps {
  listContests: () => Promise<ContestMeta[]>;
  getRatingChanges: (contestId: number) => Promise<ApiRatingChange[]>;
  validateFromSec: number;
  ratingFn?: (contestants: Contestant[]) => RatingChange[];
  onProgress?: (msg: string) => void;
}

export interface RunValidateAllResult {
  validated: { contestId: number; report: ContestReport }[];
  aggregate: AggregateResult;
}

/**
 * 全量验证：枚举所有比赛 -> 抓取每场 ratingChanges 并建全局参赛索引 ->
 * 对 startTime >= validateFromSec 的非空比赛逐场验证 -> 汇总。
 * validateContest 内部已用注入算法在 calc 空间换算；这里用 priorCounts 提供 k。
 */
export async function runValidateAll(deps: RunValidateAllDeps): Promise<RunValidateAllResult> {
  const ratingFn = deps.ratingFn ?? computeRatingChangesFast;
  const contests = await deps.listContests();

  // 第一遍：抓取全部 ratingChanges，建立全局参赛索引
  const index = new ParticipationIndex();
  const rowsById = new Map<number, ApiRatingChange[]>();
  for (const meta of contests) {
    const rows = await deps.getRatingChanges(meta.id);
    rowsById.set(meta.id, rows);
    if (rows.length > 0) index.addContest(rows);
    deps.onProgress?.(`indexed ${meta.id} (${rows.length} rows)`);
  }
  index.finalize();

  // 第二遍：验证窗口内的比赛
  const validated: { contestId: number; report: ContestReport }[] = [];
  for (const meta of contests) {
    if (meta.startTimeSeconds < deps.validateFromSec) continue;
    const rows = rowsById.get(meta.id)!;
    if (rows.length === 0) continue;
    const contestTime = rows[0].ratingUpdateTimeSeconds;
    const priorCounts = new Map<string, number>();
    for (const r of rows) priorCounts.set(r.handle, index.priorCount(r.handle, contestTime));
    const report = validateContest(rows, priorCounts, ratingFn);
    validated.push({ contestId: meta.id, report });
    deps.onProgress?.(`validated ${meta.id} exact=${(report.exactRate * 100).toFixed(1)}%`);
  }

  return { validated, aggregate: aggregate(validated) };
}

// 显式 re-export 以保证未使用告警不影响（换算在 validateContest 内部完成）
export { displayToCalc, calcToDisplay };
```

> 注：`displayToCalc/calcToDisplay` 的实际换算发生在 `validateContest` 内部；上面的 re-export
> 仅为模块自洽，不参与逻辑。若 lint 提示未使用，可删去该行与对应 import。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @crp/cli test`
Expected: PASS。

- [ ] **Step 5: 修改 `packages/cli/src/cli.ts` 加入 fetch-all / validate-all**

在 `packages/cli/src/cli.ts` 顶部 import 区追加：

```ts
import { writeFile, mkdir } from 'node:fs/promises';
import { listFinishedContests } from './contests.js';
import { runValidateAll } from './full.js';
```

新增日期常量（放在 `DATA_DIR` 定义之后）：

```ts
const INDEX_FROM = Math.floor(
  (Number(process.env.CRP_INDEX_FROM) || Date.parse('2020-01-01T00:00:00Z')) / 1000 ||
    Date.parse('2020-01-01T00:00:00Z') / 1000,
);
const VALIDATE_FROM = Math.floor(
  Date.parse(process.env.CRP_VALIDATE_FROM || '2022-01-01T00:00:00Z') / 1000,
);
const NOW_SEC = Math.floor(Date.now() / 1000);
```

> 简化：若需自定义起点，用环境变量 `CRP_VALIDATE_FROM=YYYY-MM-DD`。`INDEX_FROM` 默认
> 当前实现默认 2020-01-01，并通过“首场 oldRating==0”判断新评分体系账号，避免老体系用户被误判。

在 `switch (command)` 中，`validate` 分支之后、`default` 之前追加：

```ts
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
      await mkdir(DATA_DIR, { recursive: true });
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
```

并把 usage 文案更新为：

```ts
process.stdout.write('usage: crp <fetch|validate|fetch-all|validate-all> [contestId|sample]\n');
```

- [ ] **Step 6: 校验类型与测试**

Run: `pnpm --filter @crp/cli typecheck && pnpm --filter @crp/cli test`
Expected: 均通过。

- [ ] **Step 7: 提交**

```bash
git add packages/cli/src/full.ts packages/cli/test/full.test.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add full-scale fetch-all/validate-all over all rated contests"
```

---

## Task 20: 全量验证运行与结果记录

**Files:**

- Modify（按需）: `packages/core/src/ratingFast.ts` 或 `rating.ts`
- Modify: `docs/validation-results.md`

- [ ] **Step 1: 抓取全量数据（后台、限频，可重入）**

Run: `pnpm --filter @crp/cli crp fetch-all`
Expected: 枚举数百场 FINISHED 比赛并缓存其 ratingChanges（首次较慢，受 ~2s/请求限频；缓存后可秒级重跑）。

- [ ] **Step 2: 运行全量验证**

Run: `pnpm --filter @crp/cli crp validate-all`
Expected: 打印每场进度与 `FULL AGGREGATE`，并写出 `data/full-report.json`。记录 `weightedExactRate`、`maxAbsError`。

- [ ] **Step 3: 分析误差来源**

从 `data/full-report.json` 找出 `exactRate` 偏低或 `maxAbsError` 偏大的比赛，结合其 `worst` 列表判断：

- 集中在 `k<6` 新账号 → 复核换算与索引起点 `INDEX_FROM`（是否需更早）。
- 集中在并列名次 → 按 Task 14 Step 3 的并列规整处理。
- 普遍 ±1 → 复核 `Math.trunc` 与 FFT 浮点（必要时对低置信样本用朴素版复算）。
- 某时间段系统性偏差 → 可能是评分机制变动；用 `CRP_VALIDATE_FROM` 缩小窗口并在结果中记录。

- [ ] **Step 4: 迭代至达标并重跑**

Run: `pnpm --filter @crp/cli crp validate-all`
Expected（成功标准）：窗口内成熟用户 `exactRate` 接近 100%；整体 `weightedExactRate` 高；
残余 `maxAbsError` 可被新账号/并列/取整/机制变动解释。

- [ ] **Step 5: 记录结果 `docs/validation-results.md`**

将文件更新为（用实测值替换占位）：

```markdown
# 验证结果

## 样本（checkpoint）

- 命令：`crp validate sample`
- weightedExactRate / medianAbsError / maxAbsError：<实测>

## 全量

- 命令：`crp fetch-all` + `crp validate-all`
- 窗口：INDEX_FROM=2020-01-01，VALIDATE_FROM=2022-01-01（如调整请注明）
- 比赛场数 / totalN：<实测>
- weightedExactRate：<实测>
- maxAbsError：<实测>
- 残余 mismatch 分类与解释：<逐类>
- 机制变动观察（如某时段误差异常）：<记录>
- 结论：<是否达标；后续优化方向>
```

- [ ] **Step 6: 提交**

```bash
git add docs/validation-results.md packages/core/src/ratingFast.ts packages/core/src/rating.ts
git commit -m "test: full-scale validation over rated contests and record results"
```

> 注：`data/` 是本地缓存和报告目录，已被 .gitignore；不要提交 `data/full-report.json`。

---

## 后续（不在本计划）

- 新建独立 spec：Chrome 插件 UI（注入 `Rating` / `Pred Rating Delta` 两列、直播实时刷新、为全体选手获取 k 的折中方案）。
- 直播模式下 k 的获取（无法离线建索引时的折中：user.info + 选择性 user.rating）。
