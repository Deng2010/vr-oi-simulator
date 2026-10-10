/* =========================================================
   洗手间过场
   由 index.html 内联脚本第 2115-2199 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { bathBar, bathDots, bathHint, bathStepText, bathSub, bathroomUI, crosshair, promptEl } from '../ui/dom.js';

export const BATHROOM_STEPS = [
  { text: '走向小便池',       key: 'w',     hold: 1.8, hint: '按住 W 前进' },
  { text: '解手',             key: 'space', hold: 3.0, hint: '按住 空格 解手' },
  { text: '走向洗手池',       key: 'w',     hold: 1.6, hint: '按住 W 前进' },
  { text: '洗手',             key: 'space', hold: 2.5, hint: '按住 空格 洗手' },
  { text: '擦干双手',         key: 'space', hold: 1.5, hint: '按住 空格 擦干' },
  { text: '整理衣物，准备返回', key: 'e',   hold: 0,   hint: '按 E 离开洗手间' }
];

export let bathroomStepIdx = 0;

/* 离开洗手间只登记意图，由主循环调用 takePendingExit() 后再进走廊 */
let pendingExit = false;

export function takePendingExit(){
  const v = pendingExit;
  pendingExit = false;
  return v;
}

export let bathroomHold = 0;

export let lastBathroomStepIdx = -1;    // 只在步骤切换时重建 dots / 文本

export function startBathroom(){
  state.view = 'bathroom';
  state.keys = {};
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  bathroomUI.classList.remove('hidden');
  bathroomStepIdx = 0;
  bathroomHold = 0;
  lastBathroomStepIdx = -1;
  updateBathroomUI();
}

export function updateBathroomUI(){
  const step = BATHROOM_STEPS[bathroomStepIdx];
  if (!step) return;

  /* 仅在步骤切换时写文本、重建圆点 */
  if (bathroomStepIdx !== lastBathroomStepIdx){
    lastBathroomStepIdx = bathroomStepIdx;
    bathStepText.textContent = step.text;
    bathHint.textContent = step.hint;
    bathSub.textContent = `第 ${bathroomStepIdx + 1} / ${BATHROOM_STEPS.length} 步`;

    let html = '';
    for (let i = 0; i < BATHROOM_STEPS.length; i++){
      let cls = '';
      if (i < bathroomStepIdx) cls = 'done';
      else if (i === bathroomStepIdx) cls = 'on';
      html += `<i class="${cls}"></i>`;
    }
    bathDots.innerHTML = html;
  }

  /* 每帧只更新进度条宽度 */
  if (step.key === 'e'){
    bathBar.style.width = '100%';
  } else {
    bathBar.style.width = Math.min(100, (bathroomHold / step.hold) * 100) + '%';
  }
}

export function updateBathroom(realDt){
  const step = BATHROOM_STEPS[bathroomStepIdx];
  if (!step) return;
  if (step.key === 'e'){ bathBar.style.width = '100%'; return; }

  let pressing = false;
  if (step.key === 'w' && state.keys['w']) pressing = true;
  if (step.key === 'space' && state.keys['space']) pressing = true;

  if (pressing){
    bathroomHold += realDt;
    if (bathroomHold >= step.hold){
      bathroomStepIdx++;
      bathroomHold = 0;
      if (bathroomStepIdx >= BATHROOM_STEPS.length){ finishBathroom(); return; }
      audio.beep(660, 0.06, 0.035);
    }
  } else {
    bathroomHold = Math.max(0, bathroomHold - realDt * 0.6);
  }
  updateBathroomUI();
}

export function finishBathroom(){
  bathroomUI.classList.add('hidden');
  pendingExit = true;
}
