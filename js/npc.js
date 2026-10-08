'use strict';
/* =========================================================
   npc —— 屏蔽词机制与选手 NPC 行为
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   屏蔽词
   ========================================================= */
const BANNED_WORDS = [
  'fuck', 'fucking', 'fucker', 'fucked',
  'shit', 'bullshit', 'bitch', 'asshole', 'bastard',
  'ccf', 'ccccf',
  '傻逼', '妈的', '操你', '尼玛', '你妈',
  '滚蛋', '垃圾出题人', '垃圾比赛'
];
function containsBannedWord(code){
  const lower = code.toLowerCase();
  for (const w of BANNED_WORDS){
    if (lower.includes(w.toLowerCase())) return w;
  }
  return null;
}

function showBannedWordDialog(word){
  /* 弹窗悬浮在 3D 世界中，必须先收起 IDE 让世界重新可见 */
  closeCode();
  const display = word.toUpperCase();
  openDialog({
    title: '\u{1F468}\u200D\u{1F3EB} 监考老师',
    text: '等等……\n\n' +
      `我在你的代码里看到了 "${display}"。\n\n` +
      '这是暴戾语言。根据《NOI 竞赛纪律》，考试期间任何形式的\n' +
      '不文明用语都会被记录，并取消本次比赛成绩。\n\n' +
      '请跟我去考务办公室。',
    options: [{
      label: '……（无法辩解）',
      cb: dlg => {
        closeDialog(dlg);          /* 按钮即消除弹窗 */
        endByBannedWord(word);
      }
    }]
  });
  audio.beep(180, 0.5, 0.06, 'sawtooth');
  setTimeout(() => audio.beep(120, 0.7, 0.06, 'sawtooth'), 250);
}

function endByBannedWord(word){
  if (state.ended) return;
  state.ended = true;
  hideAllPanels();
  for (const g of securityGuards) scene.remove(g.group);
  securityGuards.length = 0;
  unlockAch('banned');

  $('endTitle').textContent = '取 消 成 绩';
  $('endSub').textContent = `你的代码中包含暴戾语言 "${word.toUpperCase()}"。`;
  showEnding(0,
    `监考老师把你的代码截了图，作为证据附在违纪记录里。\n` +
    `本次比赛成绩作废。\n\n` +
    `赛场上可以打暴力，不能打嘴炮。\n下次请注意文明用语。`);
}

/* =========================================================
   干扰选手
   ========================================================= */
const DISTURB_LINES = [
  '干嘛啊你？别动我键盘！',
  '……你走开，我正在想题。',
  '呜呜呜，我要举手了！',
  '老师！！有人捣乱！！'
];

function disturbNPC(i){
  const n = npcs[i];
  if (!n || n.userData.state !== 'seated') return;
  if (state.view !== 'world' || state.ended || state.frozen) return;

  const ud = n.userData;
  ud.anger++;
  audio.beep(280 + Math.random() * 200, 0.08, 0.04);
  audio.beep(180, 0.12, 0.05, 'triangle');

  const dx = state.pos.x - n.group.position.x;
  const dz = state.pos.z - n.group.position.z;
  n.group.rotation.y = Math.atan2(dx, dz);
  n.head.rotation.x = -0.35;
  setTimeout(() => { n.head.rotation.x = 0; }, 350);

  const line = DISTURB_LINES[Math.min(ud.anger - 1, DISTURB_LINES.length - 1)];
  toast(`${ud.name}：“${line}”`, 1700);
  state.wanderTimer = Math.max(0, state.wanderTimer - 1.5);

  /* 干扰 3 人解锁 */
  if (npcs.filter(x => x.userData.anger > 0).length >= 3) unlockAch('trouble');

  if (ud.anger >= 3){
    ud.state = 'walking_away';
    ud.timer = 0;
    toast(`${ud.name} 猛地站起来，朝监考老师走去了……`, 2200);
    audio.beep(660, 0.1, 0.05);
  }
}

function useNPCComputer(i){
  const n = npcs[i];
  if (!n) return;
  const ud = n.userData;
  if (ud.state !== 'walking_away' && ud.state !== 'away'){
    toast('他还在座位上，你不好动手。', 1500);
    return;
  }
  state.view = 'npcComputer';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  releaseLock();
  $('npcCompHead').textContent = `\u{1F4BB} ${ud.name}的电脑`;
  $('npcCompCode').textContent = genNpcCode(ud.name, state.npcProbId);
  npcComputerUI.classList.remove('hidden');
  audio.beep(520, 0.06, 0.035);
  setTimeout(() => audio.beep(660, 0.06, 0.035), 90);

  if (Math.random() < 0.28){
    setTimeout(() => {
      if (state.view === 'npcComputer'){
        toast('远处传来脚步声……有人回来了。', 2200);
      }
    }, 3200);
  }
}

function closeNPCComputer(){
  npcComputerUI.classList.add('hidden');
  state.view = 'world';
  crosshair.classList.remove('hidden');
  requestLock();
}

/* ---------- 投诉 ---------- */
function triggerNPCComplaint(name){
  /* 同学告老师：3D 悬浮弹窗，点"我知道了"消除，鼠标吸附不中断 */
  openDialog({
    title: '\u{1F468}\u200D\u{1F3EB} 监考老师',
    text: `${name}举手报告：“老师！他一直在干扰我答题！”\n\n` +
      `监考老师皱眉看向你：\n` +
      `“同学，比赛期间禁止干扰其他选手。` +
      `这是第 ${state.warnCount + 1} 次警告，再有下次就记录违纪了。”`,
    options: [{
      label: '我知道了',
      cb: dlg => {
        closeDialog(dlg);          /* 按钮即消除弹窗 */
        state.warnCount++;
        if (teacher) teacher.userData.mode = 'patrol';
        state.wanderTimer = 0;
      }
    }]
  });
}

/* =========================================================
   NPC 状态机
   ========================================================= */
function updateNPCs(realDt, t){
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];
    const ud = n.userData;
    if (!ud) continue;
    const upright = (ud.state === 'walking_away' ||
                 ud.state === 'away' ||
                 ud.state === 'walking_back');
    if (n.legsSit)   n.legsSit.visible   = !upright;
    if (n.legsStand) n.legsStand.visible = upright;

    if (ud.state === 'seated'){
      const v = Math.sin(t * 6 + n.phase) * 0.06;
      n.armL.rotation.x = v;
      n.armR.rotation.x = -v;
      n.head.rotation.x = Math.sin(t * 3 + n.phase) * 0.05;
      n.group.rotation.y += (ud.baseRot - n.group.rotation.y) * Math.min(1, realDt * 4);

    } else if (ud.state === 'walking_away'){
      const tx = 2.4, tz = 0;
      const dx = tx - n.group.position.x;
      const dz = tz - n.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5){
        n.group.position.set(tx, 0, tz);
        ud.state = 'away';
        ud.timer = 5.0;
        if (teacher) triggerNPCComplaint(ud.name);
        else toast(`${ud.name} 跑到监考处，发现老师不见了……`, 2200);
      } else {
        const sp = 1.6 * realDt;
        n.group.position.x += (dx / d) * sp;
        n.group.position.z += (dz / d) * sp;
        n.group.rotation.y = Math.atan2(dx, dz);
        const v = Math.sin(t * 9 + n.phase) * 0.35;
        n.armL.rotation.x = v;
        n.armR.rotation.x = -v;
      }

    } else if (ud.state === 'away'){
      ud.timer -= realDt;
      const ty = teacher ? 0 : -5.5;
      n.group.rotation.y = Math.atan2(2.4 - n.group.position.x, ty - n.group.position.z);
      n.armL.rotation.x = -0.5 + Math.sin(t * 8) * 0.3;
      n.armR.rotation.x = -0.5 + Math.cos(t * 8) * 0.3;
      if (ud.timer <= 0) ud.state = 'walking_back';

    } else if (ud.state === 'walking_back'){
      const tx = ud.seatX, tz = ud.seatZ;
      const dx = tx - n.group.position.x;
      const dz = tz - n.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15){
        n.group.position.set(tx, 0, tz);
        n.group.rotation.y = ud.baseRot;
        ud.state = 'seated';
        ud.anger = 0;
        n.armL.rotation.x = 0; n.armR.rotation.x = 0;
        n.head.rotation.x = 0;
      } else {
        const sp = 1.6 * realDt;
        n.group.position.x += (dx / d) * sp;
        n.group.position.z += (dz / d) * sp;
        n.group.rotation.y = Math.atan2(dx, dz);
        const v = Math.sin(t * 9 + n.phase) * 0.35;
        n.armL.rotation.x = v;
        n.armR.rotation.x = -v;
      }
    }
  }
}
