/* =========================================================
   保安 AI：巡逻、追击、被击倒与清理
   由 index.html 内联脚本第 1417-1737 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { clamp } from '../core/util.js';
import { buildSecurityGuard } from '../models/guard.js';
import { scene } from '../render/gfx.js';
import { unlockAch } from '../ui/achievements.js';
import { dangerVig, redFlash } from '../ui/dom.js';
import { showViolationEnding } from '../ui/ending.js';
import { hideAllPanels } from '../ui/panels.js';
import { toast } from '../ui/toast.js';
import { aliveGuardCount, pruneDeadGuards, securityGuards } from '../world/entities.js';
import { collides } from '../world/obstacles.js';
import { flag, recordEvent } from './stats.js';

/* 保安注册表与存活统计住在 world/entities.js（实体层）。
   这里只 re-export，保持 systems/guards.js 作为「保安系统」的单一入口。 */
export { aliveGuardCount, pruneDeadGuards, securityGuards };

export const GUARD_SPEED_BASE = 0.55;

export const GUARD_SPAWN_DIST = 5.0;

export const GUARD_HIT_RADIUS = 0.95;

export const GUARD_PUNCH_RANGE = 2.2;

export function spawnTwoGuards(){
  if (state.ended) return;
  pruneDeadGuards();
  /* 两只一起冲进来算一次事件（dedupe 会把重复的合并成 ×n） */
  recordEvent('guards', '保安冲进考场');

  const baseAngles = [
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2 + Math.PI
  ];
  const speedBonus = Math.min(0.35, state.guardKills * 0.04);

  for (let i = 0; i < 2; i++){
    let angle = baseAngles[i];
    const dist = GUARD_SPAWN_DIST + Math.random() * 1.2;
    let gx = state.pos.x + Math.cos(angle) * dist;
    let gz = state.pos.z + Math.sin(angle) * dist;
    gx = clamp(gx, -7.5, 7.5);
    gz = clamp(gz, -6.5, 6.5);

    let tries = 0;
    while (Math.hypot(gx - state.pos.x, gz - state.pos.z) < 3.6 && tries++ < 14){
      angle += 0.9;
      gx = clamp(state.pos.x + Math.cos(angle) * dist, -7.5, 7.5);
      gz = clamp(state.pos.z + Math.sin(angle) * dist, -6.5, 6.5);
    }

    const g = buildSecurityGuard(gx, gz);
    g.userData = {
      speed: GUARD_SPEED_BASE + speedBonus,
      alive: true
    };
    securityGuards.push(g);
  }
}

/* ---------- 构建世界 ---------- */

export function punchGuard(g){
  if (!g || !g.userData.alive) return;

  const d = Math.hypot(state.pos.x - g.group.position.x, state.pos.z - g.group.position.z);
  if (d > GUARD_PUNCH_RANGE + 0.3){
    toast('你离保安太远了。', 1200);
    return;
  }

  g.userData.alive = false;
  scene.remove(g.group);
  state.guardKills++;

  audio.punch();
  redFlash.style.opacity = '0.4';
  setTimeout(() => redFlash.style.opacity = '0', 130);

  toast('\u{1F44A} 一拳撂倒了一个保安！', 1500);
  if (state.guardKills >= 5) unlockAch('guard_5');

  setTimeout(() => {
    if (state.ended) return;
    spawnTwoGuards();
    toast('门口又冲进来两名替补保安……', 1700);
    audio.beep(200, 0.3, 0.06, 'sawtooth');
  }, 900);
}

/* =========================================================
   保安 AI + 碰撞
   ========================================================= */

export function updateGuards(realDt, t){
  if (state.ended || state.frozen || state.view !== 'world') return;

  let minDist = Infinity;

  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;

    const pos = g.group.position;
    const dx = state.pos.x - pos.x;
    const dz = state.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < minDist) minDist = d;

    if (d < GUARD_HIT_RADIUS){ endByGuards(); return; }

    if (d > 0.01){
      const sp = g.userData.speed * realDt;
      const nx = pos.x + (dx / d) * sp;
      const nz = pos.z + (dz / d) * sp;
      if (!collides(nx, pos.z, 0.3)) pos.x = nx;
      if (!collides(pos.x, nz, 0.3)) pos.z = nz;
      g.group.rotation.y = Math.atan2(dx, dz);
    }

    const v = Math.sin(t * 3.5 + g.phase) * 0.25;
    g.armL.rotation.x = -0.25 + v;
    g.armR.rotation.x = -0.25 - v;
    g.head.rotation.y = Math.sin(t * 2 + g.phase) * 0.25;

    if (g.warnLight){
      const blink = 0.5 + 0.5 * Math.sin(t * 6 + g.phase);
      g.warnLight.material.color.setRGB(1, blink * 0.4, blink * 0.4);
    }
  }

  if (aliveGuardCount() > 0 && minDist < 3.5) dangerVig.classList.add('on');
  else dangerVig.classList.remove('on');
}

export function endByGuards(){
  if (state.ended) return;
  state.ended = true;
  hideAllPanels();
  for (const g of securityGuards) scene.remove(g.group);
  securityGuards.length = 0;

  audio.beep(110, 0.5, 0.08, 'sawtooth');
  audio.beep(80, 0.7, 0.06, 'sawtooth');

  /* 违规开关先落地，结算时 immediate 阶段的结局才判得出来；
     标题 / 副标题 / 正文都写在 data/endings/caught.js 里 */
  flag('caughtByGuards', true);
  showViolationEnding();
}
