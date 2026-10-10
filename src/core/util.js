/* =========================================================
   通用工具：DOM 查询、数值裁切与插值、时间格式化
   由 index.html 内联脚本第 674-686 行拆出。
   ========================================================= */
export const $ = id => document.getElementById(id);

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor(sec % 3600 / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/* 确定性随机：用代码 hash 作为种子，避免反复提交刷分 */
