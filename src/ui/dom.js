/* =========================================================
   DOM 引用集中注册（模块脚本延迟执行，此时 DOM 已就绪）
   由 index.html 内联脚本第 856-873 行拆出。
   ========================================================= */
import { $ } from '../core/util.js';

export const hud = $('hud'), promptEl = $('prompt'), crosshair = $('crosshair');

/* 准星蓄力进度环（准星内部的 SVG 圆环，见 partials/hud.html） */
export const chRingFill = document.querySelector('#crosshair .ch-ring-fill');

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

/* 启动屏分页：选项卡与分页容器都是静态 DOM，模块加载时一次性抓齐 */
export const startTabEls = Array.from(document.querySelectorAll('[data-start-tab]'));

export const startPageEls = Array.from(document.querySelectorAll('[data-start-page]'));

/* 赛后系统测试与揭榜的节点（见 partials/ending.html）。
   这些是静态 DOM，模块加载时一次性抓齐即可。
   跳过按钮由 core/input.js 用 $('btnSkipTest') 绑定，这里不需要导出。 */
export const sysTestEl = $('sysTest'), endResultEl = $('endResult'),
      stRuns = $('stRuns'), stLog = $('stLog');

/* 结局徽章 / 事件回顾（结局系统用，见 ui/ending.js） */
export const endBadgeEl = $('endBadge'), endEventsEl = $('endEvents');

/* 启动屏「展示墙」的节点（见 partials/start.html）：
   标题上的「已解锁 / 总数」与两个列表。内容由 ui/wall.js 渲染。 */
export const wallAchEl = $('wallAch'), wallAchCountEl = $('wallAchCount'),
      wallEndEl = $('wallEnd'), wallEndCountEl = $('wallEndCount');

/* 结局正文播放器（见 partials/story.html + ui/story.js）：
   全屏覆盖层、逐段打出来的正文、底部提示与进度。 */
export const storyUI = $('endingStory'), storyBodyEl = $('storyText'),
      storyBadgeEl = $('storyBadge'), storyHintEl = $('storyHint'),
      storyProgressEl = $('storyProgress');

/* ---------- 视角参数 ---------- */
