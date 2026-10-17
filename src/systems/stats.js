/* =========================================================
   统计系统：本场数据、违规开关与事件流
   ---------------------------------------------------------
   职责边界（重要，别把这里做成第二个 core/state.js）：
     · 这里只记**别处没有真源**的数据：殴打老师、偷用他人电脑、
       喝了几次水、以及「事件流」；
     · 抽题、预测试分数、提交次数、警告次数、击倒保安这些在
       core/state.js 里已经有唯一真源，这里**不再存第二份** ——
       结算时由 ui/ending.js 把两边合并成一个快照。
   理由：两个计数器各自增长、最后对不上是这类系统最经典的事故，
   而「谁才是真源」在代码里无法自动检查，只能靠这条边界守住。

   为什么单独成模块：
     结局判定（data/endings/select.js）只吃一个**纯数据快照**，
     所以判定逻辑能被 tests/run.mjs 直接单测，不需要浏览器。
   ========================================================= */
import { state } from '../core/state.js';
import { fmtTime } from '../core/util.js';

/* 事件流上限：它会随存档进 localStorage，无上限地记会越滚越大。
   120 条足够覆盖一局（每次警告、每次提交、每次偷用电脑各一条）。 */
export const EVENT_LIMIT = 120;

/* 计数器与开关。数值字段一律从 0 起，布尔字段一律 false。 */
export const stats = {
  /* ---------- 行为计数 ---------- */
  teacherHits: 0,        // 殴打监考老师的次数
  teacherCalls: 0,       // 举手呼叫老师的次数
  drinkWater: 0,         // 喝水的次数
  paperOpened: 0,        // 打开草稿纸的次数
  bathroomTrips: 0,      // 完整走完「走廊 → 洗手间 → 回座位」的次数
  npcDisturbed: 0,       // 干扰同学的次数
  npcComputersUsed: 0,   // 偷用其他选手电脑的次数（作弊判据）
  npcComplaints: 0,      // 被同学投诉的次数
  keystrokes: 0,         // 在编辑器里按键的次数
  acceptedSubmits: 0,    // 预测试满分（AC）的提交次数

  /* ---------- 结算时写入 ---------- */
  finalScore: 0,         // 系统测试总分
  finalSolves: 0,        // 系统测试 AC 的题数

  /* ---------- 违规开关 ---------- */
  banned: false,         // 代码里出现屏蔽词
  bannedWord: '',
  caughtByGuards: false, // 被保安抓住
  manualSubmit: false,   // 提前交卷
  timeUp: false          // 时间到自动交卷
};

/* 事件流：{ id, label, at, n }，at 是**虚拟比赛用时**（秒）。
   同一 id 默认合并成一条并累加 n（「提交了 P14962 ×3」比刷三行有用）。 */
let events = [];

/** 计数 +n（默认 1）。键名打错会静默新建一个字段 —— 所以别拼错。 */
export function bump(key, n = 1){
  stats[key] = (stats[key] || 0) + n;
}

/** 置开关（默认 true）。 */
export function flag(key, value = true){
  stats[key] = value;
}

/**
 * 记一条本场事件。
 * @param {string} id 事件标识（同 id 默认合并）
 * @param {string} label 展示文案（只在首次记入时采用）
 * @param {{dedupe?:boolean}} [opts] dedupe=false 时同一 id 记成多条
 * @returns {object|null} 记入的事件，超上限时为 null
 */
export function recordEvent(id, label, opts = {}){
  if (opts.dedupe !== false){
    const hit = events.find(e => e.id === id);
    if (hit){ hit.n++; return hit; }
  }
  if (events.length >= EVENT_LIMIT) return null;
  const ev = { id, label: label || id, at: Math.round(state.elapsed), n: 1 };
  events.push(ev);
  return ev;
}

/** 统计快照（纯数据、可安全 JSON 序列化）。extra 里的字段优先级更高。 */
export function statsSnapshot(extra = {}){
  return { ...stats, events: events.map(e => ({ ...e })), ...extra };
}

/** 事件流只读副本（结算界面直接渲染它）。 */
export function eventList(){
  return events.map(e => ({ ...e }));
}

/** 重置（测试用；页面刷新本身就是一次重置）。 */
export function resetStats(){
  Object.assign(stats, {
    teacherHits: 0, teacherCalls: 0, drinkWater: 0, paperOpened: 0,
    bathroomTrips: 0, npcDisturbed: 0, npcComputersUsed: 0, npcComplaints: 0,
    keystrokes: 0, acceptedSubmits: 0, finalScore: 0, finalSolves: 0,
    banned: false, bannedWord: '', caughtByGuards: false,
    manualSubmit: false, timeUp: false
  });
  events = [];
}

/**
 * 从存档恢复：对缺字段 / 类型不符一律宽容（见 AGENTS §4.5）。
 * 布尔与数值分别比对类型，避免旧存档里的字符串把开关污染成真值。
 */
export function restoreStats(raw){
  if (!raw || typeof raw !== 'object') return;
  for (const key of Object.keys(stats)){
    if (!(key in raw)) continue;
    if (typeof raw[key] !== typeof stats[key]) continue;
    stats[key] = raw[key];
  }
  if (Array.isArray(raw.events)){
    events = raw.events
      .filter(e => e && typeof e.id === 'string')
      .slice(0, EVENT_LIMIT)
      .map(e => ({
        id: e.id,
        label: typeof e.label === 'string' ? e.label : e.id,
        at: Number.isFinite(e.at) ? e.at : 0,
        n: Number.isFinite(e.n) && e.n > 0 ? e.n : 1
      }));
  }
}

/**
 * 结算界面的统计格子。
 * @param {object} s 统计快照
 * @returns {{label:string, value:string|number}[]}
 *
 * 分两类，别混：
 *   · **主线**（用时 / 提交 / 预测试 AC / 系统测试 AC）恒显示，哪怕是 0 ——
 *     它们回答「这一局打得怎么样」，缺了就不成账。
 *   · **非主线**（警告 / 保安 / 干扰 / 偷用电脑 / 事件数）为 0 时整格隐藏 ——
 *     「0 次警告、0 名保安、0 条事件」是「什么都没发生」，
 *     占着格子反而把真正发生的那些挤小了。
 * 所以行数是 4~9 动态的，调用方（与冒烟测试）不要按固定 9 格来断言。
 */
export function statRows(s){
  const total = s.problemCount || 0;
  const rows = [
    { label: '实际用时',   value: fmtTime(s.elapsed || 0) },
    { label: '提交次数',   value: s.submits || 0 },
    { label: '预测试 AC',  value: `${s.solves || 0} / ${total}` },
    { label: '系统测试 AC', value: `${s.finalSolves || 0} / ${total}` },
    { label: '警告次数',   value: s.warns || 0,           optional: true },
    { label: '击倒保安',   value: s.guardKills || 0,      optional: true },
    { label: '干扰同学',   value: s.npcDisturbed || 0,    optional: true },
    { label: '偷用电脑',   value: s.npcComputersUsed || 0, optional: true },
    { label: '触发事件',   value: (s.events || []).length, optional: true }
  ];
  /* 只把 label / value 露给界面：optional 是实现细节，别让它漏进 DOM 映射 */
  return rows
    .filter(r => !r.optional || Number(r.value) !== 0)
    .map(r => ({ label: r.label, value: r.value }));
}
