/* =========================================================
   结局正文播放器：全屏分段打字机
   ---------------------------------------------------------
   交互规则写在 systems/story.js（纯函数、有单测），这里只负责
   「把状态画出来 + 驱动定时器」：
     · 打字中按任意键 → 立刻显示完**本段**（不跳段）；
     · 本段已完整 → 按任意键进下一段；最后一段之后 → 揭榜。

   为什么打字机用 setTimeout 而不是 rAF：
     无头 Chromium 里 requestAnimationFrame 一次都不触发（AGENTS §6.2），
     而计时器是可靠的 —— 冒烟测试要能真的看见字一个一个冒出来。
   ========================================================= */
import { state } from '../core/state.js';
import {
  advanceStory, createStory, currentSegment, isSegmentDone, progressLabel, revealNext,
  storyHint, visibleText
} from '../systems/story.js';
import { achNotify, storyBadgeEl, storyBodyEl, storyHintEl, storyProgressEl, storyUI } from './dom.js';

/* 每字 26ms（一段 40 字约 1 秒）；标点后再多停一下，读起来像在讲故事 */
const TICK_MS = 26;
const PAUSE_MS = 220;
const PAUSE_AFTER = '。！？…，；：、';

let story = null;      // 当前播放状态（systems/story.js 的不可变状态）
let timer = null;      // 下一个字的定时器
let finishCb = null;   // 播完后要干什么（揭榜）

function stopTimer(){
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function render(){
  if (!story) return;
  storyBodyEl.textContent = visibleText(story);
  storyHintEl.textContent = storyHint(story);
  storyProgressEl.textContent = progressLabel(story);
  /* 段末停笔：光标停止闪烁（CSS 里 .done 去掉光标） */
  storyBodyEl.classList.toggle('done', isSegmentDone(story));
}

function schedule(ms){
  stopTimer();
  timer = setTimeout(tick, ms);
}

function tick(){
  timer = null;
  if (!story || story.finished) return;
  const before = story.revealed;
  story = revealNext(story);
  render();
  if (story.revealed === before) return;      /* 已经到段尾，不再排下一拍 */
  const typed = currentSegment(story)[story.revealed - 1];
  schedule(PAUSE_AFTER.includes(typed) ? PAUSE_MS : TICK_MS);
}

function press(event){
  if (!story || story.finished) return;
  /* 按住不放不该把整篇一口气刷完：一次物理按键只推进一次 */
  if (event && event.repeat) return;
  if (event && event.type === 'keydown') event.preventDefault();

  story = advanceStory(story);
  stopTimer();
  if (story.finished){ finish(); return; }
  render();
  /* 刚把本段显示完 → 停笔等下一次按键；刚换到新段 → 从第一个字重新打 */
  if (!isSegmentDone(story)) schedule(TICK_MS);
}

function finish(){
  stopTimer();
  story = null;
  document.removeEventListener('keydown', press, true);
  storyUI.removeEventListener('mousedown', press, true);
  storyUI.removeEventListener('touchstart', press, true);
  storyUI.classList.add('hidden');
  state.view = 'world';
  const cb = finishCb;
  finishCb = null;
  if (cb) cb();
}

/**
 * 播放结局正文。
 * @param {{badge?:string, tone?:string, segments:string[]}} opts
 * @param {() => void} [done] 播完之后调用（揭榜）
 */
export function playEndingStory(opts, done){
  const next = createStory((opts && opts.segments) || []);
  /* 没有正文就直接揭榜：宁可不播，也不要卡在一个空屏幕上 */
  if (next.finished){ if (done) done(); return; }

  story = next;
  finishCb = done || null;
  storyBadgeEl.textContent = (opts && opts.badge) || '';
  storyUI.dataset.tone = (opts && opts.tone) || 'neutral';
  /* 收掉成就通知条：它会在正文上飘三秒，把第一段盖住。
     成就本身不会丢 —— 正文播完的成绩单里还会再列一遍。 */
  achNotify.classList.remove('show');
  storyBodyEl.textContent = '';
  storyBodyEl.classList.remove('done');
  storyProgressEl.textContent = progressLabel(story);
  storyHintEl.textContent = storyHint(story);
  state.view = 'story';
  storyUI.classList.remove('hidden');

  /* 捕获阶段：要抢在 input.js 的 Esc / 空格处理之前拿到事件 */
  document.addEventListener('keydown', press, true);
  storyUI.addEventListener('mousedown', press, true);
  storyUI.addEventListener('touchstart', press, true);

  render();
  schedule(TICK_MS);
}
