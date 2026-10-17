/* =========================================================
   交互判定：准星射线拾取 + 距离判定，生成 E / F / 空格动作
   ---------------------------------------------------------
   动作不是「按下就执行」，而是**按住确认**（VR 指针手感）：
   按住对应按键后准星进度环开始走，走满一圈才真正触发；
   中途松手 / 目标变了 / 动作消失，一律取消。
   由 index.html 内联脚本第 850-1604 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { CENTER, camera, raycaster } from '../render/gfx.js';
import { enterCorridor } from './corridor.js';
import { securityGuards } from '../world/entities.js';
import { GUARD_PUNCH_RANGE, punchGuard } from './guards.js';
import { disturbNPC, useNPCComputer } from './npc.js';
import { punchTeacher } from './teacher.js';
import { bump, recordEvent } from './stats.js';
import { promptEl } from '../ui/dom.js';
import { confirmCrosshair, setCrosshairHold, setCrosshairTarget } from '../ui/crosshair.js';
import { toast } from '../ui/toast.js';
import { interactables, npcs, teacher } from '../world/entities.js';

/* E / F 按住多久算确认。原来这里是「凝视 0.9s」的停留判定，
   玩家反馈太慢也不好控制，改成按键驱动的短蓄力。
   空格（攻击）不走蓄力：按下即生效，理由见 attackNow()。 */
export const HOLD_SECONDS = 0.3;

/* 连续出手的最小间隔。按住空格时键盘自动重复大约每 30ms 补一个 keydown，
   而每拳会在 0.9s 后补进 2 名保安 —— 完全不限速的话，按住两秒能刷出上百名
   保安把游戏拖死（旧版就是每次 keydown 都打）。0.25s 与挥拳音效 + 红闪同节奏。 */
export const ATTACK_INTERVAL = 0.25;

export let actionE = null;       // E 键动作：交互（电脑/水杯/草稿纸/出口）

export let actionF = null;       // F 键动作：干扰同学

export let actionSpace = null;   // 空格键动作：打老师 / 打保安

export let lastInteractKey = '';

/* 当前瞄到的目标标识（与准星共用同一份）。
   开始蓄力时记一份，蓄力途中一变就取消 ——
   否则「按着 E 转头」会把动作打到别的物体上。 */
let aimKey = '';

/* 蓄力状态。放在模块里而不是 DOM 上：主循环每帧推进它、
   准星每帧读它，两边都不该去问 DOM。 */
let holdKey = '';       // 正在按住的动作键（'' = 没在蓄力）
let holdT = 0;          // 已按住秒数
let holdAim = '';       // 按下那一刻的目标
let holdFired = false;  // 这一次按住是否已经触发过

/* 上一次真正出手的时刻（performance.now()，毫秒）。
   用时间戳而不是「每帧减 dt 的计数器」：攻击不需要逐帧推进，
   自给自足就不必再去 loop.js 多挂一个每帧钩子。 */
let lastAttackAt = -Infinity;

/* 命中目标时同时更新准星与本地记录 */
function aim(mode, key){
  aimKey = key;
  setCrosshairTarget(mode, key);
}

function actionFor(key){
  if (key === 'e') return actionE;
  if (key === 'f') return actionF;
  if (key === 'space') return actionSpace;
  return null;
}

export function updateInteract(){
  actionE = null;
  actionF = null;
  actionSpace = null;
  promptEl.classList.add('hidden');

  if (state.view !== 'world' || !state.started || state.ended || state.frozen){
    aim('idle', '');
    return;
  }

  /* 优先：保安 → 空格 */
  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;
    const d = Math.hypot(state.pos.x - g.group.position.x, state.pos.z - g.group.position.z);
    if (d < GUARD_PUNCH_RANGE){
      actionSpace = { fn: () => punchGuard(g) };
      const txt = `[ 空格 ] 殴打保安（距离 ${d.toFixed(1)}m）`;
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      promptEl.classList.remove('hidden');
      aim('attack', 'guard:' + i);
      return;
    }
  }

  /* 老师 → 空格 */
  if (teacher && !teacher.userData.leaving){
    const d = Math.hypot(state.pos.x - teacher.group.position.x,
                         state.pos.z - teacher.group.position.z);
    if (d < 2.4 && teacher.userData.mode !== 'warn'){
      actionSpace = { fn: punchTeacher };
      const txt = '[ 空格 ] 殴打监考老师（后果自负）';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      promptEl.classList.remove('hidden');
      aim('attack', 'teacher');
      return;
    }
  }

  /* 其他选手：坐着的 → F 干扰；离开的 → E 用电脑 */
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];
    const ud = n.userData;
    if (!ud) continue;
    const d = Math.hypot(state.pos.x - ud.seatX, state.pos.z - ud.seatZ);
    if (d < 2.3){
      if (ud.state === 'seated'){
        actionF = { fn: () => disturbNPC(i) };
        const txt = `[ 按住 F ] 干扰${ud.name}（他可能会报告老师）`;
        if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
        promptEl.classList.remove('hidden');
        aim('interact', 'npcSeated:' + i);
        return;
      } else if (ud.state === 'walking_away' || ud.state === 'away'){
        actionE = { fn: () => useNPCComputer(i) };
        const txt = `[ 按住 E ] 使用${ud.name}的电脑`;
        if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
        promptEl.classList.remove('hidden');
        aim('interact', 'npcAway:' + i);
        return;
      }
    }
  }

  /* 出口 → E */
  const dDoor = Math.hypot(state.pos.x - 7.85, state.pos.z - 0);
  if (dDoor < 3.0){
    if (state.bathroomApproved){
      actionE = { fn: () => enterCorridor('toilet') };
      const txt = '[ 按住 E ] 离开考场去洗手间';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      /* 未获批准时这里只有一句提示、没有可执行动作，所以不给交互态 */
      aim('interact', 'door');
    } else {
      const txt = '离开考场需要先按 H 举手征得老师同意';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    }
    promptEl.classList.remove('hidden');
    return;
  }

  /* 桌上物品（射线拾取） → E */
  raycaster.setFromCamera(CENTER, camera);
  raycaster.far = 3.2;
  const hits = raycaster.intersectObjects(interactables, false);
  if (hits.length && hits[0].object.userData.interact){
    const it = hits[0].object.userData.interact;
    actionE = { fn: it.action };
    const txt = '[ 按住 E ] ' + it.label;
    if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    promptEl.classList.remove('hidden');
    /* 用 uuid 而不是 label：6 张桌子上都有「喝水」，label 会串台 */
    aim('interact', 'item:' + hits[0].object.uuid);
  } else {
    /* 走到这里说明什么都没瞄到（另一条待机出口在函数开头） */
    aim('idle', '');
  }
}

/* =========================================================
   按住确认（只给 E / F 用）
   ---------------------------------------------------------
   按下 → 蓄力 → 走满一圈才执行；松手 / 换目标 / 丢焦点都取消。
   攻击（空格）不走这条路：见下面的 attackNow()。
   ========================================================= */

/**
 * 按下动作键，开始蓄力。只有 E / F 会蓄力。
 * @param {'e'|'f'} key
 */
export function beginInteractHold(key){
  /* 攻击是按下即生效的，混进蓄力会让「短按打不出拳」 */
  if (key !== 'e' && key !== 'f') return;
  /* 已经按着这个键了就直接忽略：键盘自动重复会不断重置 holdT，
     蓄力永远走不满；松手后 holdKey 才清空，所以也不会连触发两次。 */
  if (holdKey === key) return;
  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return;
  /* 没有可执行动作就不蓄力 —— 环不该空转 */
  if (!actionFor(key)) return;
  holdKey = key;
  holdT = 0;
  holdAim = aimKey;
  holdFired = false;
  setCrosshairHold(0);
}

/**
 * 松开动作键：没走满的一律作废。
 * @param {'e'|'f'} key
 */
export function endInteractHold(key){
  if (key !== holdKey) return;
  cancelInteractHold();
}

/** 取消蓄力（松手 / 丢焦点 / 离开世界视图） */
export function cancelInteractHold(){
  holdKey = '';
  holdT = 0;
  holdAim = '';
  holdFired = false;
  setCrosshairHold(0);
}

/**
 * 逐帧推进蓄力。core/loop.js 每帧调用 ——
 * 80ms 的判定节奏在 0.3s 的蓄力上只有 4 个采样点，撑不起顺滑的环。
 * @param {number} dt 秒
 */
export function updateInteractHold(dt){
  if (!holdKey || holdFired) return;

  /* 目标没了、或换成了别的目标 → 取消 */
  if (aimKey !== holdAim || !actionFor(holdKey)){ cancelInteractHold(); return; }

  holdT += dt;
  const p = holdT / HOLD_SECONDS;
  setCrosshairHold(Math.min(p, 1));
  if (p < 1) return;

  holdFired = true;
  const act = actionFor(holdKey);
  /* 先放回执再执行动作：动作可能开面板、切视图，准星随后就被隐藏了 */
  confirmCrosshair();
  if (act) act.fn();
}

/**
 * 攻击（空格）：按下即生效，不蓄力、不显示进度环。
 * 这里不看 keyup，**也照收键盘自动重复** —— 一直按着就该持续出手，
 * 保安走进范围的那一刻会被下一发打掉，不需要玩家松开重按。
 * 出手节奏由 ATTACK_INTERVAL 限住，理由见那个常量的注释。
 */
export function attackNow(){
  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return;
  /* 没瞄到可打的目标就不消耗冷却：保安刚走进范围时应当立刻挨打 */
  if (!actionSpace) return;
  const now = performance.now();
  if (now - lastAttackAt < ATTACK_INTERVAL * 1000) return;
  lastAttackAt = now;
  actionSpace.fn();
}

export function drinkWater(){
  bump('drinkWater');
  recordEvent('drink', '喝了一杯水');
  audio.beep(520, 0.08, 0.05);
  setTimeout(() => audio.beep(420, 0.1, 0.04), 110);
  toast('\u{1F964} 你喝了一口水，感觉清醒了一些。', 1600);
}
