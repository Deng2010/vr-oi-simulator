/* =========================================================
   计分汇总
   由 index.html 内联脚本第 2425-2430 行拆出。
   ========================================================= */
import { state } from '../core/state.js';
import { renderHudProbs } from '../ui/hud.js';

export function recalcScore(){
  let total = 0;
  state.problems.forEach(p => { total += (state.score[p.id] || 0); });
  state.totalScore = total;
  renderHudProbs();
}
