/* =========================================================
   覆盖层面板的开关（暂停、代码界面等）
   由 index.html 内联脚本第 1739-2227 行拆出。
   ========================================================= */
import { state } from '../core/state.js';
import { $ } from '../core/util.js';
import { codeArea, codeUI, crosshair, dangerVig, pauseMenu, promptEl, verdictEl } from './dom.js';
import { loadProblem, renderProblemList } from './editor.js';
import { syncViewUI } from './settings-panel.js';

export function hideAllPanels(){
  ['hud', 'pauseMenu', 'codeUI', 'paperUI', 'corridorUI',
   'bathroomUI', 'npcComputerUI', 'teacherDlg', 'minimapWrap']
    .forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  dangerVig.classList.remove('on');
}

/* =========================================================
   屏蔽词
   ========================================================= */

export function openPauseMenu(){
  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return;
  state.view = 'pause';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  pauseMenu.classList.remove('hidden');
  syncViewUI();
}

export function closePauseMenu(){
  pauseMenu.classList.add('hidden');
  state.view = 'world';
  crosshair.classList.remove('hidden');
}

export function openCode(){
  state.view = 'code';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  codeUI.classList.remove('hidden');
  verdictEl.classList.add('hidden');
  renderProblemList();
  loadProblem(state.curProb);
  setTimeout(() => codeArea.focus(), 60);
}

export function closeCode(){
  state.view = 'world';
  codeUI.classList.add('hidden');
  crosshair.classList.remove('hidden');
}
