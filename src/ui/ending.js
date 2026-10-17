/* =========================================================
   结算界面与比赛结束流程
   ---------------------------------------------------------
   流程：交卷 → 系统测试（每题 20 点，逐点揭晓）→ 揭榜。
   system test 的分数才是最终成绩，所以总分、明细、成就判定
   都必须等它跑完 —— 这是和旧版「提交即定分」最大的区别。

   ---------- 结局系统 ----------
   揭榜时把「统计快照」交给 data/endings/select.js 的判定器，
   按 priority 挑出唯一结局；每个结局在 src/data/endings/<id>.js 里
   单独配置（标题 / 文案 / 语气 / 成就 / 触发条件）。

   违纪路径（屏蔽词、被保安抓走、五次走动、作弊）用的是
   stage='immediate' 的结局：**不跑**系统测试 ——
   现实里成绩被取消的选手不会进评测队列。
   ========================================================= */
import { timeScale } from '../core/settings.js';
import { state } from '../core/state.js';
import { $, fmtTime } from '../core/util.js';
import { endingText, resolveEnding } from '../data/endings/select.js';
import { KEYWORDS_LIST } from '../data/keywords.js';
import { scene } from '../render/gfx.js';
import { recordEnding } from '../systems/profile.js';
import { SYSTEM_CASES, judgeSystem } from '../systems/scoring.js';
import { clearSave } from '../systems/save.js';
import { flag, statRows, stats, statsSnapshot } from '../systems/stats.js';
import { storySegmentsOf } from '../systems/story.js';
import { securityGuards } from '../world/entities.js';
import { ACHIEVEMENTS, unlockAch } from './achievements.js';
import { endBadgeEl, endEventsEl, endResultEl, endingUI, stLog, stRuns, sysTestEl } from './dom.js';
import { hideAllPanels } from './panels.js';
import { playEndingStory } from './story.js';

/* 揭晓节奏：每点 45ms（一题 20 点约 0.9s），题与题之间停一下 */
const CASE_MS = 45;
const RUN_GAP_MS = 260;

/* 演示令牌：万一出现二次结算，上一轮的定时器必须自己作废 */
let testToken = 0;
let skipRequested = false;

/* 事件文案会进 innerHTML：选手名字/题号虽然都是自家数据，
   还是转义一次 —— 别让「以后某个事件带上了用户输入」变成 XSS。 */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = s => String(s).replace(/[&<>]/g, c => ESC_MAP[c]);

/* 跳过按钮：只跳过**演示**。分数在演示开始前就全算完了，跳不跳都一样。 */
export function skipSystemTest(){
  skipRequested = true;
}

/**
 * 结算用的统计快照。
 * 统计系统（systems/stats.js）只记「别处没有真源」的数据，
 * 这里把 core/state.js 里已有的真源（提交、分数、警告、击倒保安…）
 * 补进来，合并成一个纯数据对象 —— 结局判定只认这个对象。
 */
export function endingSnapshot(){
  const problems = state.problems || [];
  let submits = 0, solves = 0, pretestBest = 0, codeChars = 0;

  for (const p of problems){
    submits += state.submitCount[p.id] || 0;
    const sc = state.score[p.id] || 0;
    if (sc >= p.max) solves++;
    if (sc > pretestBest) pretestBest = sc;
    const code = state.code[p.id];
    if (typeof code === 'string') codeChars += code.length;
  }

  return statsSnapshot({
    elapsed: state.elapsed / Math.max(1, timeScale),
    problemCount: problems.length,
    submits, solves, pretestBest, codeChars,
    warns: state.warnCount,
    wanderCount: state.wanderCount,
    wanderPenalty: state.wanderPenaltyApplied,
    guardKills: state.guardKills
  });
}

/**
 * 揭榜。
 * @param {number} score 最终得分（作废结局会显示成 0）
 * @param {object|null} ending 结局配置；null 时按当前快照在 final 阶段现解析
 * @param {string} [detailHtml] 系统测试明细（违规路径没有）
 */
export function showEnding(score, ending, detailHtml){
  /* 揭榜：先收起系统测试面板。违纪路径会直接调到这里，
     那时系统测试块还停在默认的隐藏态，多收一次没有副作用。 */
  sysTestEl.classList.add('hidden');

  const snap = endingSnapshot();
  const pick = ending || resolveEnding(snap, 'final');

  /* 结局进图鉴（启动屏展示墙读这份跨场次记录）。
     pick 为 null 说明配置坏了，这时不记 —— 免得墙上留一个解析不出来的 id。 */
  if (pick) recordEnding(pick.id);

  /* 注册表里一定有一个 condition 恒真的兜底结局（npm test 有断言），
     这里仍然兜一层：配置坏掉时宁可显示旧标题，也不要整页空着。 */
  endingUI.dataset.tone = (pick && pick.tone) || 'neutral';
  $('endTitle').textContent = pick ? pick.title : '比 赛 结 束';
  $('endSub').textContent = pick ? endingText(pick.subtitle, snap) : '';
  endBadgeEl.textContent = pick ? pick.badge : '';
  endBadgeEl.classList.toggle('hidden', !pick || !pick.badge);

  /* 统计格子：主线恒显示，非主线为 0 时由 statRows() 整格隐藏 */
  $('endStats').innerHTML = statRows(snap)
    .map(r => `<div class="stat"><div class="sv">${esc(r.value)}</div>` +
              `<div class="sl">${esc(r.label)}</div></div>`)
    .join('');

  /* 事件回顾：统计系统记的事件流，按发生顺序列出来 */
  const events = snap.events || [];
  endEventsEl.innerHTML = events.length
    ? events.map(e =>
        `<li><span class="ev-at">${esc(fmtTime(e.at))}</span>` +
        `<span class="ev-lb">${esc(e.label)}</span>` +
        (e.n > 1 ? `<span class="ev-n">×${e.n}</span>` : '') + '</li>').join('')
    : '<li class="ev-empty">本场没有触发任何值得记录的事件。</li>';

  /* 结局自己声明的成就（unlockAch 幂等，与 unlockFinalAchievements 重复也无害） */
  if (pick && Array.isArray(pick.achievements)) pick.achievements.forEach(unlockAch);

  const achList = $('endAch');
  if (state.achievements.size){
    achList.innerHTML = Array.from(state.achievements)
      .map(id => ACHIEVEMENTS[id] ? `<span class="ach-chip">\u{1F3C6} ${ACHIEVEMENTS[id].name}</span>` : '')
      .join('');
  } else {
    achList.innerHTML = '';
  }

  /* 成绩单上的明细只放系统测试的逐题结果 ——
     结局叙事已经搬到全屏正文（data/endings/<id>.js 的 story）里了 */
  $('endDetail').innerHTML = (detailHtml || '').replace(/\n/g, '<br>');

  $('endScore').textContent = (pick && pick.voidScore) ? 0 : score;

  /* 先播结局正文（全屏 / 分段 / 打字机），播完才揭榜：
     顺序反过来的话，玩家会先看到分数再看到故事，情绪就散了。 */
  playEndingStory(
    {
      badge: pick ? pick.badge : '',
      tone: pick ? pick.tone : 'neutral',
      segments: storySegmentsOf(pick, snap)
    },
    () => {
      endResultEl.classList.remove('hidden');
      endingUI.classList.remove('hidden');
    }
  );
}

/**
 * 违纪路径的结算：按当前快照解析 immediate 阶段的结局，命中就当场作废。
 * 没命中时返回 false 且什么都不做 —— 调用方（banned / guards）只在
 * 确实发生了违规时才会走到这里。
 * @returns {boolean} 是否真的开出了一个结局
 */
export function showViolationEnding(){
  const pick = resolveEnding(endingSnapshot(), 'immediate');
  if (!pick) return false;
  showEnding(0, pick, '');
  return true;
}

/* =========================================================
   赛后系统测试
   ========================================================= */

/* 最终成绩的成就判定：一律基于 system test 的分数，
   预测试满分不再直接发「初次 AC」—— 那正是这一版要传达的悬念。 */
function unlockFinalAchievements(runs, total){
  if (total === 0) unlockAch('zero_king');
  if (state.warnCount === 0) unlockAch('clean_run');
  if (state.elapsed / timeScale <= 3600) unlockAch('speedrun');
  if (runs.some(r => r.res.score >= r.prob.max)) unlockAch('first_ac');
  if (runs.every(r => r.res.score >= r.prob.max)) unlockAch('full_score');
}

function startSystemTest(manual){
  const token = ++testToken;
  skipRequested = false;

  /* 先把四道题的系统测试结果全部算出来（纯确定性函数），
     再逐点播放动画：动画只是演示，跟分数没有任何关系。 */
  const runs = state.problems.map(p => {
    const code = typeof state.code[p.id] === 'string' ? state.code[p.id] : '';
    return {
      prob: p, code,
      submitted: (state.submitCount[p.id] || 0) > 0,
      res: judgeSystem(code, p, KEYWORDS_LIST)
    };
  });

  stRuns.innerHTML = runs.map((run, i) => `
    <div class="st-run">
      <div class="st-run-head">
        <span>${run.prob.id} ${run.prob.name}</span>
        <span class="st-run-sum" id="stsum${i}">等待评测…</span>
      </div>
      <div class="st-cases" id="stcases${i}">${
        Array.from({ length: SYSTEM_CASES }, (_, k) =>
          `<i class="st-case">S${k + 1}</i>`).join('')
      }</div>
    </div>`).join('');
  stLog.textContent = '评测机正在重新运行全部测试数据…';
  sysTestEl.classList.remove('hidden');
  endResultEl.classList.add('hidden');

  let ri = 0, ci = 0, settled = 0;

  /* 一道题跑完：填它的小结（预测试 x → 系统测试 y），并累计分数 */
  const settle = i => {
    const run = runs[i];
    const el = document.getElementById('stsum' + i);
    settled += run.res.score;
    if (!el) return;
    if (!run.submitted){ el.innerHTML = '<span class="st-miss">未提交 · 0 分</span>'; return; }
    if (run.res.status === 'CE'){ el.innerHTML = '编译错误 → <b>0</b>'; return; }
    const d = run.res.drift;
    const cls = d < 0 ? 'st-down' : 'st-up';
    const txt = d === 0 ? '持平' : (d > 0 ? '+' + d : String(d));
    el.innerHTML = `预测试 <b>${run.res.pretestScore}</b> → 系统测试 <b>${run.res.score}</b>` +
                   ` <span class="${cls}">${txt}</span>`;
  };

  /* 一次性铺满某题的 20 个格子（未提交 / 跳过演示时用） */
  const fillRun = i => {
    const box = document.getElementById('stcases' + i);
    if (!box) return;
    const cases = runs[i].res.cases;
    for (let k = 0; k < box.children.length; k++){
      const cell = box.children[k];
      cell.className = 'st-case ' + cases[k].status;
      cell.textContent = cases[k].status;
    }
  };

  const finish = () => {
    if (token !== testToken) return;
    state.finalScore = {};
    runs.forEach(r => { state.finalScore[r.prob.id] = r.res.score; });
    state.systemTested = true;
    settled = runs.reduce((s, r) => s + r.res.score, 0);
    /* 最终成绩写进统计系统：ak / zero / speedrun 这几个结局
       读的就是这两个字段 */
    stats.finalScore = settled;
    stats.finalSolves = runs.filter(r => r.res.score >= r.prob.max).length;
    stLog.textContent = `系统测试结束，最终总分 ${settled} / 400。`;
    unlockFinalAchievements(runs, settled);

    const detail = runs.map(r => {
      const line = `${r.prob.id} ${r.prob.name}：系统测试 ${r.res.score} / ${r.prob.max}`;
      if (!r.submitted) return line + '（未提交）';
      if (r.res.status === 'CE') return line + '（编译错误）';
      return line + `（预测试 ${r.res.pretestScore}）`;
    }).join('\n');

    setTimeout(() => {
      if (token !== testToken) return;
      /* 结局在这里解析：快照必须带上刚刚写入的 finalScore / finalSolves，
         所以解析不能提前到 settle 之前 */
      const ending = resolveEnding(endingSnapshot(), 'final');
      showEnding(settled, ending,
        detail +
        `\n\n用时 ${fmtTime(state.elapsed)}　·　被警告 ${state.warnCount} 次` +
        (manual ? '\n（提前交卷）' : '\n（时间到，自动交卷）'));
    }, skipRequested ? 0 : 600);
  };

  const step = () => {
    if (token !== testToken) return;
    if (ri >= runs.length){ finish(); return; }
    const run = runs[ri];

    /* 没提交过的题不演：20 个点全是 CE，铺完直接进下一题 */
    if (!run.submitted){
      fillRun(ri); settle(ri); ri++; ci = 0;
      setTimeout(step, skipRequested ? 0 : RUN_GAP_MS);
      return;
    }

    const box = document.getElementById('stcases' + ri);
    if (ci === 0) stLog.textContent = `正在评测 ${run.prob.id} ${run.prob.name} …`;

    const cell = box.children[ci];
    const c = run.res.cases[ci];
    cell.className = 'st-case ' + c.status;
    cell.textContent = c.status;
    ci++;

    if (ci >= run.res.cases.length){
      settle(ri); ri++; ci = 0;
      setTimeout(step, skipRequested ? 0 : RUN_GAP_MS);
      return;
    }
    /* 点了「跳过演示」之后每步 0 延迟：剩下的点会很快铺完，结果不变 */
    setTimeout(step, skipRequested ? 0 : CASE_MS);
  };

  step();
}

export function endContest(manual){
  if (state.ended) return;

  /* 收场方式也是结局判据（「时间到」和「比赛结束」是两个结局文件） */
  flag(manual ? 'manualSubmit' : 'timeUp', true);

  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  for (const g of securityGuards) scene.remove(g.group);
  securityGuards.length = 0;
  /* 交卷即封存：系统测试演示期间刷新页面不该还能续赛 */
  clearSave();

  /* 违纪路径（屏蔽词 / 被保安抓走 / 五次走动 / 作弊）不跑系统测试。
     顺序要紧：先置 flag，快照里才有得判。 */
  const violation = resolveEnding(endingSnapshot(), 'immediate');
  if (violation){
    showEnding(0, violation, '');
    return;
  }

  $('endSub').textContent = '评测机开始运行系统测试，最终成绩以本次评测为准。';
  endingUI.classList.remove('hidden');
  startSystemTest(manual);
}
