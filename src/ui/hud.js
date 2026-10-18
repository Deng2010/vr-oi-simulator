/* =========================================================
   HUD 渲染：左上分数卡 / 正上灵动岛 / 右上可交互对象列表
   ---------------------------------------------------------
   这里只做「把状态翻译成 DOM」，判定与候选生成在
   systems/interaction.js 与 systems/targeting.js 里。
   每个渲染函数都先比签名再碰 DOM：主循环每帧都会调用它们，
   但真正变化的只有计时器、分数和偶尔出现的状态胶囊。
   ========================================================= */
import { state } from '../core/state.js';
import {
  hudProbs, hudTargets, hudTimer, hudTotal, islandAchEl, islandAchNameEl,
  islandGuardsEl, islandWarnEl, tgList
} from './dom.js';

export let lastHudProbsKey = '';

const escapeHtml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* ---------- 左上：总分 + 每题得分 ---------- */

export function renderHudProbs(){
  const key = state.problems.map(p => p.id + '|' + (state.score[p.id] || 0)).join(',');
  if (key === lastHudProbsKey) return;
  lastHudProbsKey = key;
  hudProbs.innerHTML = state.problems.map(p => {
    const sc = state.score[p.id] || 0;
    return `<div class="row ${sc >= p.max ? 'ac' : ''}">` +
      `<span class="p-id">${escapeHtml(p.id)}</span>` +
      `<span class="p-name">${escapeHtml(p.name)}</span>` +
      `<b>${sc}</b></div>`;
  }).join('');
}

let lastTotal = -1;

/** 总分（预测试口径）。与每题得分分开更新，避免整块重绘。 */
export function renderHudTotal(total){
  const n = Number(total) || 0;
  if (n === lastTotal) return;
  lastTotal = n;
  if (hudTotal) hudTotal.textContent = String(n);
}

/* ---------- 正上：灵动岛 ---------- */

let lastTimer = '';
let lastTimerWarn = null;

/**
 * 计时器文本与「快没时间了」的红色状态。
 * @param {string} txt 格式化后的剩余时间
 * @param {boolean} warn 是否进入最后 30 分钟
 */
export function renderHudTimer(txt, warn){
  if (hudTimer && txt !== lastTimer){
    lastTimer = txt;
    hudTimer.textContent = txt;
  }
  if (warn !== lastTimerWarn){
    lastTimerWarn = warn;
    if (hudTimer) hudTimer.classList.toggle('warn', !!warn);
  }
}

/**
 * 警告 / 击倒保安：只有正整数才上岛。
 * 值变化时补一次 bump 动画，让「刚发生」这件事有反馈。
 * @param {number} warn 警告次数
 * @param {number} guards 已击倒保安数
 */
export function renderIslandState(warn, guards){
  renderIslandChip(islandWarnEl, warn);
  renderIslandChip(islandGuardsEl, guards);
}

const lastChipValue = new WeakMap();

function renderIslandChip(el, value){
  if (!el) return;
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  const prev = lastChipValue.has(el) ? lastChipValue.get(el) : -1;
  if (n === prev) return;
  lastChipValue.set(el, n);

  const show = n > 0;
  el.classList.toggle('hidden', !show);
  if (!show) return;

  const b = el.querySelector('b');
  if (b) b.textContent = String(n);
  /* 重新触发动画：连续两次警告也要看到两下 bump */
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/* 成就行停留时长：和右下角保底通知条一致，3.2s 够读完一个成就名 */
const ACH_ISLAND_MS = 3200;
let achIslandTimer = null;

/**
 * 比赛中解锁成就：在灵动岛时间下方短暂滚出一行。
 * 只在世界视图下由 ui/achievements.js 调用；走廊 / 结算等
 * 全屏覆盖层下 HUD 被盖住，那边仍走右下角的通知条。
 * @param {string} name 成就名
 * @returns {boolean} 是否成功显示（元素缺失时调用方回退到通知条）
 */
export function showIslandAchievement(name){
  if (!islandAchEl || !islandAchNameEl) return false;
  islandAchNameEl.textContent = name || '成就解锁';
  islandAchEl.classList.remove('hidden');
  islandAchEl.classList.remove('show');
  /* 连续解锁两个成就时也要重新播一次入场动画 */
  void islandAchEl.offsetWidth;
  islandAchEl.classList.add('show');
  clearTimeout(achIslandTimer);
  achIslandTimer = setTimeout(() => {
    islandAchEl.classList.add('hidden');
    islandAchEl.classList.remove('show');
  }, ACH_ISLAND_MS);
  return true;
}

/* ---------- 右上：可交互对象列表 ---------- */

let lastTargetsKey = '';

/**
 * 渲染候选对象列表与当前高亮项。
 * @param {Array<{key:string,name:string,emoji:string,hint?:string,disabled?:boolean}>} list
 * @param {string} selectedKey 当前选中的 key（空字符串 = 没有选中）
 */
export function renderTargets(list, selectedKey){
  if (!hudTargets || !tgList) return;
  const items = list || [];
  /* 签名里带上名字 / 按键 / 禁用态：NPC 从「坐着」变成「离座」时
     key 不变，但动作与提示都变了，只看 key 会留下旧文案。 */
  const key = (selectedKey || '') + '|' + items.map(t =>
    `${t.key}:${t.name}:${t.hint || ''}:${t.disabled ? 1 : 0}`
  ).join(',');
  if (key === lastTargetsKey) return;
  lastTargetsKey = key;

  if (!items.length){
    tgList.innerHTML = '<div class="tg-empty">环顾四周，寻找可交互对象</div>';
    return;
  }

  tgList.innerHTML = items.map(t => {
    const cls = ['tg-item'];
    if (t.key === selectedKey) cls.push('on');
    if (t.disabled) cls.push('off');
    const hint = t.hint ? `<kbd>${escapeHtml(t.hint)}</kbd>` : '';
    return `<div class="${cls.join(' ')}" data-key="${escapeHtml(t.key)}">` +
      `<span class="tg-emoji" aria-hidden="true">${escapeHtml(t.emoji || '\u2726')}</span>` +
      `<span class="tg-name">${escapeHtml(t.name || '可交互对象')}</span>${hint}</div>`;
  }).join('');
}

/** 离开世界视图时清空列表（避免 IDE / 暂停菜单下面留着上一帧的目标）。 */
export function clearTargets(){
  renderTargets([], '');
}
