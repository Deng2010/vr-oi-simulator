'use strict';
/* =========================================================
   teacher —— 监考老师：警告 / 惩罚 / 举手对话
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   老师警告
   ========================================================= */
const WARNINGS = [
  '同学，比赛期间请不要随意走动，回到自己座位上。',
  '我刚才提醒过你了。再走动我要记录违纪了。',
  '这是最后一次口头警告，请立刻回到座位。',
  '……你再乱走，我就只能按考场纪律处理了。'
];

function triggerTeacherWarning(){
  if (!teacher) return;
  state.warnCount++;
  state.wanderCount++;
  state.teacherWarnActive = true;
  state.wanderTimer = 0;
  teacher.userData.mode = 'approach';
}
function applyWanderPenalty(){
  if (state.wanderPenaltyApplied) return;
  state.wanderPenaltyApplied = true;

  /* 剩余虚拟时间强制回 10 分钟 */
  state.elapsed = CONTEST_LEN - 600;

  /* 流速：让这 10 分钟虚拟时间在实际 20 秒内跑完 */
  timeScale = 30;

  /* 锁定滑条（开始界面 + 暂停菜单） */
  ['timeSliderStart', 'timeSlider'].forEach(id => {
    const e = $(id);
    if (e){ e.disabled = true; e.style.opacity = '0.4'; }
  });
  const sv1 = $('timeValueStart');
  if (sv1) sv1.textContent = '锁定';
  const sv2 = $('timeValue');
  if (sv2) sv2.textContent = '锁定';

  /* 模糊提示：不暴露真正原因，但暗示有记录 + 时间异动 */
  toast('监考老师低头在记录本上写了些什么。等你再抬头时，' +
        '挂钟的指针不知为何跳了一大格。', 5000);
  audio.beep(220, 0.5, 0.05, 'sawtooth');
  setTimeout(() => audio.beep(160, 0.6, 0.05, 'sawtooth'), 250);
}

function showTeacherWarning(){
  const idx = Math.min(state.warnCount - 1, WARNINGS.length - 1);
  /* 3D 悬浮弹窗：不切视图、不释放鼠标吸附，玩家可边挨骂边转身 */
  openDialog({
    title: '\u{1F468}\u200D\u{1F3EB} 监考老师（第 ' + state.warnCount + ' 次警告）',
    text: WARNINGS[idx],
    options: [{
      label: '好的老师，我马上回去！',
      cb: dlg => {
        closeDialog(dlg);          /* 按钮即消除弹窗 */
        if (teacher) teacher.userData.mode = 'returning';
        state.teacherWarnActive = false;
        state.wanderTimer = 0;
      }
    }]
  });
}

/* =========================================================
   举手对话
   ========================================================= */
function callTeacher(){
  if (state.view !== 'world' || state.ended || state.frozen) return;
  if (!teacher){
    toast('监考老师已经跑了……没人能帮你了。', 2000);
    return;
  }
  const opts = [];
  if (!state.bathroomApproved){
    opts.push({
      text: '老师，我想去洗手间',
      reply: '好，去吧。出门右转走到头就是。快去快回，别耽误太久。',
      action: () => {
        state.bathroomApproved = true;
        toast('老师同意了。走到门口按 E 离开考场。', 3000);
      }
    });
  } else {
    opts.push({
      text: '我已经获得许可了',
      reply: '嗯，那你去吧，快去快回。'
    });
  }
  opts.push(
    { text: '我这道题读不懂题意', reply: '你先自己再读一遍题面。如果确实是题目描述有歧义，我会帮你记录，但不解释算法。' },
    { text: '我的电脑好像有点问题', reply: '稍等，我看看……嗯，重启一下编译器试试？不行的话我给你换台机器。' },
    { text: '我想再要一张草稿纸', reply: '好的，一会儿给你送过来。' },
    { text: '没事了，谢谢老师', reply: '好的，继续加油。' }
  );
  showTeacherDialog('同学，有什么事吗？', opts);
}

function showTeacherDialog(text, options){
  /* 选项按钮：进入"回复态"——不关闭弹窗，只把正文换成老师的回答，
     并把按钮替换为一个关闭用的"好的"（见 activateDialogButton 约定） */
  openDialog({
    title: '\u{1F468}\u200D\u{1F3EB} 监考老师',
    text,
    options: options.map(opt => ({
      label: opt.text,
      cb: dlg => {
        if (opt.action) opt.action();
        setDialogContent(dlg, {
          text: opt.reply,
          options: [{ label: '好的', cb: d => closeDialog(d) }]
        });
      }
    }))
  });
}

function closeTeacherDialog(){
  /* 收起弹窗（DOM 蒙层已移除，这里只清理 3D 画板） */
  dismissDialogs();
  crosshair.classList.remove('hidden');

  /* 关键修复：
     如果用 Esc 关掉警告对话框（而不是点按钮），
     teacherWarnActive 会一直停在 true，老师也会卡在 'warn' 模式，
     导致之后离开座位再也检测不到。这里统一兜底恢复。 */
  if (state.teacherWarnActive){
    state.teacherWarnActive = false;
    state.wanderTimer = 0;
    if (teacher && teacher.userData.mode === 'warn'){
      teacher.userData.mode = 'returning';
    }
  }
}
