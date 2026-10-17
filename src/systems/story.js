/* =========================================================
   结局正文播放器的状态机（纯函数，不碰 DOM）
   ---------------------------------------------------------
   交互规则只有两条，别加戏：
     1. 还在打字时按任意键 → 立刻把**这一段**显示完；
     2. 一段已经显示完时按任意键 → 进下一段；最后一段之后 → 结束。
   最容易写错的是「按一下跳两段」（把两条规则写成了同一条）和
   「最后一段按了没反应」，所以规则放在这里用 Node 单测钉死 ——
   不需要浏览器，也不用等 26ms 一个字的定时器。

   状态是**不可变**的：每个动作返回新对象，UI 只管把新状态画出来。
   ========================================================= */

/** 底部提示的三句话（也是单测的判据） */
export const HINT_SKIP = '按任意键显示完整本段';
export const HINT_NEXT = '按任意键继续';
export const HINT_LAST = '按任意键揭晓成绩';

/* 单段上限：一屏（约 7.6em 行高的正文区）放得下，不用滚动。
   npm test 拿它当判据 —— 写超了会红，提醒你把这段拆开。 */
export const STORY_SEGMENT_LIMIT = 120;

/**
 * 建一个播放状态。
 * @param {string[]} segments 分段正文（空段会被丢掉）
 */
export function createStory(segments){
  const list = (segments || [])
    .map(s => String(s == null ? '' : s).trim())
    .filter(s => s.length > 0);
  return { segments: list, index: 0, revealed: 0, finished: list.length === 0 };
}

export function currentSegment(st){
  return st.finished ? '' : (st.segments[st.index] || '');
}

/** 当前这一段是否已经完整显示 */
export function isSegmentDone(st){
  if (st.finished) return true;
  return st.revealed >= currentSegment(st).length;
}

/** 已经打出来的文本（UI 直接贴到 DOM 上） */
export function visibleText(st){
  return st.finished ? '' : currentSegment(st).slice(0, st.revealed);
}

/** 打字机推进一步。到段尾就停住，不会越界。 */
export function revealNext(st){
  if (st.finished || isSegmentDone(st)) return st;
  return { ...st, revealed: st.revealed + 1 };
}

/**
 * 按了一次键。
 * 注意两条规则是**互斥**的：打字中按键只完成本段，不跳段 ——
 * 玩家想「快点看完这段」，不是想「跳过这段」。
 */
export function advanceStory(st){
  if (st.finished) return st;
  if (!isSegmentDone(st)){
    return { ...st, revealed: currentSegment(st).length };
  }
  if (st.index + 1 < st.segments.length){
    return { ...st, index: st.index + 1, revealed: 0 };
  }
  return { ...st, finished: true };
}

/** 底部的提示语：打字中 / 还有下一段 / 最后一段 */
export function storyHint(st){
  if (st.finished) return '';
  if (!isSegmentDone(st)) return HINT_SKIP;
  return st.index + 1 < st.segments.length ? HINT_NEXT : HINT_LAST;
}

/** 右上角的进度：`2 / 5` */
export function progressLabel(st){
  if (st.finished || st.segments.length === 0) return '';
  return `${st.index + 1} / ${st.segments.length}`;
}

/**
 * 把结局配置里的 story 规范化成字符串数组。
 * 允许直接写数组，也允许写 (snapshot) => 数组（要引用分数/警告等本场数据时用）。
 * @param {object|null} ending 结局配置
 * @param {object} snapshot 统计快照
 */
export function storySegmentsOf(ending, snapshot){
  if (!ending) return [];
  const raw = typeof ending.story === 'function' ? ending.story(snapshot) : ending.story;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(s => String(s == null ? '' : s).trim())
    .filter(s => s.length > 0);
}
