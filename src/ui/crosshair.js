/* =========================================================
   准星状态机：十字 / 交互与攻击 45° 旋转 / 按住确认进度环
   ---------------------------------------------------------
   分工（为什么拆成两半）：
     · systems/interaction.js 每 80ms 判一次「现在瞄到了什么」，
       并逐帧推进「按住」的蓄力进度；
     · core/loop.js 每帧调用 updateCrosshair()，这里只负责画。
   环的进度在 JS 里做指数平滑而不是交给 CSS transition：
   蓄力只有 0.3s，CSS 过渡会让弧线明显滞后于手指。
   视觉样式全部在 styles/hud.css 的 #crosshair 一段里。
   ========================================================= */
import { chRingFill, crosshair } from './dom.js';

/* 环长不问自己、直接问浏览器：viewBox 的缩放与 r 都会改变真实路径长度，
   写死的常数一旦和 path 对不上，就会永远露出一小段弧。
   （踩过：把准星改小时只改了 CSS 的宽高，没改 viewBox/r，
     结果 2πr=75.4 只覆盖了真实路径的 80%，没蓄力时也画着 20% 的弧。） */
const RING_LEN = chRingFill.getTotalLength ? chRingFill.getTotalLength() : 2 * Math.PI * 12;
chRingFill.style.strokeDasharray = RING_LEN + 'px';

/* 与 CSS 的 chConfirm 动画时长对齐（回执播完就摘掉类） */
const CONFIRM_SECONDS = 0.3;

/* 进度平滑的时间常数：0.06s 意味着蓄力走满时弧线已经跟上（≈99%），
   松手时又能在 0.2s 内优雅地退回去，而不是啪一下归零。 */
const SMOOTH_TAU = 0.06;

let mode = 'idle';        /* idle | interact | attack */
let target = '';          /* 当前目标标识 */
let holdP = 0;            /* 目标进度（0~1，由 interaction.js 的蓄力写入） */
let shownP = 0;           /* 平滑后的进度（真正画出来的） */
let confirmT = 0;         /* 「已触发」回执的剩余秒数 */
let lastSig = '';         /* 上次写进 classList 的状态（避免每帧碰 DOM） */
let lastOffset = -1;      /* 上次写进 stroke-dashoffset 的值 */

/**
 * 由 systems/interaction.js 的交互判定写入。
 * @param {'idle'|'interact'|'attack'} nextMode
 * @param {string} nextTarget 目标标识
 */
export function setCrosshairTarget(nextMode, nextTarget){
  const nt = nextTarget || '';
  if (nextMode === mode && nt === target) return;
  mode = nextMode;
  target = nt;
  /* 目标换了，正在走的蓄力进度作废（interaction.js 会同时取消蓄力） */
  holdP = 0;
}

/**
 * 蓄力进度。由 systems/interaction.js 每帧写入。
 * @param {number} p 0~1
 */
export function setCrosshairHold(p){
  holdP = p > 0 ? Math.min(p, 1) : 0;
}

/** 蓄满触发：环向外扩散淡出，作为一次性的「已确认」回执 */
export function confirmCrosshair(){
  holdP = 0;
  confirmT = CONFIRM_SECONDS;
}

/** 离开世界视图（IDE / 走廊 / 结算 / 暂停）后清空，免得回世界带着满环 */
export function resetCrosshair(){
  mode = 'idle';
  target = '';
  holdP = 0;
  shownP = 0;
  confirmT = 0;
  updateCrosshair(0);
}

/**
 * 逐帧刷新准星的类名与进度环。
 * @param {number} dt 秒
 */
export function updateCrosshair(dt){
  shownP += (holdP - shownP) * (1 - Math.exp(-dt / SMOOTH_TAU));
  if (Math.abs(holdP - shownP) < 0.002) shownP = holdP;

  /* 触发回执期间画满整圈：扩散出去的应该是一个完整的圆，
     而不是「蓄力到几成就扩散几成」的半截弧 */
  const drawP = confirmT > 0 ? 1 : shownP;

  /* 两端各自贴着 0 与整圈：否则量化误差会让环在「没蓄力」时也露一小段 */
  let offset;
  if (drawP <= 0) offset = RING_LEN;
  else if (drawP >= 1) offset = 0;
  else offset = Math.round(RING_LEN * (1 - drawP) * 8) / 8;
  if (offset !== lastOffset){
    lastOffset = offset;
    chRingFill.style.strokeDashoffset = offset.toFixed(2) + 'px';
  }

  if (confirmT > 0) confirmT = Math.max(0, confirmT - dt);

  const sig = mode + '|' + (holdP > 0) + '|' + (confirmT > 0);
  if (sig !== lastSig){
    lastSig = sig;
    crosshair.classList.toggle('interact', mode === 'interact');
    crosshair.classList.toggle('attack', mode === 'attack');
    crosshair.classList.toggle('hold', holdP > 0);
    crosshair.classList.toggle('confirm', confirmT > 0);
  }
}
