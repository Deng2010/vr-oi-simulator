/* =========================================================
   走动警告与时间锁定惩罚
   由 index.html 内联脚本第 1981-2046 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { setTimeScale } from '../core/settings.js';
import { CONTEST_LEN, state } from '../core/state.js';
import { $ } from '../core/util.js';
import { closeTeacherDialog } from './teacher.js';
import { recordEvent } from './stats.js';
import { crosshair, dlgActions, dlgHead, dlgText, promptEl, teacherDlg } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { teacher } from '../world/entities.js';

export const WARNINGS = [
  '同学，比赛期间请不要随意走动，回到自己座位上。',
  '我刚才提醒过你了。再走动我要记录违纪了。',
  '这是最后一次口头警告，请立刻回到座位。',
  '……你再乱走，我就只能按考场纪律处理了。'
];

export function triggerTeacherWarning(){
  if (!teacher) return;
  state.warnCount++;
  state.wanderCount++;
  state.teacherWarnActive = true;
  state.wanderTimer = 0;
  teacher.userData.mode = 'approach';
  /* 只记事件，不另记计数：警告次数的真源是 state.warnCount（HUD 也在读它） */
  recordEvent('warn', '监考老师提出了口头警告');
}

export function applyWanderPenalty(){
  if (state.wanderPenaltyApplied) return;
  state.wanderPenaltyApplied = true;
  recordEvent('wander-penalty', '第五次随意走动：成绩被取消');

  /* 剩余虚拟时间强制回 10 分钟 */
  state.elapsed = CONTEST_LEN - 600;

  /* 流速：让这 10 分钟虚拟时间在实际 20 秒内跑完 */
  setTimeScale(30);

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

export function showTeacherWarning(){
  const idx = Math.min(state.warnCount - 1, WARNINGS.length - 1);
  dlgHead.textContent = '\u{1F468}\u200D\u{1F3EB} 监考老师（第 ' + state.warnCount + ' 次警告）';
  dlgText.textContent = WARNINGS[idx];
  dlgActions.innerHTML = '';
  const b = document.createElement('button');
  b.className = 'btn primary';
  b.textContent = '好的老师，我马上回去！';
  b.onclick = () => {
    closeTeacherDialog();
    if (teacher) teacher.userData.mode = 'returning';
    state.teacherWarnActive = false;
    state.wanderTimer = 0;
  };
  dlgActions.appendChild(b);
  teacherDlg.classList.remove('hidden');
  state.view = 'dialog';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
}
