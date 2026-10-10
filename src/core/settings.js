/* =========================================================
   视角手感 / 时间流速 / 音量的读写与持久化（localStorage）
   由 index.html 内联脚本第 874-910 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { clamp } from './util.js';

export const TURN_MIN = 0.6, TURN_MAX = 4.0;

export let turnSpeed = 2.2, smoothAmount = 0.35, timeScale = 15;

export let yawTarget = 0, pitchTarget = 0;

/* ---------- 写入口 ----------
   ESM 的导入绑定只读，其它模块要改这些值必须走下面的函数。
   集中在这里也顺带统一了取值范围（原先滑条直接赋值，靠滑条 min/max 兜底）。 */
export function setTurnSpeed(v){ turnSpeed = clamp(v, TURN_MIN, TURN_MAX); }
export function setSmoothAmount(v){ smoothAmount = clamp(v, 0, 0.9); }
export function setTimeScale(v){ timeScale = clamp(v, 1, 60); }
export function setYawTarget(v){ yawTarget = v; }
export function setPitchTarget(v){ pitchTarget = v; }
export function setLookTarget(yaw, pitch){ yawTarget = yaw; pitchTarget = pitch; }

export function sliderToTurn(v){ return TURN_MIN + ((v - 1) / 19) * (TURN_MAX - TURN_MIN); }

export function turnToSlider(s){
  return Math.round(clamp((s - TURN_MIN) / (TURN_MAX - TURN_MIN), 0, 1) * 19) + 1;
}

export const SETTINGS_KEY = 'oi_view_v8';

export function loadViewSettings(){
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (typeof o.turn === 'number')   turnSpeed    = clamp(o.turn, TURN_MIN, TURN_MAX);
    if (typeof o.smooth === 'number') smoothAmount = clamp(o.smooth, 0, 0.9);
    if (typeof o.time === 'number')   timeScale    = clamp(o.time, 1, 60);
    if (typeof o.vol === 'number')    audio.volume = clamp(o.vol, 0, 1);
    if (typeof o.muted === 'boolean') audio.muted  = o.muted;
  } catch(e){}
}

export function saveViewSettings(){
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      turn: turnSpeed, smooth: smoothAmount, time: timeScale,
      vol: audio.volume, muted: audio.muted
    }));
  } catch(e){}
}
/* 防抖：拖动滑块时避免每次 input 都同步写 localStorage */

export let saveSettingsTimer = null;

export function scheduleSaveViewSettings(){
  if (saveSettingsTimer) return;
  saveSettingsTimer = setTimeout(() => {
    saveSettingsTimer = null;
    saveViewSettings();
  }, 400);
}
