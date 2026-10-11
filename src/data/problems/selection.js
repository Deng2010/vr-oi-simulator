/* =========================================================
   抽题与难度排序
   ---------------------------------------------------------
   为什么单独一个模块：抽题是**游戏规则**（一局 4 道题、按难度升序），
   规则就得有判据；而 tests/run.mjs 跑在 Node 里，index.js 用了
   import.meta.glob（Vite 专属），不能被 Node 直接 import
   （AGENTS §6 第 3 条）。所以把「抽」和「排」搬到这里，
   index.js 只做 re-export，规则本身就能被单测直接钉住。

   难度 1~4 只用于抽题后的排序，**任何界面都不显示它**：
   tests/run.mjs 有一条静态断言盯着界面层不许引用这个字段。
   ========================================================= */
import { PROBLEM_MANIFEST } from './manifest.js';

/* 难度相同时按题号升序 —— 同一个题目集合的顺序必须是确定的，
   否则「按难度排序」这件事在界面上会飘。 */
export function compareDifficulty(a, b){
  if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
  return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
}

export function sortByDifficulty(list){
  return list.slice().sort(compareDifficulty);
}

/* 抽题：从清单随机抽 count 道，按难度升序返回。
   洗牌与排序互不影响 —— 洗牌决定**哪 4 道**，排序只决定它们的
   **展示顺序**，所以一局的难度组合不一定是 1,2,3,4
   （抽到 1,1,3,4 也完全正常：题目是从整池里均匀抽的）。 */
export function pickProblems(count = 4){
  const pool = PROBLEM_MANIFEST.slice();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++){
    const j = i + Math.floor(Math.random() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return sortByDifficulty(pool.slice(0, n));
}
