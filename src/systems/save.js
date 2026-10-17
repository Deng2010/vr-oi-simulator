/* =========================================================
   存档：写入 / 读取 / 清除 localStorage 进度
   由 index.html 内联脚本第 2753-2810 行拆出。
   ========================================================= */
import { state } from '../core/state.js';
import { KEYWORDS_LIST } from '../data/keywords.js';
import { PROBLEM_BY_ID } from '../data/problems/index.js';
import { sortByDifficulty } from '../data/problems/selection.js';
import { updateAllDeskScreens } from '../render/screen-textures.js';
import { recalcScore } from './score.js';
import { judgePretest } from './scoring.js';
import { restoreStats, statsSnapshot } from './stats.js';

export const SAVE_KEY = 'oi_save_v8';

export let autoSaveTimer = null;

export function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(persistSave, 1200);
}

export function persistSave(){
  if (!state.started || state.ended) return;
  try {
    const blob = {
      code: state.code, score: state.score,
      curProb: state.curProb, elapsed: state.elapsed,
      warnCount: state.warnCount,
      achievements: Array.from(state.achievements),
      /* 统计系统的计数器与事件流：不存的话，读档后「本场事件回顾」
         会只剩读档之后发生的事（作弊次数也会被洗掉） */
      stats: statsSnapshot(),
      savedAt: Date.now(),
      problems: state.problems.map(p => p.id)
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch(e){}
}

export function tryLoadSave(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return false;
    if (Array.isArray(o.problems) && o.problems.length === 4){
      const restored = o.problems.map(id => PROBLEM_BY_ID.get(id)).filter(Boolean);
      if (restored.length === 4){
        /* 存档只存题号，顺序也是当初写进去的：这份存档可能是
           「抽题还没按难度排序」那版留下的，所以恢复时重排一次，
           保证任何入口（新开局 / 读档）拿到的都是易→难。 */
        const ordered = sortByDifficulty(restored);
        state.problems = ordered;
        state.curProb = ordered[0].id;
        state.npcProbId = ordered[Math.floor(Math.random() * ordered.length)].id;
        updateAllDeskScreens();
      } else {
        return false;
      }
    }
    if (o.code)   state.code = o.code;
    if (o.curProb) state.curProb = o.curProb;
    /* 存档里的 score 不直接信任：评测规则改过之后（见 systems/scoring.js），
       旧存档里存的是旧口径的分数（注释灌水能刷分的那一版），直接读进来
       会让历史分数虚高、和新分数不可比。
       存档里存了 code，所以在新规则下重算一遍即可 ——
       当初把 code 一起写进存档，就是为了留这条迁移路。
       代价：如果玩家提交后又把代码改差了，重算会按当前代码给分。 */
    state.score = {};
    for (const p of state.problems){
      const code = state.code[p.id];
      if (typeof code === 'string'){
        state.score[p.id] = judgePretest(code, p, KEYWORDS_LIST).score;
      }
    }
    if (typeof o.elapsed === 'number') state.elapsed = o.elapsed;
    if (typeof o.warnCount === 'number') state.warnCount = o.warnCount;
    if (Array.isArray(o.achievements)) state.achievements = new Set(o.achievements);
    /* 统计：字段缺失或类型不符都会被 restoreStats 忽略（旧存档照读） */
    restoreStats(o.stats);
    recalcScore();
    return true;
  } catch(e){ return false; }
}

export function clearSave(){
  try { localStorage.removeItem(SAVE_KEY); } catch(e){}
}
