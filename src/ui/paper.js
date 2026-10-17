/* =========================================================
   草稿纸（鼠标书写 + 背景纸纹）
   由 index.html 内联脚本第 2446-2541 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { $ } from '../core/util.js';
import { bump, recordEvent } from '../systems/stats.js';
import { crosshair, paperCanvas, paperUI, promptEl } from './dom.js';

export let paperCtx = null, drawing = false, lastPt = null;

export let paperBackup = null;

export function openPaper(){
  state.view = 'paper';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  paperUI.classList.remove('hidden');
  bump('paperOpened');
  recordEvent('paper', '取来草稿纸打草稿');
  const c = paperCanvas;
  requestAnimationFrame(() => {
    const rect = c.getBoundingClientRect();
    const nw = Math.floor(rect.width), nh = Math.floor(rect.height);
    const oldCanvas = paperBackup;
    c.width = nw; c.height = nh;
    paperCtx = c.getContext('2d');
    if (oldCanvas){
      paperCtx.drawImage(oldCanvas, 0, 0, nw, nh);
    } else {
      paintPaperBackground();
    }
    paperCtx.lineCap = 'round';
    paperCtx.lineJoin = 'round';
  });
}

export function paintPaperBackground(){
  const c = paperCanvas;
  paperCtx.fillStyle = '#f5f2ea';
  paperCtx.fillRect(0, 0, c.width, c.height);
  paperCtx.strokeStyle = '#e8dfcc';
  paperCtx.lineWidth = 1;
  for (let y = 40; y < c.height; y += 34){
    paperCtx.beginPath(); paperCtx.moveTo(0, y); paperCtx.lineTo(c.width, y); paperCtx.stroke();
  }
  paperCtx.strokeStyle = '#e0a0a0';
  paperCtx.beginPath(); paperCtx.moveTo(70, 0); paperCtx.lineTo(70, c.height); paperCtx.stroke();
}

export function closePaper(){
  /* 备份内容，resize 后还原 */
  const c = paperCanvas;
  paperBackup = document.createElement('canvas');
  paperBackup.width = c.width;
  paperBackup.height = c.height;
  paperBackup.getContext('2d').drawImage(c, 0, 0);
  state.view = 'world';
  paperUI.classList.add('hidden');
  crosshair.classList.remove('hidden');
}

export function initPaperEvents(){
  const c = paperCanvas;
  const getPos = e => {
    const r = c.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (cx - r.left) * (c.width / r.width),
      y: (cy - r.top) * (c.height / r.height)
    };
  };
  const down = e => {
    e.preventDefault();
    drawing = true; lastPt = getPos(e);
    paperCtx.strokeStyle = '#1b2330'; paperCtx.lineWidth = 2.2;
    paperCtx.beginPath();
    paperCtx.arc(lastPt.x, lastPt.y, 1.1, 0, Math.PI * 2);
    paperCtx.fillStyle = '#1b2330'; paperCtx.fill();
    audio.beep(320 + Math.random() * 120, 0.02, 0.015);
  };
  const move = e => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    paperCtx.beginPath();
    paperCtx.moveTo(lastPt.x, lastPt.y);
    paperCtx.lineTo(p.x, p.y);
    paperCtx.stroke();
    lastPt = p;
  };
  const up = () => { drawing = false; };

  c.addEventListener('mousedown', down);
  c.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  c.addEventListener('touchstart', down, { passive: false });
  c.addEventListener('touchmove', move, { passive: false });
  c.addEventListener('touchend', up);

  $('btnClearPaper').onclick = () => {
    paintPaperBackground();
    paperBackup = null;
  };
  $('btnClosePaper').onclick = closePaper;
}
