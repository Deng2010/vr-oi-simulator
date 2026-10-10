/* =========================================================
   动态屏幕贴图：显示器画面随得分 / 切题实时重绘
   由 index.html 内联脚本第 849-1165 行拆出。
   ========================================================= */
import { state } from '../core/state.js';
import { STARTER_TEMPLATE } from '../data/problems/template.js';

export const deskScreens = [];   // 每台显示器的 { ctx, tex }，用于后续刷新

export function drawDeskScreen(cx, w, h){
  cx.fillStyle = '#0b0f16'; cx.fillRect(0, 0, w, h);
  cx.fillStyle = '#131b26'; cx.fillRect(0, 0, w, 34);
  cx.fillStyle = '#5b8cff'; cx.fillRect(0, 32, w, 2);
  cx.fillStyle = '#8ea6d8'; cx.font = 'bold 16px Consolas, monospace';
  cx.fillText('NOI 2026  Contest Environment', 14, 23);

  /* 题目列表 */
  cx.fillStyle = '#1a2330'; cx.fillRect(12, 48, w - 24, 100);
  cx.font = '15px Consolas, monospace';
  const probs = (state.problems && state.problems.length) ? state.problems : [];
  probs.slice(0, 4).forEach((p, i) => {
    const sc = state.score[p.id] || 0;
    const maxScore = p.max || 100;
    const label = (p.id + '  ' + p.name).slice(0, 24);
    const pad = ' '.repeat(Math.max(1, 24 - label.length));
    let status, color;
    if (sc >= maxScore)      { status = '[ 已 AC ]';  color = '#4fd1c5'; }
    else if (sc > 0)         { status = '[ 部分分 ]'; color = '#ffcc57'; }
    else                     { status = '[ 未提交 ]'; color = '#8a92a5'; }
    cx.fillStyle = color;
    cx.fillText(label + pad + status, 26, 76 + i * 24);
  });

  cx.fillStyle = '#3a4456'; cx.fillRect(12, 152, w - 24, 2);

  /* 代码预览：起手模板前 9 行。
     所有题目共用同一份模板，所以这里直接用常量，
     不需要等题面懒加载完成（原先读 state.problems[0].starter）。 */
  cx.font = '14px Consolas, monospace';
  const lines = STARTER_TEMPLATE.split('\n').slice(0, 9);
  lines.forEach((l, i) => {
    let color = '#8fa8c8';
    if (/^\s*#/.test(l))                     color = '#c586c0';
    else if (/\/\//.test(l))                 color = '#5a6b80';
    else if (/(cin|cout|return|int main)/.test(l)) color = '#9cdcfe';
    cx.fillStyle = color;
    cx.fillText(l.slice(0, 62), 24, 182 + i * 22);
  });
}

export function updateAllDeskScreens(){
  for (const s of deskScreens){
    drawDeskScreen(s.ctx, 640, 384);
    s.tex.needsUpdate = true;
  }
}

/* 合并短时间内的多次调用（例如连续提交），避免 6 张画布反复全量重绘 */

export let deskScreenTimer = null;

export function scheduleDeskScreensUpdate(){
  if (deskScreenTimer) return;
  deskScreenTimer = setTimeout(() => {
    deskScreenTimer = null;
    updateAllDeskScreens();
  }, 80);
}
