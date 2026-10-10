/* =========================================================
   屏蔽词检测与取消成绩
   由 index.html 内联脚本第 1751-1807 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { $ } from '../core/util.js';
import { scene } from '../render/gfx.js';
import { securityGuards } from '../world/entities.js';
import { unlockAch } from '../ui/achievements.js';
import { crosshair, dlgActions, dlgHead, dlgText, promptEl, teacherDlg } from '../ui/dom.js';
import { showEnding } from '../ui/ending.js';
import { hideAllPanels } from '../ui/panels.js';

export const BANNED_WORDS = [
  'fuck', 'fucking', 'fucker', 'fucked',
  'shit', 'bullshit', 'bitch', 'asshole', 'bastard',
  'ccf', 'ccccf',
  '傻逼', '妈的', '操你', '尼玛', '你妈',
  '滚蛋', '垃圾出题人', '垃圾比赛'
];

export function containsBannedWord(code){
  const lower = code.toLowerCase();
  for (const w of BANNED_WORDS){
    if (lower.includes(w.toLowerCase())) return w;
  }
  return null;
}

export function showBannedWordDialog(word){
  dlgHead.textContent = '\u{1F468}\u200D\u{1F3EB} 监考老师';
  const display = word.toUpperCase();
  dlgText.textContent =
    `等等……\n\n` +
    `我在你的代码里看到了 "${display}"。\n\n` +
    `这是暴戾语言。根据《NOI 竞赛纪律》，考试期间任何形式的\n` +
    `不文明用语都会被记录，并取消本次比赛成绩。\n\n` +
    `请跟我去考务办公室。`;
  dlgActions.innerHTML = '';
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = '……（无法辩解）';
  b.onclick = () => endByBannedWord(word);
  dlgActions.appendChild(b);
  teacherDlg.classList.remove('hidden');
  state.view = 'dialog';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  audio.beep(180, 0.5, 0.06, 'sawtooth');
  setTimeout(() => audio.beep(120, 0.7, 0.06, 'sawtooth'), 250);
}

export function endByBannedWord(word){
  if (state.ended) return;
  state.ended = true;
  hideAllPanels();
  for (const g of securityGuards) scene.remove(g.group);
  securityGuards.length = 0;
  unlockAch('banned');

  $('endTitle').textContent = '取 消 成 绩';
  $('endSub').textContent = `你的代码中包含暴戾语言 "${word.toUpperCase()}"。`;
  showEnding(0,
    `监考老师把你的代码截了图，作为证据附在违纪记录里。\n` +
    `本次比赛成绩作废。\n\n` +
    `赛场上可以打暴力，不能打嘴炮。\n下次请注意文明用语。`);
}
