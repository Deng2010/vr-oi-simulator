/* =========================================================
   轻提示条
   由 index.html 内联脚本第 854-934 行拆出。
   ========================================================= */
import { toastEl } from './dom.js';

export let toastTimer = null;

export function toast(text, ms){
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2000);
}
