/* =========================================================
   HUD：总分 / 警告数 / 题目进度
   由 index.html 内联脚本第 2424-2445 行拆出。
   ========================================================= */
import { state } from '../core/state.js';
import { hudProbs } from './dom.js';

export let lastHudProbsKey = '';

export function renderHudProbs(){
  const key = state.problems.map(p => p.id + '|' + (state.score[p.id] || 0)).join(',');
  if (key === lastHudProbsKey) return;
  lastHudProbsKey = key;
  hudProbs.innerHTML = state.problems.map(p => {
    const sc = state.score[p.id] || 0;
    return `<div class="row ${sc >= p.max ? 'ac' : ''}">
              <span>${p.id} ${p.name}</span><b>${sc}</b>
            </div>`;
  }).join('');
}
