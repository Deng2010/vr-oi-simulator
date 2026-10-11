/* =========================================================
   启动屏分页：简介 / 设置 / 关于
   ---------------------------------------------------------
   三个分页始终都在 DOM 里（同一份 partial），只切换可见性 ——
   所以滑条的 input 事件在进考场之前就已经绑定好了，
   切页不需要重新 bindEvents。
   ========================================================= */
import { startPageEls, startTabEls } from './dom.js';

export const START_PAGES = ['intro', 'settings', 'about'];

let curPage = 'intro';

/* 切到指定分页。名字非法时回落到「简介」，避免三个分页全被隐藏后
   启动屏看起来是一片空白。 */
export function showStartPage(name){
  curPage = START_PAGES.includes(name) ? name : 'intro';
  startTabEls.forEach(b => b.classList.toggle('on', b.dataset.startTab === curPage));
  startPageEls.forEach(p => p.classList.toggle('hidden', p.dataset.startPage !== curPage));
}

export function bindStartTabs(){
  startTabEls.forEach(b => { b.onclick = () => showStartPage(b.dataset.startTab); });
  showStartPage(curPage);
}
