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

  /* 打击感：全身部件爆散 + 视角回弹 + 命中顿帧 */
  spawnBodyDebris(teacher.group, { speed: 3.2 });
  kickView(0.045, (Math.random() - 0.5) * 0.05);
  hitStop = 0.07;

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
  state.guardKills++;
  /* 打完全部名额 → 隐藏结局 */
  if (state.guardKills >= GUARD_MAX_TOTAL){
    spawnBodyDebris(g.group, { speed: 3.9 });
    scene.remove(g.group);
    audio.punch();
    kickView(0.06, (Math.random() - 0.5) * 0.06);
    hitStop = 0.09;
    endByTotalVictory();
    return;
  }
  /* 先炸散再移除组：部件已摘到场景里，带物理飞走 */
  spawnBodyDebris(g.group, { speed: 3.9 });
  scene.remove(g.group);

  audio.punch();

  /* 打击感：视角回弹 + 顿帧（比打老师更重） */
  kickView(0.06, (Math.random() - 0.5) * 0.06);
  hitStop = 0.09;

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
  nearestGuardDist = Infinity;
  /* 距离最近的两名保安：用于挂载红色警灯（点光源有上限） */
  const near = [null, null];
  const nearD = [Infinity, Infinity];

  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;

    const pos = g.group.position;
    const dx = state.pos.x - pos.x;
    const dz = state.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < minDist) minDist = d;

    if (d < nearD[0]){ nearD[1] = nearD[0]; near[1] = near[0]; nearD[0] = d; near[0] = g; }
    else if (d < nearD[1]){ nearD[1] = d; near[1] = g; }

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
      g.userData.blink = blink;
    }
    if (g.glow){
      /* 加法光晕跟着闪烁，紧张态下更亮更大 */
      const b = g.userData.blink || 0;
      const tn = getTension();
      g.glow.material.opacity = 0.16 + 0.42 * b + 0.30 * tn;
      g.glow.scale.setScalar(1 + 0.5 * b + 0.6 * tn);
    }
  }

  /* 红色警灯挂到最近的两名保安头顶（无保安时强度归零） */
  updateGuardLights(near, getTension());
  nearestGuardDist = minDist;
}

/* 最近活保安的距离（供紧张值系统读取；无保安为 Infinity） */
let nearestGuardDist = Infinity;

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

/* =========================================================
   隐藏结局 · 一人军队（击倒全部 200 名保安）
   ========================================================= */
function endByTotalVictory(){
  if (state.ended) return;
  state.ended = true;
  hideAllPanels();
  for (const g of securityGuards) scene.remove(g.group);
  securityGuards.length = 0;
  unlockAch('army');

  $('endTitle').textContent = '无 人 能 挡';
  $('endSub').textContent = '第 200 名保安倒下了。走廊里再也走不出人来。';
  showEnding(state.totalScore,
    '你站在考场中央，呼吸和心跳一起慢下来。\n\n' +
    '脚下是两百具叠在一起的制服。帽檐、徽章、对讲机，散了一地。\n' +
    '监考老师不知什么时候已经跑了，教务处的电话打到了天亮。\n' +
    '来的人不认识你，只认识这个考场——他们后来把整层楼封了。\n\n' +
    '《NOI 竞赛纪律》最后一页写着：\n' +
    '“纪律需要人来执行。如果执行纪律的人都不够了，\n' +
    '那考场里就只剩下一条纪律：别惹写代码的人。”\n\n' +
    '隐藏结局 · 一人军队　　击倒保安 200 / 200');
  clearSave();
}

function hideAllPanels(){
  /* 3D 悬浮弹窗也要收场（弹窗不再是 DOM，无法用 classList 隐藏） */
  dismissDialogs();
  ['hud', 'pauseMenu', 'codeUI', 'paperUI', 'corridorUI',
   'bathroomUI', 'npcComputerUI', 'minimapWrap']
    .forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
}
