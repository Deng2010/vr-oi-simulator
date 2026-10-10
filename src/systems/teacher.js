/* =========================================================
   监考老师：举手呼叫、对话、被殴打
   由 index.html 内联脚本第 1605-2619 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { scene } from '../render/gfx.js';
import { spawnTwoGuards } from './guards.js';
import { unlockAch } from '../ui/achievements.js';
import { crosshair, dlgActions, dlgHead, dlgText, promptEl, redFlash, teacherDlg } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { setTeacher, teacher } from '../world/entities.js';

export function punchTeacher(){
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
      setTeacher(null);
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

export function callTeacher(){
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
  dlgHead.textContent = '\u{1F468}\u200D\u{1F3EB} 监考老师';
  showTeacherDialog('同学，有什么事吗？', opts);
}

export function showTeacherDialog(text, options){
  state.view = 'dialog';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  teacherDlg.classList.remove('hidden');
  dlgText.textContent = text;
  dlgActions.innerHTML = '';
  options.forEach(opt => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = opt.text;
    b.onclick = () => {
      if (opt.action) opt.action();
      dlgText.textContent = opt.reply;
      dlgActions.innerHTML = '';
      const c = document.createElement('button');
      c.className = 'btn primary';
      c.textContent = '好的';
      c.onclick = closeTeacherDialog;
      dlgActions.appendChild(c);
    };
    dlgActions.appendChild(b);
  });
}

export function closeTeacherDialog(){
  teacherDlg.classList.add('hidden');
  state.view = 'world';
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
