'use strict';
/* =========================================================
   combat —— 殴打老师 / 保安 AI / 全员收尾
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   打老师 / 打保安
   ========================================================= */
function punchTeacher(){
  if (state.view !== 'world' || state.ended || state.frozen) return;
  if (!teacher || teacher.userData.leaving) return;
  teacher.userData.leaving = true;

  const d = Math.hypot(state.pos.x - teacher.group.position.x,
                       state.pos.z - teacher.group.position.z);
  if (d > 2.4){
    teacher.userData.leaving = false;
    toast('你离监考老师太远了。', 1400);
    return;
  }

  const dx = state.pos.x - teacher.group.position.x;
  const dz = state.pos.z - teacher.group.position.z;
  teacher.group.rotation.y = Math.atan2(dx, dz);
  teacher.armL.rotation.x = -1.4;
  teacher.armR.rotation.x = -1.4;

  audio.punch();
  redFlash.style.opacity = '0.62';
  setTimeout(() => redFlash.style.opacity = '0', 160);

  toast('\u{1F44A} 你一拳打在了监考老师的胳膊上……', 1600);
  unlockAch('teacher_hit');

  setTimeout(() => {
    if (teacher){
      scene.remove(teacher.group);
      teacher = null;
    }
    toast('监考老师夺门而出，叫来了保安！', 2200);
    audio.beep(880, 0.15, 0.05, 'sawtooth');
    audio.beep(440, 0.25, 0.05, 'sawtooth');

    setTimeout(() => {
      if (state.ended) return;
      spawnTwoGuards();
      toast('\u26A0 两名保安从门口冲了进来！', 2600);
      audio.beep(140, 0.4, 0.07, 'sawtooth');
    }, 700);
  }, 800);
}

/* 用引用而非索引：避免数组被 prune 后索引错位 */
function punchGuard(g){
  if (!g || !g.userData.alive) return;

  const d = Math.hypot(state.pos.x - g.group.position.x, state.pos.z - g.group.position.z);
  if (d > GUARD_PUNCH_RANGE + 0.3){
    toast('你离保安太远了。', 1200);
    return;
  }

  g.userData.alive = false;
  scene.remove(g.group);
  state.guardKills++;

  audio.punch();
  redFlash.style.opacity = '0.4';
  setTimeout(() => redFlash.style.opacity = '0', 130);

  toast('\u{1F44A} 一拳撂倒了一个保安！', 1500);
  if (state.guardKills >= 5) unlockAch('guard_5');

  setTimeout(() => {
    if (state.ended) return;
    spawnTwoGuards();
    toast('门口又冲进来两名替补保安……', 1700);
    audio.beep(200, 0.3, 0.06, 'sawtooth');
  }, 900);
}

/* =========================================================
   保安 AI + 碰撞
   ========================================================= */
function updateGuards(realDt, t){
  if (state.ended || state.frozen || state.view !== 'world') return;

  let minDist = Infinity;

  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;

    const pos = g.group.position;
    const dx = state.pos.x - pos.x;
    const dz = state.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < minDist) minDist = d;

    if (d < GUARD_HIT_RADIUS){ endByGuards(); return; }

    if (d > 0.01){
      const sp = g.userData.speed * realDt;
      const nx = pos.x + (dx / d) * sp;
      const nz = pos.z + (dz / d) * sp;
      if (!collides(nx, pos.z, 0.3)) pos.x = nx;
      if (!collides(pos.x, nz, 0.3)) pos.z = nz;
      g.group.rotation.y = Math.atan2(dx, dz);
    }

    const v = Math.sin(t * 3.5 + g.phase) * 0.25;
    g.armL.rotation.x = -0.25 + v;
    g.armR.rotation.x = -0.25 - v;
    g.head.rotation.y = Math.sin(t * 2 + g.phase) * 0.25;

    if (g.warnLight){
      const blink = 0.5 + 0.5 * Math.sin(t * 6 + g.phase);
      g.warnLight.material.color.setRGB(1, blink * 0.4, blink * 0.4);
    }
  }

  if (aliveGuardCount() > 0 && minDist < 3.5) dangerVig.classList.add('on');
  else dangerVig.classList.remove('on');
}

function endByGuards(){
  if (state.ended) return;
  state.ended = true;
  hideAllPanels();
  for (const g of securityGuards) scene.remove(g.group);
  securityGuards.length = 0;

  audio.beep(110, 0.5, 0.08, 'sawtooth');
  audio.beep(80, 0.7, 0.06, 'sawtooth');

  $('endTitle').textContent = '被 保 安 抓 走';
  $('endSub').textContent = '两名保安一左一右架住了你，你被拖出了考场。';
  showEnding(0, '你在考场上公然殴打监考老师，性质恶劣。\n' +
    '本次比赛成绩作废，并记入诚信档案。\n\n' +
    '遵守考场纪律，人人有责。\n下次别再打老师了。');
}

function hideAllPanels(){
  /* 3D 悬浮弹窗也要收场（弹窗不再是 DOM，无法用 classList 隐藏） */
  dismissDialogs();
  ['hud', 'pauseMenu', 'codeUI', 'paperUI', 'corridorUI',
   'bathroomUI', 'npcComputerUI', 'minimapWrap']
    .forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  dangerVig.classList.remove('on');
}
