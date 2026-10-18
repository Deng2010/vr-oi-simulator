/* =========================================================
   主循环：按视图裁剪更新与渲染
   由 index.html 内联脚本第 3088-3242 行拆出。
   ========================================================= */
import { sampleFrame } from './perf.js';
import { timeScale } from './settings.js';
import { CONTEST_LEN, state } from './state.js';
import { $, fmtTime } from './util.js';
import { camera, clock, renderer, scene } from '../render/gfx.js';
import { startBathroom, takePendingExit, updateBathroom } from '../systems/bathroom.js';
import { enterCorridor, takePendingArrival, updateCorridor } from '../systems/corridor.js';
import { updateCup } from '../systems/cup.js';
import { updateGuards } from '../systems/guards.js';
import {
  cancelInteractHold, resetInteractTargets, updateInteract, updateInteractHold
} from '../systems/interaction.js';
import { applyLook } from '../systems/look.js';
import { updateNPCs } from '../systems/npc.js';
import { updatePlayer } from '../systems/player.js';
import { applyWanderPenalty, showTeacherWarning, triggerTeacherWarning } from '../systems/warn.js';
import { renderHudTimer, renderHudTotal, renderIslandState } from '../ui/hud.js';
import { resetCrosshair, updateCrosshair } from '../ui/crosshair.js';
import { endContest } from '../ui/ending.js';
import { drawMinimap } from '../ui/minimap.js';
import { securityGuards, teacher } from '../world/entities.js';
import { collides } from '../world/obstacles.js';

export let lastInteractUpdate = 0;

export let forceRedraw = false;

/* 需要立刻重绘一帧（resize、面板切换等）。
   其它模块不能直接写 forceRedraw，统一走这个函数。 */
export function requestRedraw(){ forceRedraw = true; }

/* 这些视图下，3D 世界不可见（被全屏覆盖层盖住），可以跳过 render；
   其中 code/paper/corridor/bathroom/npcComputer 也跳过世界逻辑更新。
   story 是结局正文的播放器：全屏，世界冻在最后一帧当背景。 */

export const VIEW_NO_RENDER = new Set([
  'code','paper','corridor','bathroom','npcComputer','ending','story','pause','dialog'
]);

export function animate(){
  requestAnimationFrame(animate);
  const realDt = Math.min(clock.getDelta(), 0.1);
  const t = performance.now() * 0.001;

  /* 帧耗时采样 + pixelRatio 自适应（弱机自动降分辨率） */
  sampleFrame(realDt);

  if (state.started && !state.ended){
    state.elapsed += realDt * timeScale;
    if (state.elapsed >= CONTEST_LEN) endContest(false);
  }

  const inWorld = state.view === 'world';

  if (inWorld && state.started && !state.ended && !state.frozen){
    applyLook(realDt);
    updatePlayer(realDt);
  }

  /* 走廊 / 洗手间：更新后由主循环仲裁去向，
     两个过场模块互相不认识（见 corridor.js 的 takePendingArrival 注释）。 */
  if (state.view === 'corridor'){
    updateCorridor(realDt);
    if (takePendingArrival() === 'toilet') startBathroom();
  }
  if (state.view === 'bathroom'){
    updateBathroom(realDt);
    if (takePendingExit()) enterCorridor('return');
  }

  /* 世界逻辑：只在世界视图下运行，避免在 IDE / 草稿纸里空跑 NPC 与 AI */
  if (inWorld){
    updateNPCs(realDt, t);

    /* 老师 AI */
    if (teacher && !state.frozen){
      const tm = teacher.userData;
      const pos = teacher.group.position;

      if (tm.mode === 'patrol'){
        const theta = t * 0.15;
        const a = 6.5, b = 5.5, n = 0.7;
        const c1 = Math.cos(theta), s1 = Math.sin(theta);
        const c2 = Math.cos(theta + 0.02), s2 = Math.sin(theta + 0.02);
        const x1 = a * Math.sign(c1) * Math.pow(Math.abs(c1), n);
        const z1 = b * Math.sign(s1) * Math.pow(Math.abs(s1), n);
        const x2 = a * Math.sign(c2) * Math.pow(Math.abs(c2), n);
        const z2 = b * Math.sign(s2) * Math.pow(Math.abs(s2), n);
        pos.x = x1;
        pos.z = z1;
        teacher.group.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        pos.y = Math.abs(Math.sin(t * 4)) * 0.008;
      } else if (tm.mode === 'approach'){
        const dx = state.pos.x - pos.x;
        const dz = state.pos.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.4){
          tm.mode = 'warn';
          teacher.group.rotation.y = Math.atan2(dx, dz);
          showTeacherWarning();
        } else {
          const sp = 3.2 * realDt;
          const nx = pos.x + (dx / d) * sp;
          const nz = pos.z + (dz / d) * sp;
          if (!collides(nx, pos.z, 0.3)) pos.x = nx;
          if (!collides(pos.x, nz, 0.3)) pos.z = nz;
          teacher.group.rotation.y = Math.atan2(dx, dz);
        }
      } else if (tm.mode === 'warn'){
        const dx = state.pos.x - pos.x;
        const dz = state.pos.z - pos.z;
        teacher.group.rotation.y = Math.atan2(dx, dz);
      } else if (tm.mode === 'returning'){
        const theta = t * 0.15;
        const a = 6.5, b = 5.5, n = 0.7;
        const c = Math.cos(theta), s = Math.sin(theta);
        const targetX = a * Math.sign(c) * Math.pow(Math.abs(c), n);
        const targetZ = b * Math.sign(s) * Math.pow(Math.abs(s), n);
        const dx = targetX - pos.x;
        const dz = targetZ - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) tm.mode = 'patrol';
        else {
          const sp = 3.0 * realDt;
          pos.x += (dx / d) * sp; pos.z += (dz / d) * sp;
          teacher.group.rotation.y = Math.atan2(dx, dz);
        }
      }
    }

    /* 保安 */
    updateGuards(realDt, t);

    /* 水杯：持杯跟随视角 + 飞行中的物理与命中判定。
       放在人物 / 老师 / 保安更新之后，碰撞用的是本帧最新的位置。 */
    updateCup(realDt);

    /* 走动警告检测 */
    if (state.started && !state.ended && !state.frozen
        && !state.bathroomApproved && !state.teacherWarnActive && teacher
        && teacher.userData.mode === 'patrol'
        && securityGuards.length === 0){
      const dx = state.pos.x - 0;
      const dz = state.pos.z - (-3);
      const distFromSeat = Math.hypot(dx, dz);
      if (distFromSeat > 3.5){
        state.wanderTimer += realDt;
        if (state.wanderTimer > 2.0) triggerTeacherWarning();
      } else {
        state.wanderTimer = 0;
      }
    }
    /* 离开座位 5 次 → 触发时间锁定 */
    if (state.started && !state.ended && !state.wanderPenaltyApplied
      && state.wanderCount >= 5){
      applyWanderPenalty();
    }

    /* 交互提示：只在必要时刷新（每 80ms） */
    const now = performance.now();
    if (now - lastInteractUpdate > 80){
      lastInteractUpdate = now;
      updateInteract();
    }

    /* 按住确认的蓄力与准星都逐帧推进：
       目标判定走上面的 80ms 节流，0.3s 的蓄力进度只能用帧来喂 */
    updateInteractHold(realDt);
    updateCrosshair(realDt);
  } else {
    /* IDE / 走廊 / 暂停 / 结算等视图下：准星、蓄力、目标列表都要清零，
       否则回到世界会带着一个满环 / 一份过期的可交互列表 */
    resetCrosshair();
    cancelInteractHold();
    resetInteractTargets();
  }

  /* HUD：左上分数卡 / 正上灵动岛 / 小地图。
     每个渲染函数内部都比过签名，这里的逐帧调用不会真的重排 DOM。 */
  if (state.started && !state.ended){
    const remain = CONTEST_LEN - state.elapsed;
    const txt = fmtTime(remain);
    renderHudTimer(txt, remain < 1800);
    const ideTime = $('ideTime');
    if (ideTime && ideTime.textContent !== txt) ideTime.textContent = txt;

    renderHudTotal(state.totalScore);
    /* 警示次数 / 击倒保安数为 0 时整块不上岛（渲染函数负责隐藏） */
    renderIslandState(state.warnCount, state.guardKills);
    drawMinimap();
  }

  /* 关键优化：IDE / 草稿纸 / 走廊等视图下跳过渲染 */
  if (!VIEW_NO_RENDER.has(state.view) || forceRedraw){
    renderer.render(scene, camera);
    forceRedraw = false;
  }
}
