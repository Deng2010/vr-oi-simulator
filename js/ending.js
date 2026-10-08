'use strict';
/* =========================================================
   ending —— 比赛结算与结局分支
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   结算
   ========================================================= */
function showEnding(score, detailHtml){
  releaseLock();
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

function endContest(manual){
  if (state.ended) return;

  /* 本场曾离开座位 5 次 → 取消成绩 */
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

  let total = 0;
  const detail = [];
  state.problems.forEach(p => {
    const sc = state.score[p.id] || 0;
    total += sc;
    detail.push(`${p.id} ${p.name}：${sc} / ${p.max}`);
  });

  if (total === 0) unlockAch('zero_king');
  if (state.warnCount === 0) unlockAch('clean_run');
  if (state.elapsed / timeScale <= 3600) unlockAch('speedrun');

  $('endTitle').textContent = '比 赛 结 束';
  $('endSub').textContent = '评测机已停止运行，你的代码已被封存。';
  showEnding(total,
    detail.join('\n') +
    `\n\n用时 ${fmtTime(state.elapsed)}　·　被警告 ${state.warnCount} 次` +
    (manual ? '\n（提前交卷）' : '\n（时间到，自动交卷）')
  );
  clearSave();
}
