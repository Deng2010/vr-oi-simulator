/* =========================================================
   设置面板 UI 与设置值的双向同步
   由 index.html 内联脚本第 912-928 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { smoothAmount, timeScale, turnSpeed, turnToSlider } from '../core/settings.js';
import { $ } from '../core/util.js';

export function syncViewUI(){
  const tv = turnToSlider(turnSpeed);
  const smv = Math.round(smoothAmount * 100);
  const volv = Math.round(audio.volume * 100);
  ['turnSliderStart', 'turnSlider'].forEach(id => { const e = $(id); if (e) e.value = tv; });
  ['turnValueStart', 'turnValue'].forEach(id => { const e = $(id); if (e) e.textContent = turnSpeed.toFixed(1); });
  ['smoothSliderStart', 'smoothSlider'].forEach(id => { const e = $(id); if (e) e.value = smv; });
  ['smoothValueStart', 'smoothValue'].forEach(id => { const e = $(id); if (e) e.textContent = smv + '%'; });
  ['timeSliderStart', 'timeSlider'].forEach(id => { const e = $(id); if (e) e.value = timeScale; });
  ['timeValueStart', 'timeValue'].forEach(id => { const e = $(id); if (e) e.textContent = Math.round(timeScale) + '×'; });
  ['volSliderStart', 'volSlider'].forEach(id => { const e = $(id); if (e) e.value = volv; });
  ['volValueStart', 'volValue'].forEach(id => { const e = $(id); if (e) e.textContent = volv + '%'; });
  const mt = $('muteToggle');
  if (mt) mt.classList.toggle('on', !audio.muted);
}

/* ---------- Toast / 成就 ---------- */
