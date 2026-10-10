/* =========================================================
   小地图绘制
   由 index.html 内联脚本第 2686-2752 行拆出。
   ========================================================= */
import { state } from '../core/state.js';
import { securityGuards } from '../world/entities.js';
import { minimap, mmCtx } from './dom.js';
import { npcs, teacher } from '../world/entities.js';
import { obstacles } from '../world/obstacles.js';

export let mmFrameSkip = 0;

export function drawMinimap(){
  if (++mmFrameSkip % 4 !== 0) return;
  const c = minimap, ctx = mmCtx;
  const W = c.width, H = c.height;
  ctx.fillStyle = 'rgba(10,13,20,.85)';
  ctx.fillRect(0, 0, W, H);

  /* 世界：x∈[-8,8], z∈[-7,7] */
  const sx = W / 16, sy = H / 14;
  const tx = x => (x + 8) * sx;
  const ty = z => (z + 7) * sy;

  /* 障碍 */
  ctx.fillStyle = '#2a3242';
  for (const o of obstacles){
    ctx.fillRect(
      tx(o.x - o.hw), ty(o.z - o.hd),
      o.hw * 2 * sx, o.hd * 2 * sy
    );
  }

  /* NPC */
  for (const n of npcs){
    const ud = n.userData;
    if (!ud) continue;
    ctx.fillStyle = ud.state === 'seated' ? '#6a7a9a' : '#c08050';
    ctx.beginPath();
    ctx.arc(tx(n.group.position.x), ty(n.group.position.z), 2.2, 0, 7);
    ctx.fill();
  }

  /* 老师 */
  if (teacher){
    ctx.fillStyle = '#ffcc57';
    ctx.beginPath();
    ctx.arc(tx(teacher.group.position.x), ty(teacher.group.position.z), 2.8, 0, 7);
    ctx.fill();
  }

  /* 保安 */
  for (const g of securityGuards){
    if (!g.userData.alive) continue;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.01);
    ctx.fillStyle = `rgba(255,68,68,${pulse})`;
    ctx.beginPath();
    ctx.arc(tx(g.group.position.x), ty(g.group.position.z), 3.2, 0, 7);
    ctx.fill();
  }

  /* 玩家 + 朝向 */
  const px = tx(state.pos.x), py = ty(state.pos.z);
  ctx.fillStyle = '#5b8cff';
  ctx.beginPath();
  ctx.arc(px, py, 3.4, 0, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(91,140,255,.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - Math.sin(state.yaw) * 9, py - Math.cos(state.yaw) * 9);
  ctx.stroke();
}
