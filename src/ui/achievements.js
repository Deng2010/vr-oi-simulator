/* =========================================================
   成就定义与解锁通知
   由 index.html 内联脚本第 936-967 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { achNotify } from './dom.js';

/* 成就通知条的定时器（原先与 toastTimer 挤在同一个 let 声明里） */
let achTimer = null;

export const ACHIEVEMENTS = {
  first_ac:   { name: '初次 AC',   desc: '拿到第一道题的 Accepted' },
  full_score: { name: '满分大神',   desc: '四道题全部 AC' },
  guard_5:    { name: '格斗大师',   desc: '击倒 5 名保安' },
  clean_run:  { name: '安分守己',   desc: '零警告完赛' },
  zero_king:  { name: '零分传奇',   desc: '交卷时 0 分' },
  trouble:    { name: '校园霸王',   desc: '干扰 3 名选手' },
  speedrun:   { name: '神速交卷',   desc: '1 小时内交卷' },
  banned:     { name: '失言者',     desc: '因屏蔽词被取消成绩' },
  teacher_hit:{ name: '袭师者',     desc: '殴打了监考老师' },
  explorer:   { name: '厕所旅行家', desc: '完整去过一次洗手间' },
  wanderer: { name: '红圈五连', desc: '同一场考试，五次随意走动' }
};

export function unlockAch(id){
  if (state.achievements.has(id)) return;
  state.achievements.add(id);
  const a = ACHIEVEMENTS[id];
  if (!a) return;
  clearTimeout(achTimer);
  achNotify.innerHTML = `<div class="at">\u{1F3C6} 成就解锁</div><div class="an">${a.name}</div>
                         <div style="font-size:11.5px;opacity:.85;margin-top:4px">${a.desc}</div>`;
  achNotify.classList.add('show');
  achTimer = setTimeout(() => achNotify.classList.remove('show'), 3200);
  audio.beep(880, 0.12, 0.05);
  setTimeout(() => audio.beep(1174, 0.15, 0.04), 110);
}
