/* =========================================================
   图鉴存档：跨场次记录「已解锁的成就与结局」
   ---------------------------------------------------------
   为什么单独一个 localStorage 键（oi_profile_v1），不塞进 oi_save_v8：
     · oi_save_v8 是**一局比赛**的进度，交卷时 clearSave() 会清掉它；
       把图鉴放进去，打完一局墙就空了 —— 而图鉴的意义正是跨场次累积；
     · 两者生命周期完全不同：一个随比赛结束消失，一个永久保留。
   和比赛存档一样，键名与字段是兼容契约（AGENTS §4.5）：只增不改。

   本模块**不 import 任何 DOM / state**：
     · Node 里也能直接 import，纯函数部分（parseProfile / applyUnlock /
       achievementRows / endingRows）由 tests/run.mjs 单测；
     · localStorage 的读写全部包在 try/catch + 存在性判断里 ——
       隐私模式、配额满、Node 环境都可能没有它，任何一条都不该弄崩页面。
   ========================================================= */

export const PROFILE_KEY = 'oi_profile_v1';

/** 图鉴的两个分区：成就、结局。 */
export const PROFILE_BUCKETS = ['achievements', 'endings'];

/** 空图鉴（每次返回新对象，避免调用方互相污染）。 */
export function emptyProfile(){
  return { achievements: {}, endings: {} };
}

/**
 * 解析图鉴存档。对缺字段 / 坏类型一律宽容：坏条目补默认值，读不懂就返回空图鉴。
 * @param {string|object|null} raw localStorage 里的原文（也接受已 parse 的对象，便于测试）
 */
export function parseProfile(raw){
  const out = emptyProfile();
  if (!raw) return out;

  let data = raw;
  if (typeof raw === 'string'){
    try { data = JSON.parse(raw); } catch (e){ return out; }
  }
  if (!data || typeof data !== 'object') return out;

  for (const bucket of PROFILE_BUCKETS){
    const src = data[bucket];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const [id, entry] of Object.entries(src)){
      if (typeof id !== 'string' || !id) continue;
      const at = entry && Number.isFinite(entry.at) ? entry.at : 0;
      const n = entry && Number.isFinite(entry.n) && entry.n > 0 ? Math.floor(entry.n) : 1;
      out[bucket][id] = { at, n };
    }
  }
  return out;
}

/** 序列化（写盘用）。 */
export function serializeProfile(profile){
  return JSON.stringify(parseProfile(profile));
}

/**
 * 纯函数：在 profile 上记一次解锁。
 * 重复解锁只累加次数，**保留首次解锁时间** —— 展示墙按首次解锁时间倒序排，
 * 这样「最近新开出来的东西」总在最上面。
 * @param {object} profile parseProfile() 的产物（会被就地修改）
 * @param {'achievements'|'endings'} bucket
 * @param {string} id
 * @param {number} [now] 毫秒时间戳（测试可注入）
 */
export function applyUnlock(profile, bucket, id, now = Date.now()){
  if (!profile || typeof id !== 'string' || !id) return profile;
  if (!PROFILE_BUCKETS.includes(bucket)) return profile;
  const prev = profile[bucket][id];
  profile[bucket][id] = prev
    ? { at: prev.at || now, n: (prev.n || 1) + 1 }
    : { at: now, n: 1 };
  return profile;
}

/* ---------- 读写 localStorage（无环境时静默降级） ---------- */

function readRaw(){
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(PROFILE_KEY);
  } catch (e){
    return null;
  }
}

/** 读图鉴。任何环境问题都退化成空图鉴，不会抛错。 */
export function readProfile(){
  return parseProfile(readRaw());
}

function writeProfile(profile){
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(PROFILE_KEY, serializeProfile(profile));
    return true;
  } catch (e){
    return false;   /* 隐私模式 / 配额满：图鉴丢一次，但页面不能崩 */
  }
}

/**
 * 记一次解锁（成就或结局）。
 * @returns {boolean} 是否真的写进了 localStorage
 */
export function recordUnlock(bucket, id, now = Date.now()){
  const profile = readProfile();
  applyUnlock(profile, bucket, id, now);
  return writeProfile(profile);
}

export const recordAchievement = (id, now) => recordUnlock('achievements', id, now);
export const recordEnding = (id, now) => recordUnlock('endings', id, now);

/** 清空图鉴（测试用；玩家也可以手动清 localStorage）。 */
export function clearProfile(){
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(PROFILE_KEY);
  } catch (e){ /* 忽略 */ }
}

/* ---------- 展示墙的行 ---------- */

/**
 * 「目录 × 解锁记录」→ 展示行。**只输出已解锁的**，按首次解锁时间倒序。
 * 目录由调用方传进来：成就表在 ui/、结局表在 data/endings ——
 * 让这个模块反过来 import 它们会把「数据 → UI」的方向倒挂（还会绕出循环依赖）。
 * 存档里那些目录已经删掉的旧 id 也会被自然过滤掉。
 * @param {object} profile
 * @param {'achievements'|'endings'} bucket
 * @param {object[]} catalog 带 id 的目录数组
 * @param {(item:object)=>object} pick 从目录条目里取展示字段
 */
function joinRows(profile, bucket, catalog, pick){
  const seen = (profile && profile[bucket]) || {};
  return (catalog || [])
    .filter(item => item && typeof item.id === 'string' && seen[item.id])
    .map(item => ({
      ...pick(item),
      n: seen[item.id].n || 1,
      at: seen[item.id].at || 0
    }))
    .sort((a, b) => (b.at - a.at) || String(a.id).localeCompare(String(b.id)));
}

/** 成就展示行：{ id, name, desc, n, at } */
export function achievementRows(profile, catalog){
  return joinRows(profile, 'achievements', catalog,
    a => ({ id: a.id, name: a.name || a.id, desc: a.desc || '' }));
}

/** 结局展示行：{ id, badge, title, tone, n, at } */
export function endingRows(profile, catalog){
  return joinRows(profile, 'endings', catalog,
    e => ({ id: e.id, badge: e.badge || '', title: e.title || e.id, tone: e.tone || 'neutral' }));
}
