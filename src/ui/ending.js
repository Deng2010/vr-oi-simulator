/* =========================================================
   结算界面与比赛结束流程
   ---------------------------------------------------------
   流程：交卷 → 系统测试（每题 20 点，逐点揭晓）→ 揭榜。
   system test 的分数才是最终成绩，所以总分、明细、成就判定
   都必须等它跑完 —— 这是和旧版「提交即定分」最大的区别。

   违纪路径（屏蔽词、离座五次）**不跑**系统测试：
   现实里成绩被取消的选手不会进评测队列。
   ========================================================= */
import { timeScale } from '../core/settings.js';
import { state } from '../core/state.js';
import { $, fmtTime } from '../core/util.js';
import { KEYWORDS_LIST } from '../data/keywords.js';
import { scene } from '../render/gfx.js';
import { securityGuards } from '../world/entities.js';
import { SYSTEM_CASES, judgeSystem } from '../systems/scoring.js';
import { clearSave } from '../systems/save.js';
import { ACHIEVEMENTS, unlockAch } from './achievements.js';
import { endResultEl, endingUI, stLog, stRuns, sysTestEl } from './dom.js';
import { hideAllPanels } from './panels.js';

/* 揭晓节奏：每点 45ms（一题 20 点约 0.9s），题与题之间停一下 */
const CASE_MS = 45;
const RUN_GAP_MS = 260;

/* 演示令牌：万一出现二次结算，上一轮的定时器必须自己作废 */
let testToken = 0;
let skipRequested = false;

/* 跳过按钮：只跳过**演示**。分数在演示开始前就全算完了，跳不跳都一样。 */
export function skipSystemTest(){
  skipRequested = true;
}

export function showEnding(score, detailHtml){
  /* 揭榜：收起系统测试面板。违纪路径会直接调到这里，
     那时系统测试块还停在默认的隐藏态，多收一次没有副作用。 */
  sysTestEl.classList.add('hidden');
  endResultEl.classList.remove('hidden');

  const stats = $('endStats');
  const elapsedSec = state.elapsed / Math.max(1, timeScale);
  stats.innerHTML = `
    <div class="stat"><div class="sv">${fmtTime(elapsedSec)}</div><div class="sl">实际用时</div></div>
    <div class="stat"><div class="sv">${state.warnCount}</div><div class="sl">警告次数</div></div>
    <div class="stat"><div class="sv">${state.guardKills}</div><div class="sl">击倒保安</div></div>
  `;
  const achList = $('endAch');
  if (state.achievements.size){
    achList.innerHTML = Array.from(state.achievements)
      .map(id => ACHIEVEMENTS[id] ? `<span class="ach-chip">\u{1F3C6} ${ACHIEVEMENTS[id].name}</span>` : '')
      .join('');
  } else {
    achList.innerHTML = '';
  }
  $('endScore').textContent = score;
  $('endDetail').innerHTML = (detailHtml || '').replace(/\n/g, '<br>');
  endingUI.classList.remove('hidden');
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
      $('endSub').textContent = '评测机已停止运行，你的代码已被封存。';
      showEnding(settled,
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

  /* 本场曾离开座位 5 次 → 取消成绩（不进入评测队列） */
  if (state.wanderPenaltyApplied){
    state.ended = true;
    state.view = 'world';
    hideAllPanels();
    for (const g of securityGuards) scene.remove(g.group);
    securityGuards.length = 0;
    unlockAch('wanderer');

    $('endTitle').textContent = '成 绩 已 取 消';
    $('endSub').textContent = '比赛结束。评测记录已封存。';
    showEnding(0,
      '监考老师翻开记录本，上面完整记着你五次随意走动的时点。\n' +
      '依据《NOI 竞赛纪律》，本次成绩作废。\n\n' +
      '下次记得，考场里每一步都在镜头下。');
    clearSave();
    return;
  }

  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  for (const g of securityGuards) scene.remove(g.group);
  securityGuards.length = 0;
  /* 交卷即封存：系统测试演示期间刷新页面不该还能续赛 */
  clearSave();

  $('endTitle').textContent = '比 赛 结 束';
  $('endSub').textContent = '评测机开始运行系统测试，最终成绩以本次评测为准。';
  endingUI.classList.remove('hidden');
  startSystemTest(manual);
}
