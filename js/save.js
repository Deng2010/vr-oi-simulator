'use strict';
/* =========================================================
   save —— 进度存档读写
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   存档
   ========================================================= */
const SAVE_KEY = 'oi_save_v8';
let autoSaveTimer = null;

function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(persistSave, 1200);
}

function persistSave(){
  if (!state.started || state.ended) return;
  try {
    const blob = {
      code: state.code, score: state.score,
      curProb: state.curProb, elapsed: state.elapsed,
      warnCount: state.warnCount,
      achievements: Array.from(state.achievements),
      savedAt: Date.now(),
      problems: state.problems.map(p => p.id)
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch(e){}
}

function tryLoadSave(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return false;
    if (Array.isArray(o.problems) && o.problems.length === 4){
      const restored = o.problems.map(id => PROBLEM_BY_ID.get(id)).filter(Boolean);
      if (restored.length === 4){
        state.problems = restored;
        state.curProb = restored[0].id;
        state.npcProbId = restored[Math.floor(Math.random() * restored.length)].id;
        updateAllDeskScreens();
      } else {
        return false;
      }
    }
    if (o.code)   state.code = o.code;
    if (o.score)  state.score = o.score;
    if (o.curProb) state.curProb = o.curProb;
    if (typeof o.elapsed === 'number') state.elapsed = o.elapsed;
    if (typeof o.warnCount === 'number') state.warnCount = o.warnCount;
    if (Array.isArray(o.achievements)) state.achievements = new Set(o.achievements);
    recalcScore();
    return true;
  } catch(e){ return false; }
}

function clearSave(){
  try { localStorage.removeItem(SAVE_KEY); } catch(e){}
}
