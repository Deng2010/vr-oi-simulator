/* =========================================================
   运行时性能：帧耗时采样 + 把 perf-policy 的决策施加到 renderer
   ---------------------------------------------------------
   「什么时候降/升 pixelRatio」这个决策在 src/core/perf-policy.js，
   是纯函数、有单元测试（tests/run.mjs）。
   这里只做两件事：
     1. 每帧采样：同步 renderer.info，并维护帧耗时的两个口径
        （EMA 供探针随时读取，窗口均值供变档决策）；
     2. 每 60 帧问一次策略，需要变档时 setPixelRatio + setSize。
   ========================================================= */
import { initialPixelRatioState, nextPixelRatio } from './perf-policy.js';
import { MAX_PIXEL_RATIO, renderer, scene } from '../render/gfx.js';

const WINDOW_FRAMES = 60;      // 每 60 帧统计一个窗口

export const perfStats = {
  fps: 0,
  frameMs: 0,
  pixelRatio: MAX_PIXEL_RATIO,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  /* 场景规模（合批前后），由 src/world/world.js 在装配完成后写入 */
  sceneMeshes: 0,
  meshesBeforeBatch: 0,
  mergedGroups: 0,
  skippedDynamic: 0
};

export function setSceneStats(stats){
  Object.assign(perfStats, stats);
}

let acc = 0;
let frames = 0;
let policy = initialPixelRatioState();

/* 指数滑动平均：任何时刻都能给出可读的帧耗时，
   不必等满一个统计窗口（探针 / 性能回归用）。
   变档决策仍然用窗口均值，避免被单帧卡顿带偏。 */
let emaDt = 0;

function applyPixelRatio(next){
  policy.ratio = next;
  perfStats.pixelRatio = next;
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, next));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function collect(){
  if (!renderer) return;
  const info = renderer.info;
  perfStats.drawCalls = info.render.calls;
  perfStats.triangles = info.render.triangles;
  perfStats.geometries = info.memory.geometries;
}

/* 每帧调用。
   renderer.info 只是几个计数器，读取成本可忽略，所以每帧同步一次，
   保证外部探针任何时刻拿到的 drawCalls / triangles 都是当前帧真实值。 */
export function sampleFrame(realDt){
  collect();

  emaDt = emaDt ? emaDt * 0.9 + realDt * 0.1 : realDt;
  perfStats.frameMs = emaDt * 1000;
  perfStats.fps = 1 / emaDt;

  acc += realDt;
  frames++;
  if (frames < WINDOW_FRAMES) return;

  const windowFps = frames / acc;
  acc = 0;
  frames = 0;

  const decision = nextPixelRatio(policy, windowFps);
  policy = decision;
  if (decision.changed) applyPixelRatio(decision.ratio);
}

/* 场景完整性自检：数一数「打了动态标记的根」各自还剩多少网格。
   静态合批一旦误吞动态物体，这些根下面的网格数就会变成 0 ——
   曾经就是这样导致「人物 4 条腿」「老师模型冻在原地」。
   只统计动态根自身的子树，子节点没有标记所以不会重复计数。 */
function sceneIntegrity(){
  const roots = [];
  let teacherPos = null;
  if (scene){
    scene.traverse(o => {
      if (o.name === 'teacher') teacherPos = o.position.toArray();

      if (!o.userData || !o.userData.dynamic) return;
      let meshes = 0;
      o.traverse(c => { if (c.isMesh) meshes++; });

      /* 坐姿 / 站姿两组腿：同一时刻必须恰好可见一组。
         两组都可见 = 露出 4 条腿（人物模型 bug）；
         两组都不可见 = 腿没了。 */
      let sit = null, stand = null;
      o.traverse(c => {
        if (c.name === 'legs:sit') sit = c;
        if (c.name === 'legs:stand') stand = c;
      });
      const legMeshes = g => {
        if (!g) return 0;
        let n = 0;
        g.traverse(c => { if (c.isMesh) n++; });
        return n;
      };

      roots.push({
        name: o.name || o.type,
        meshes,
        hasLegs: !!(sit && stand),
        visibleLegGroups: (sit && sit.visible ? 1 : 0) + (stand && stand.visible ? 1 : 0),
        sitLegMeshes: legMeshes(sit),
        standLegMeshes: legMeshes(stand)
      });
    });
  }
  return {
    dynamicRoots: roots.length,
    roots,
    teacherPos,
    rootMeshes: roots.map(r => r.meshes),
    /* 每个动态根至少要有的网格数：人物 11 个部件（4 坐腿 + 2 站腿 +
       躯干 + 2 臂 + 头 + 头发），保安略多 */
    minMeshes: roots.length ? Math.min(...roots.map(r => r.meshes)) : 0
  };
}

/* ---------- 开发态探针 ----------
   import.meta.env.DEV 在构建时被替换成 false，
   整个分支会被 Rollup 摇掉，生产产物里不含这段代码
   （冒烟测试对此有断言：生产构建下探针应当不存在）。 */
if (import.meta.env.DEV){
  window.__VR_OI_PERF__ = () => ({
    ...perfStats,
    pixelRatioSetting: policy.ratio,
    programs: renderer ? renderer.info.programs?.length : 0,
    integrity: sceneIntegrity()
  });
}
