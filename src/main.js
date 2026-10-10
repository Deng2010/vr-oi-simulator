/* =========================================================
   入口：装配渲染核心、抽题、构建世界、绑定事件、启动主循环
   由 index.html 内联脚本第 3243-3294 行拆出。
   ---------------------------------------------------------
   作为 Vite 的入口（index.html 里的 <script type="module">），
   模块脚本天然 defer，执行时 DOM 已经解析完成。
   ========================================================= */
/* 样式入口：内含按原顺序 @import 的 11 个分片样式表 */
import './styles/index.css';

import { bindEvents } from './core/input.js';
import { animate } from './core/loop.js';
import { loadViewSettings } from './core/settings.js';
import { state } from './core/state.js';
import { pickProblems } from './data/problems/index.js';
import { initGraphics } from './render/gfx.js';
import { updateAllDeskScreens } from './render/screen-textures.js';
import { renderHudProbs } from './ui/hud.js';
import { initPaperEvents } from './ui/paper.js';
import { syncViewUI } from './ui/settings-panel.js';
import { buildWorld } from './world/world.js';

export function init(){
  loadViewSettings();
  syncViewUI();

  initGraphics();

  state.problems = pickProblems();
  state.curProb = state.problems[0].id;
  state.npcProbId = state.problems[Math.floor(Math.random() * state.problems.length)].id;

  buildWorld();
  updateAllDeskScreens();
  bindEvents();
  initPaperEvents();
  renderHudProbs();

  animate();
}

/* ---------- 启动引导：负责首屏 loading 与失败兜底 ---------- */
const escapeHtml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function bootReady(){
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 320);
}

function bootFail(err){
  console.error(err);
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.innerHTML =
    '<div class="err">考场初始化失败：' +
    escapeHtml(err && err.message ? err.message : err) +
    '<br><code>若提示 WebGL 不可用，请确认浏览器已开启硬件加速，' +
    '并按 F12 查看控制台详情。</code></div>';
}

const versionEl = document.getElementById('appVersion');
if (versionEl) versionEl.textContent = 'v' + __APP_VERSION__ + ' · MIT License';

try {
  init();
  bootReady();
} catch (e){
  bootFail(e);
}
