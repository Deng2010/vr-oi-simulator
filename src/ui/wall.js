/* =========================================================
   启动屏「展示墙」：陈列已解锁的成就与结局
   ---------------------------------------------------------
   规则只有一条：**没达成的一律不渲染**。
   成就/结局的名字本身就带剧透（「零分传奇」「作弊认定」），
   所以未解锁的条目从 DOM 里就消失，而不是靠 CSS 藏起来 ——
   藏起来的东西用 F12 就能看回来。

   标题上给「已解锁 / 总数」，让玩家知道还有东西没找到，但不剧透是什么。
   数据来自 systems/profile.js（跨场次的图鉴存档），不是 state.achievements
   （那是**本场**的成就，进场前是空的）。
   ========================================================= */
import { ENDINGS } from '../data/endings/index.js';
import { achievementRows, endingRows, readProfile } from '../systems/profile.js';
import { ACHIEVEMENTS } from './achievements.js';
import { wallAchCountEl, wallAchEl, wallEndCountEl, wallEndEl } from './dom.js';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s).replace(/[&<>"']/g, c => ESC_MAP[c]);

/* 成就表是 { id: {name, desc} } 的映射，结局表本身就是数组 */
const achievementCatalog = () =>
  Object.keys(ACHIEVEMENTS).map(id => ({ id, ...ACHIEVEMENTS[id] }));

const EMPTY_ACH = '还没有解锁任何成就 —— 去考场上待满一场，总会拿到点什么。';
const EMPTY_END = '还没有开出任何结局 —— 打完一场（或者惹点事）就会在这里留下记录。';

const countBadge = n => (n > 1 ? `<span class="wi-n">×${n}</span>` : '');

/** 重绘整面墙。切到展示墙分页时、以及启动时各调一次。 */
export function renderWall(){
  /* 模板被删/改名时宁可空着，也不要在这里抛错把整个启动流程带崩 */
  if (!wallAchEl || !wallEndEl || !wallAchCountEl || !wallEndCountEl) return;

  const profile = readProfile();

  const achRows = achievementRows(profile, achievementCatalog());
  wallAchCountEl.textContent = `${achRows.length} / ${Object.keys(ACHIEVEMENTS).length}`;
  wallAchEl.innerHTML = achRows.length
    ? achRows.map(r =>
        '<div class="wall-item">' +
        `<div class="wi-name">\u{1F3C6} ${esc(r.name)}${countBadge(r.n)}</div>` +
        (r.desc ? `<div class="wi-desc">${esc(r.desc)}</div>` : '') +
        '</div>').join('')
    : `<p class="wall-empty">${EMPTY_ACH}</p>`;

  const endRows = endingRows(profile, ENDINGS);
  wallEndCountEl.textContent = `${endRows.length} / ${ENDINGS.length}`;
  wallEndEl.innerHTML = endRows.length
    ? endRows.map(r =>
        `<div class="wall-item" data-tone="${esc(r.tone)}">` +
        (r.badge ? `<div class="wi-tag">${esc(r.badge)}</div>` : '') +
        `<div class="wi-title">${esc(r.title)}${countBadge(r.n)}</div>` +
        '</div>').join('')
    : `<p class="wall-empty">${EMPTY_END}</p>`;
}
