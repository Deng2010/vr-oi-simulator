/* =========================================================
   评测结果展示与提交入口
   由 index.html 内联脚本第 2353-2422 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { $ } from '../core/util.js';
import { KEYWORDS_LIST } from '../data/keywords.js';
import { scheduleDeskScreensUpdate } from '../render/screen-textures.js';
import { containsBannedWord, showBannedWordDialog } from '../systems/banned.js';
import { recalcScore } from '../systems/score.js';
import { judgeUnified } from '../systems/scoring.js';
import { unlockAch } from './achievements.js';
import { verdictEl } from './dom.js';
import { renderProblemList, saveCode } from './editor.js';

export function judgeCode(code, prob){
  return judgeUnified(code, prob, KEYWORDS_LIST);
}

export function submitCode(){
  saveCode();
  const prob = state.problems.find(x => x.id === state.curProb);
  const code = state.code[state.curProb];

  const badWord = containsBannedWord(code);
  if (badWord){
    showBannedWordDialog(badWord);
    return;
  }

  const btn = $('btnSubmit');
  btn.disabled = true;

  verdictEl.classList.remove('hidden');
  verdictEl.innerHTML = `
    <h4>评测中… <span style="color:#5b8cff">${prob.id}</span></h4>
    <div class="judging">正在编译 & 运行测试数据…</div>
    <div class="barwrap"><i id="jbar"></i></div>
  `;
  audio.beep(680, 0.06, 0.04);

  let prog = 0;
  const iv = setInterval(() => {
    prog += 7 + Math.random() * 12;
    const bar = $('jbar');
    if (bar) bar.style.width = Math.min(100, prog) + '%';
    if (prog >= 100){
      clearInterval(iv);
      const res = judgeCode(code, prob);
      state.score[prob.id] = Math.max(state.score[prob.id] || 0, res.score);
      state.submitCount[prob.id] = (state.submitCount[prob.id] || 0) + 1;
      recalcScore();
      renderVerdict(prob, res);
      renderProblemList();
      /* 桌面显示器贴图重绘合并到一次调度里 */
      scheduleDeskScreensUpdate();
      btn.disabled = false;
      if (res.score >= prob.max){
        audio.beep(880, 0.15, 0.05);
        unlockAch('first_ac');
        if (state.problems.every(p => (state.score[p.id] || 0) >= p.max)) unlockAch('full_score');
      } else if (res.score > 0) audio.beep(560, 0.15, 0.045);
      else audio.beep(220, 0.25, 0.05);
    }
  }, 130);
}

export function renderVerdict(prob, res){
  const statusText = res.status === 'AC' ? 'Accepted' :
                     res.status === 'CE' ? 'Compile Error' :
                     res.status === 'PART' ? 'Partial' : 'Wrong Answer';
  const color = res.status === 'AC' ? '#38d39f' :
                res.status === 'CE' ? '#8b95a9' :
                res.status === 'PART' ? '#ffcc57' : '#ff5f6d';
  verdictEl.innerHTML = `
    <h4>${prob.id} 评测结果 <span style="color:${color}">${res.score} 分</span></h4>
    <div style="color:${color};font-size:12px;margin-bottom:12px;font-family:monospace">${statusText}</div>
    <div class="cases">${res.cases.map(c =>
      `<div class="case ${c.status}">#${c.id}<br>${c.status}</div>`).join('')}</div>
    <div style="margin-top:12px;font-size:11px;color:#5d6880">
      ${res.status === 'CE' ? '提示：代码中未找到 main 函数或代码过短。' : ''}
      ${res.status !== 'AC' && res.status !== 'CE' ? '提示：检查算法复杂度与边界情况。' : ''}
      ${res.status === 'AC' ? '\u{1F389} 恭喜！这道题你拿到了满分。' : ''}
    </div>`;
}
