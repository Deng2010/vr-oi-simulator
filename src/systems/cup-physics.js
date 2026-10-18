/* =========================================================
   水杯投掷的纯物理判据
   ---------------------------------------------------------
   为什么单独拆出来：
     杯子是唯一个「会被玩家扔出去、还要和人物 / 墙体 / 课桌碰撞」
     的物体。这部分一旦出错（穿模、不反弹、擦到人就触发剧情），
     在浏览器里很难稳定复现 —— 拆成纯函数就能在 Node 里逐条单测。
   这里不 import THREE、不碰 DOM、不读全局 state。
   ========================================================= */

export const CUP_RADIUS = 0.045;

/* 出手速度：14m/s 时 3m 外下坠约 0.2m，瞄准胸口仍能命中；
   再慢就会让「准星明明对着老师却砸到地上」变成常见体验。 */
export const THROW_SPEED = 14;

export const CUP_GRAVITY = 9.8;

/* 撞到人物 / 墙体后的速度保留比例（0 = 完全不弹，1 = 完全弹性） */
export const CUP_RESTITUTION = 0.55;

/* 落地反弹的能量损失：比撞人小，否则杯子会在地上弹很久 */
export const FLOOR_RESTITUTION = 0.42;

/**
 * 把速度关于单位法线做反射。
 * @param {{x:number,y:number,z:number}} vel 入射速度
 * @param {number} nx 单位法线 x
 * @param {number} ny 单位法线 y
 * @param {number} nz 单位法线 z
 * @param {number} [restitution=CUP_RESTITUTION]
 * @returns {{x:number,y:number,z:number}} 反射后的新速度（不改入参）
 */
export function reflectVelocity(vel, nx, ny, nz, restitution = CUP_RESTITUTION){
  const dot = vel.x * nx + vel.y * ny + vel.z * nz;
  /* 已经在朝外飞（dot ≥ 0）时不要「吸」回来：贴着物体表面时
     法线方向可能因为浮点误差来回翻转，强行反射会把杯子粘在墙上。 */
  if (dot >= 0) return { x: vel.x, y: vel.y, z: vel.z };
  const k = (1 + restitution) * dot;
  return {
    x: vel.x - k * nx,
    y: vel.y - k * ny,
    z: vel.z - k * nz
  };
}

/**
 * 线段 a→b 是否穿过一个竖直圆柱体（人物 / 保安的碰撞体），
 * 返回最近命中点与水平法线；没穿过返回 null。
 *
 * 用「线段」而不是「当前点」：投掷物一帧能走 0.2m 以上，
 * 只判末点会在低帧率下直接穿过人物。
 *
 * @param {{x:number,y:number,z:number}} a 本帧起点
 * @param {{x:number,y:number,z:number}} b 本帧终点
 * @param {number} cx 圆柱中心 x
 * @param {number} cz 圆柱中心 z
 * @param {number} radius 圆柱半径（已把杯子半径算进去）
 * @param {number} yMin 圆柱下沿
 * @param {number} yMax 圆柱上沿
 * @returns {{t:number,x:number,y:number,z:number,nx:number,nz:number}|null}
 *   t 是命中点在 a→b 上的比例（0~1）
 */
export function segmentHitsCylinder(a, b, cx, cz, radius, yMin, yMax){
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = a.x - cx;
  const fz = a.z - cz;
  const len2 = dx * dx + dz * dz;

  /* 二维线段到圆心的最近点参数；水平位移为 0 时取起点 */
  let t = len2 > 1e-9 ? -(fx * dx + fz * dz) / len2 : 0;
  if (t < 0 || t > 1) return null;

  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  let ox = px - cx;
  let oz = pz - cz;
  const dist2 = ox * ox + oz * oz;
  if (dist2 > radius * radius) return null;

  const y = a.y + (b.y - a.y) * t;
  if (y < yMin || y > yMax) return null;

  /* 起点正好落在轴线上时没有可用法线，退化成从起点指向外 */
  let n = Math.sqrt(dist2);
  if (n < 1e-6){
    n = Math.hypot(a.x - cx, a.z - cz) || 1;
    ox = a.x - cx;
    oz = a.z - cz;
  }
  return { t, x: px, y, z: pz, nx: ox / n, nz: oz / n };
}
