'use strict';
/* =========================================================
   feedback —— Toast 提示与成就解锁
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* ---------- 字幕提示：小地图上方堆叠 ----------
   - 新提示从底部挤入，最早的排在上方；
   - 相同内容不重复起幕，只在尾部累计 x2 / x3 … 并刷新存活时间；
   - 同屏最多 TOAST_MAX 条，超出立即收起最早的一条。 */
const TOAST_MAX = 4;
const activeToasts = new Map();   // text -> { el, num, count, timer }

function toast(text, ms){
  const dur = ms || 2000;

  const hit = activeToasts.get(text);
  if (hit){
    hit.count++;
    hit.num.textContent = 'x' + hit.count;
    clearTimeout(hit.timer);
    hit.timer = setTimeout(() => hideToast(text), dur);
    hit.el.classList.remove('bump');
    void hit.el.offsetWidth;      // 强制重排以重启动画
    hit.el.classList.add('bump');
    return;
  }

  const el = document.createElement('div');
  el.className = 'toast';
  const body = document.createElement('span');
  body.textContent = text;
  const num = document.createElement('i');
  num.className = 'n';
  el.appendChild(body);
  el.appendChild(num);
  toastStack.appendChild(el);

  const rec = { el, num, count: 1, timer: 0 };
  rec.timer = setTimeout(() => hideToast(text), dur);
  activeToasts.set(text, rec);

  while (activeToasts.size > TOAST_MAX){
    hideToast(activeToasts.keys().next().value);
  }
}

function hideToast(text){
  const rec = activeToasts.get(text);
  if (!rec) return;
  activeToasts.delete(text);
  clearTimeout(rec.timer);
  rec.el.classList.add('out');
  setTimeout(() => rec.el.remove(), 320);
}

/* ---------- 成就 ---------- */

const ACHIEVEMENTS = {
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

function unlockAch(id){
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
