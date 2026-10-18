/* =========================================================
   交互目标判定的纯函数
   ---------------------------------------------------------
   这里只放「不碰 DOM、不碰 THREE」的几何与排序规则，
   好让 tests/run.mjs 直接在 Node 里跑：
     · 朝向判定 —— 只有正对着考生 / 监考老师时，他们才是可交互对象；
     · Tab 循环 —— 右上角目标列表的选中项切换；
     · 射线-球体辅助 —— 水杯比其它桌面物件小得多，准星稍微偏一点
       就点不中，所以单独给杯子一个略宽的判定范围；
     · 目标择优 —— 权重优先、同权重取近的，保证默认选中可预期。

   坐标约定与 systems/player.js 一致：
   水平前方 = (-sin(yaw), -cos(yaw))。
   ========================================================= */

/* 「正对着」的阈值。0.5 ≈ 目标落在视线左右各 60° 的锥体内；
   比原来的「只要在 2.3m 内就算」严格，但也不至于要像素级对准。 */
export const FACE_MIN_DOT = 0.5;

/* 水杯的辅助瞄准：电脑 / 草稿纸走精确射线，水杯体积小得多，
   所以从原来的「射线必须真的打中圆柱体」放宽到
   「射线从杯心 16cm 内经过」，距离也从通用射程 3.2m 微调到 3.4m。 */
export const CUP_AIM_RADIUS = 0.16;
export const CUP_AIM_RANGE = 3.4;

/**
 * 目标在水平前方多远（点积，1 = 正前方，0 = 正侧方，-1 = 正后方）。
 * @param {number} px 玩家 x
 * @param {number} pz 玩家 z
 * @param {number} yaw 玩家水平朝向
 * @param {number} tx 目标 x
 * @param {number} tz 目标 z
 * @returns {number} -1 ~ 1
 */
export function facingDot(px, pz, yaw, tx, tz){
  const dx = tx - px;
  const dz = tz - pz;
  const len = Math.hypot(dx, dz);
  /* 与目标重合时不存在「朝向」可言；按正前方处理，避免除零。 */
  if (len < 1e-6) return 1;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return (fx * dx + fz * dz) / len;
}

/**
 * 玩家是否正对着目标。
 * @returns {boolean}
 */
export function isFacing(px, pz, yaw, tx, tz, minDot = FACE_MIN_DOT){
  return facingDot(px, pz, yaw, tx, tz) >= minDot;
}

/**
 * 列表循环下标。index 为 -1（当前没有选中）时：
 * Tab 选第一项，Shift+Tab 选最后一项。
 * @param {number} index 当前下标
 * @param {number} length 列表长度
 * @param {number} dir +1 / -1
 * @returns {number} 新下标；空列表返回 -1
 */
export function cycleIndex(index, length, dir){
  if (length <= 0) return -1;
  const step = dir < 0 ? -1 : 1;
  if (index < 0 || index >= length) return step < 0 ? length - 1 : 0;
  return (index + step + length) % length;
}

/**
 * 射线与球体求交（只关心「射线是否从球附近掠过」，不需要精确交点）。
 * 方向向量必须是单位向量。
 * @returns {{dist:number, off:number}|null} 命中时返回沿射线的距离与偏心距
 */
export function raySphereHit(ox, oy, oz, dx, dy, dz, cx, cy, cz, maxDist, radius){
  /* t 是球心在射线上的投影；负值说明球在身后 */
  const t = (cx - ox) * dx + (cy - oy) * dy + (cz - oz) * dz;
  if (!Number.isFinite(t) || t < 0 || t > maxDist) return null;
  const off = Math.hypot(
    cx - (ox + dx * t),
    cy - (oy + dy * t),
    cz - (oz + dz * t)
  );
  if (off > radius) return null;
  return { dist: t, off };
}

/**
 * 从候选里挑默认目标：权重大的优先，同权重取距离近的。
 * 候选形状：{ weight, dist }。
 * @template {{weight:number, dist:number}} T
 * @param {T[]} candidates
 * @returns {T|null}
 */
export function bestTarget(candidates){
  let best = null;
  for (const c of candidates){
    if (!c) continue;
    if (!best) { best = c; continue; }
    if (c.weight > best.weight) { best = c; continue; }
    if (c.weight === best.weight && c.dist < best.dist) best = c;
  }
  return best;
}
