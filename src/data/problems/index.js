/* =========================================================
   题库入口
   ---------------------------------------------------------
   分两层，兼顾「列表即时可用」与「题面按需下载」：

     · manifest.js —— 轻量清单（id / 名称 / 分值 / 时空限制），
       随主包同步加载，渲染题目列表、计分、存档恢复都不需要更多数据。
     · <id>.js + <id>.md —— 题面正文与起手代码，通过
       import.meta.glob 懒加载，每题单独切一个 chunk。
       一局只抽 4 道题，所以打开电脑时最多只下载 4 份题面，
       而不是把 16 道题的题面全塞进首包。
   ========================================================= */
import { PROBLEM_MANIFEST } from './manifest.js';

export { PROBLEM_MANIFEST };

/* O(1) 按 id 取元数据（存档恢复、HUD、显示器贴图都用它） */
export const PROBLEM_BY_ID = new Map(PROBLEM_MANIFEST.map(p => [p.id, p]));

/* id → 动态 import 工厂。Vite 会为每个匹配到的文件单独切 chunk。 */
const LOADERS = import.meta.glob('./P*.js');

/* 进行中的 Promise 与已完成的题目对象分开缓存：
   Promise 缓存保证并发调用只触发一次解码。 */
const pending = new Map();
const loaded = new Map();

/* 同步取已加载的题目；未加载返回 null（调用方需自行降级） */
export function getLoadedProblem(id){
  return loaded.get(id) || null;
}

/* 按需加载题目正文；重复调用命中缓存 */
export function loadProblemData(id){
  const hit = loaded.get(id);
  if (hit) return Promise.resolve(hit);

  const inflight = pending.get(id);
  if (inflight) return inflight;

  const load = LOADERS[`./${id}.js`];
  if (!load) return Promise.reject(new Error(`未知题目: ${id}`));

  const job = load().then(m => {
    loaded.set(id, m.default);
    return m.default;
  });
  pending.set(id, job);
  return job;
}

/* 抽题：从清单随机抽 count 道。
   部分 Fisher-Yates 洗牌，只洗前 count 个，避免 splice 的 O(n) 挪动。 */
export function pickProblems(count = 4){
  const pool = PROBLEM_MANIFEST.slice();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++){
    const j = i + Math.floor(Math.random() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, n);
}
