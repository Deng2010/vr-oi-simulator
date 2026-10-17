/* =========================================================
   启动屏分页：简介 / 设置 / 展示墙 / 关于
   ---------------------------------------------------------
   分页始终都在 DOM 里（同一份 partial），只切换可见性 ——
   所以滑条的 input 事件在进考场之前就已经绑定好了，
   切页不需要重新 bindEvents。
   展示墙的内容不是静态的：每次切过去都重绘一次（ui/wall.js），
   否则打完一局回来还得刷新页面才能看到新解锁的东西。
   ========================================================= */
import { startPageEls, startTabEls } from './dom.js';
import { renderWall } from './wall.js';

export const START_PAGES = ['intro', 'settings', 'wall', 'about'];

let curPage = 'intro';

/* 切到指定分页。名字非法时回落到「简介」，避免分页全被隐藏后
   启动屏看起来是一片空白。 */
export function showStartPage(name){
  curPage = START_PAGES.includes(name) ? name : 'intro';
  startTabEls.forEach(b => b.classList.toggle('on', b.dataset.startTab === curPage));
  startPageEls.forEach(p => p.classList.toggle('hidden', p.dataset.startPage !== curPage));
  /* 展示墙每次显露都重读一次图鉴：另一个标签页刚打完一局也能看到 */
  if (curPage === 'wall') renderWall();
}

export function bindStartTabs(){
  startTabEls.forEach(b => { b.onclick = () => showStartPage(b.dataset.startTab); });
  showStartPage(curPage);
  /* 启动时先渲染一次：切到展示墙时不会先闪一下空列表 */
  renderWall();
}
