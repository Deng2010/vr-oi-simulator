/* =========================================================
   2D AABB 碰撞障碍集合
   由 index.html 内联脚本第 760-770 行拆出。
   ========================================================= */
export const obstacles = []; // {x, z, hw, hd}

export function addObstacle(x, z, hw, hd){ obstacles.push({ x, z, hw, hd }); }

export function collides(x, z, r){
  for (let i = 0; i < obstacles.length; i++){
    const o = obstacles[i];
    if (Math.abs(x - o.x) < o.hw + r && Math.abs(z - o.z) < o.hd + r) return true;
  }
  return false;
}

/* ---------- 音频 ---------- */
