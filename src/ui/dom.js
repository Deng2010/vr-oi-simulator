/* =========================================================
   DOM 引用集中注册（模块脚本延迟执行，此时 DOM 已就绪）
   由 index.html 内联脚本第 856-873 行拆出。
   ========================================================= */
import { $ } from '../core/util.js';

export const hud = $('hud'), promptEl = $('prompt'), crosshair = $('crosshair');

export const hudTimer = $('hudTimer'), hudScore = $('hudScore'), hudProbs = $('hudProbs');

export const codeUI = $('codeUI'), codeArea = $('codeArea'), verdictEl = $('verdict');

export const paperUI = $('paperUI'), paperCanvas = $('paperCanvas');

export const corridorUI = $('corridorUI'), corrBar = $('corrBar');

export const bathroomUI = $('bathroomUI'), bathBar = $('bathBar'),
      bathStepText = $('bathStepText'), bathHint = $('bathHint'),
      bathSub = $('bathSub'), bathDots = $('bathDots');

export const teacherDlg = $('teacherDlg'), dlgHead = $('dlgHead'),
      dlgText = $('dlgText'), dlgActions = $('dlgActions');

export const endingUI = $('ending'), toastEl = $('toast');

export const pauseMenu = $('pauseMenu'), redFlash = $('redFlash'),
      dangerVig = $('dangerVignette'), npcComputerUI = $('npcComputerUI');

export const minimapWrap = $('minimapWrap');

export const minimap = $('minimap'), mmCtx = minimap.getContext('2d');

export const achNotify = $('achNotify');

/* ---------- 视角参数 ---------- */
