/* =========================================================
   屏幕边缘反馈：警告 / 击倒 / 喝水的短促边缘光与喝水次数胶囊
   ---------------------------------------------------------
   为什么单独成模块：
     · 触发点在 systems/（warn / guards / teacher / cup），
       它们不该各自去操作 DOM、也不该各写一份定时器；
     · 三层边缘光（黄 / 红 / 蓝）必须能独立叠加：
       一帧里同时被警告又打倒保安时，不能用一个元素互相覆盖。
   动画本身在 styles/effects.css 的 .edge-flash 一段里。
   ========================================================= */
import { edgeAlertEl, edgeDrinkEl, edgeWarnEl, islandDrinkEl } from './dom.js';

/* 与 CSS 的 edgePulse 动画时长对齐（播完就摘掉类，避免一直挂着） */
const EDGE_MS = 950;

/* 喝水次数只在「喝水那一下」短暂上岛，不常驻 —— 它和警告/击倒数不同，
   不是需要一直盯着的状态。 */
const DRINK_CHIP_MS = 2600;

const edgeEls = { warn: edgeWarnEl, alert: edgeAlertEl, drink: edgeDrinkEl };
const edgeTimers = {};

/**
 * 播一次边缘光。
 * @param {'warn'|'alert'|'drink'} kind 黄 / 红 / 蓝
 */
export function flashEdge(kind){
  const el = edgeEls[kind];
  if (!el) return;
  /* 先摘类、强制回流、再加类：连续触发时动画才会从头播，
     否则第二下会被浏览器当成「类没变」而静默吞掉。 */
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(edgeTimers[kind]);
  edgeTimers[kind] = setTimeout(() => el.classList.remove('on'), EDGE_MS);
}

/** 警告：边缘亮黄光。 */
export function flashWarningEdge(){
  flashEdge('warn');
}

/** 击倒监考老师 / 保安：边缘亮红光。 */
export function flashKnockdownEdge(){
  flashEdge('alert');
}

/**
 * 喝水：边缘亮蓝光，并把喝水次数短暂显示在灵动岛上。
 * @param {number} count 本场累计喝水次数
 */
export function flashDrink(count){
  flashEdge('drink');
  if (!islandDrinkEl) return;
  const num = Number(count);
  const shown = Number.isFinite(num) ? num : 0;
  const b = islandDrinkEl.querySelector('b');
  if (b) b.textContent = String(shown);
  islandDrinkEl.classList.remove('hidden');
  islandDrinkEl.classList.remove('bump');
  void islandDrinkEl.offsetWidth;
  islandDrinkEl.classList.add('bump');
  clearTimeout(edgeTimers.drinkChip);
  edgeTimers.drinkChip = setTimeout(() => {
    islandDrinkEl.classList.add('hidden');
    islandDrinkEl.classList.remove('bump');
  }, DRINK_CHIP_MS);
}
