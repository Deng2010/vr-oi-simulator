/* =========================================================
   交互判定：准星射线拾取 + 候选目标列表，生成 E / F / 空格动作
   ---------------------------------------------------------
   动作不是「按下就执行」，而是**按住确认**（VR 指针手感）：
   按住对应按键后准星进度环开始走，走满一圈才真正触发；
   中途松手 / 目标变了 / 动作消失，一律取消。
   由 index.html 内联脚本第 850-1604 行拆出。

   目标模型（本版新增）：
     · 每 80ms 收集一次「当前可交互对象」，推到右上角列表；
     · 默认选中项由权重决定（保安 > 精准瞄准的物件 > 水杯辅助瞄准
       > 老师 > 考生 > 出口），玩家也可以按 Tab / Shift+Tab 手动切换；
     · 考生 / 监考老师必须**正对着**才进列表（保安不在此列）；
     · 电脑 / 草稿纸 / 水杯必须**准星真正指向**才进列表 ——
       前两者用精确射线，水杯因为体积小，额外给一条略宽的射线-球体辅助。
   ========================================================= */
import * as THREE from 'three';
import { state } from '../core/state.js';
import { CENTER, camera, raycaster } from '../render/gfx.js';
import { canPutDownCup, isHoldingCup, putDownCup } from './cup.js';
import { enterCorridor } from './corridor.js';
import { securityGuards } from '../world/entities.js';
import { GUARD_PUNCH_RANGE, punchGuard } from './guards.js';
import { disturbNPC, useNPCComputer } from './npc.js';
import { punchTeacher } from './teacher.js';
import { promptEl } from '../ui/dom.js';
import { confirmCrosshair, setCrosshairHold, setCrosshairTarget } from '../ui/crosshair.js';
import { renderTargets } from '../ui/hud.js';
import {
  CUP_AIM_RADIUS, CUP_AIM_RANGE, FACE_MIN_DOT,
  bestTarget, cycleIndex, facingDot, raySphereHit
} from './targeting.js';
import { interactables, npcs, teacher } from '../world/entities.js';

/* E / F 按住多久算确认。原来这里是「凝视 0.9s」的停留判定，
   玩家反馈太慢也不好控制，改成按键驱动的短蓄力。
   空格（攻击）不走蓄力：按下即生效，理由见 attackNow()。 */
export const HOLD_SECONDS = 0.3;

/* 连续出手的最小间隔。按住空格时键盘自动重复大约每 30ms 补一个 keydown，
   而每拳会在 0.9s 后补进 2 名保安 —— 完全不限速的话，按住两秒能刷出上百名
   保安把游戏拖死（旧版就是每次 keydown 都打）。0.25s 与挥拳音效 + 红闪同节奏。 */
export const ATTACK_INTERVAL = 0.25;

/* 老师 / 考生 / 出口的判定半径。考生与老师另加「正对着」的朝向门槛。 */
const TEACHER_RANGE = 2.4;
const NPC_RANGE = 2.3;
const DOOR_RANGE = 3.0;
const DOOR_X = 7.85, DOOR_Z = 0;

/* 通用射线射程。水杯另有一条 3.4m 的辅助判定（见 targeting.js）。 */
const RAY_FAR = 3.2;

/* 默认选中的权重。数值只影响「同时有好几个目标时先选谁」，
   与操作优先级无关：E / F / 空格各自只认自己那条动作。 */
const W_GUARD = 100;
const W_AIMED_ITEM = 90;
const W_CUP_AIM = 80;
const W_TEACHER = 70;
const W_HELD_CUP = 65;
const W_NPC = 60;
const W_DOOR = 40;

export let actionE = null;       // E 键动作：交互（电脑/水杯/草稿纸/出口）

export let actionF = null;       // F 键动作：干扰同学

export let actionSpace = null;   // 空格键动作：打老师 / 打保安

export let lastInteractKey = '';

/* 当前候选列表与选中项。列表项同时带展示字段（emoji / name / hint）
   与执行字段（actionE / actionF / actionSpace），UI 只读展示字段。 */
export let targetList = [];
export let selectedTargetKey = '';

/* 当前瞄到的目标标识（与准星共用同一份）。
   开始蓄力时记一份，蓄力途中一变就取消 ——
   否则「按着 E 转头」会把动作打到别的物体上。 */
let aimKey = '';

/* 玩家是否用 Tab 手动选过目标。手动选择会一直保留到
   目标离开列表（走远 / 背对 / 被拿走）为止。 */
let manualSelection = false;

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

/* 复用的临时向量：候选扫描每 80ms 跑一次，别在热路径里 new */
const _itemPos = new THREE.Vector3();

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

function makeTarget(opts){
  return {
    key: opts.key,
    emoji: opts.emoji || '\u2726',
    name: opts.name || '可交互对象',
    hint: opts.hint || '',
    weight: opts.weight || 0,
    dist: Number.isFinite(opts.dist) ? opts.dist : 0,
    auto: !!opts.auto,
    disabled: !!opts.disabled,
    mode: opts.mode || 'interact',
    actionE: opts.actionE || null,
    actionF: opts.actionF || null,
    actionSpace: opts.actionSpace || null,
    prompt: opts.prompt || ''
  };
}

function itemTarget(obj, weight, dist, auto){
  const it = obj && obj.userData && obj.userData.interact;
  if (!it || typeof it.action !== 'function') return null;
  return makeTarget({
    key: 'item:' + obj.uuid,
    emoji: it.emoji || '\u2726',
    name: it.name || '桌面物品',
    hint: 'E',
    weight,
    dist,
    auto,
    mode: 'interact',
    actionE: it.action,
    prompt: '[ 按住 E ] ' + it.label
  });
}

/**
 * 收集当前所有可交互对象。
 * @returns {{list: object[]}}
 */
function buildTargets(){
  const list = [];
  const seenItems = new Set();

  /* 1. 保安：距离内就能打，不要求朝向。
        玩家被追着跑的时候不该还得先「看准」保安。 */
  for (const g of securityGuards){
    if (!g.userData.alive) continue;
    const d = Math.hypot(state.pos.x - g.group.position.x,
                         state.pos.z - g.group.position.z);
    if (d >= GUARD_PUNCH_RANGE) continue;
    list.push(makeTarget({
      key: 'guard:' + g.uuid,
      emoji: '\u{1F46E}',
      name: '保安',
      hint: '空格',
      weight: W_GUARD,
      dist: d,
      auto: true,
      mode: 'attack',
      actionSpace: () => punchGuard(g),
      prompt: `[ 空格 ] 殴打保安（距离 ${d.toFixed(1)}m）`
    }));
  }

  /* 2. 监考老师：必须正对着（本版新增），且不在警告对话里 */
  if (teacher && !teacher.userData.leaving){
    const tp = teacher.group.position;
    const d = Math.hypot(state.pos.x - tp.x, state.pos.z - tp.z);
    const facing = facingDot(state.pos.x, state.pos.z, state.yaw, tp.x, tp.z);
    if (d < TEACHER_RANGE && facing >= FACE_MIN_DOT && teacher.userData.mode !== 'warn'){
      list.push(makeTarget({
        key: 'teacher',
        emoji: '\u{1F468}\u200D\u{1F3EB}',
        name: '监考老师',
        hint: '空格',
        weight: W_TEACHER,
        dist: d,
        auto: true,
        mode: 'attack',
        actionSpace: punchTeacher,
        prompt: '[ 空格 ] 殴打监考老师（后果自负）'
      }));
    }
  }

  /* 3. 手里拿着水杯：只保留「放回桌面」与攻击目标，
        其它桌面物件 / 考生 / 出口暂时锁住（与旧版手感一致）。 */
  if (isHoldingCup()){
    const put = canPutDownCup();
    list.push(makeTarget({
      key: 'held-cup',
      emoji: '\u{1F964}',
      name: '手中的水杯',
      hint: put ? 'E' : '',
      weight: W_HELD_CUP,
      dist: 0,
      auto: true,
      disabled: !put,
      mode: put ? 'interact' : 'idle',
      actionE: put ? putDownCup : null,
      prompt: put
        ? '[ 按住 E ] 放回桌面　·　左键投掷　·　右键喝水'
        : '水杯在手上：左键投掷 · 右键喝水 · 走回桌边按住 E 放下'
    }));
    return { list };
  }

  /* 4. 其他选手：坐着的 → F 干扰；离座的 → E 用电脑。
        必须正对着才能进列表（本版新增）。 */
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];
    const ud = n.userData;
    if (!ud) continue;
    const d = Math.hypot(state.pos.x - ud.seatX, state.pos.z - ud.seatZ);
    if (d >= NPC_RANGE) continue;
    const facing = facingDot(state.pos.x, state.pos.z, state.yaw, ud.seatX, ud.seatZ);
    if (facing < FACE_MIN_DOT) continue;

    if (ud.state === 'seated'){
      list.push(makeTarget({
        key: 'npc:' + i,
        emoji: '\u{1F9D1}\u200D\u{1F393}',
        name: ud.name,
        hint: 'F',
        weight: W_NPC,
        dist: d,
        auto: true,
        mode: 'interact',
        actionF: () => disturbNPC(i),
        prompt: `[ 按住 F ] 干扰${ud.name}（他可能会报告老师）`
      }));
    } else if (ud.state === 'walking_away' || ud.state === 'away'){
      list.push(makeTarget({
        key: 'npc:' + i,
        emoji: '\u{1F4BB}',
        name: `${ud.name}的电脑`,
        hint: 'E',
        weight: W_NPC,
        dist: d,
        auto: true,
        mode: 'interact',
        actionE: () => useNPCComputer(i),
        prompt: `[ 按住 E ] 使用${ud.name}的电脑`
      }));
    }
  }

  /* 5. 出口：距离够就能看到。没获批准时只给提示、不给动作。 */
  const dDoor = Math.hypot(state.pos.x - DOOR_X, state.pos.z - DOOR_Z);
  if (dDoor < DOOR_RANGE){
    const approved = !!state.bathroomApproved;
    list.push(makeTarget({
      key: 'door',
      emoji: '\u{1F6AA}',
      name: '考场出口',
      hint: approved ? 'E' : '',
      weight: W_DOOR,
      dist: dDoor,
      auto: true,
      disabled: !approved,
      mode: approved ? 'interact' : 'idle',
      actionE: approved ? () => enterCorridor('toilet') : null,
      prompt: approved
        ? '[ 按住 E ] 离开考场去洗手间'
        : '离开考场需要先按 H 举手征得老师同意'
    }));
  }

  /* 6. 准星精准命中的桌面物件：优先进入自动选中 */
  raycaster.setFromCamera(CENTER, camera);
  raycaster.far = RAY_FAR;
  const hits = raycaster.intersectObjects(interactables, false);
  if (hits.length && hits[0].object.userData.interact){
    const obj = hits[0].object;
    const t = itemTarget(obj, W_AIMED_ITEM, hits[0].distance, true);
    if (t){ seenItems.add(t.key); list.push(t); }
  }

  /* 7. 水杯辅助瞄准：比通用射线略宽、略远（玩家反馈杯子太小不好点）。
        已经在第 6 步精准命中的杯子不重复加入。 */
  const ro = raycaster.ray.origin;
  const rd = raycaster.ray.direction;
  for (const obj of interactables){
    if (!obj.userData.cup) continue;
    const key = 'item:' + obj.uuid;
    if (seenItems.has(key)) continue;
    obj.getWorldPosition(_itemPos);
    const hit = raySphereHit(
      ro.x, ro.y, ro.z, rd.x, rd.y, rd.z,
      _itemPos.x, _itemPos.y, _itemPos.z,
      CUP_AIM_RANGE, CUP_AIM_RADIUS
    );
    if (!hit) continue;
    const t = itemTarget(obj, W_CUP_AIM, hit.dist, true);
    if (t){ seenItems.add(key); list.push(t); }
  }

  /* 电脑 / 草稿纸 / 水杯只认上面两步：没被准星指到的桌面物件不进列表，
     也就不能用 Tab 隔空选中 —— 与「光标对着才能交互」保持一致。 */

  return { list };
}

/**
 * 根据候选列表决定当前选中项：
 *   · 手动选择还在列表里 → 保留；
 *   · 否则 → 权重最高的自动候选（没有自动候选就不选）。
 * @param {object[]} list
 * @returns {object|null}
 */
function chooseSelected(list){
  let selected = null;
  if (manualSelection && selectedTargetKey){
    selected = list.find(t => t.key === selectedTargetKey) || null;
    if (!selected) manualSelection = false;
  }
  if (!selected) selected = bestTarget(list.filter(t => t.auto));
  selectedTargetKey = selected ? selected.key : '';
  return selected;
}

/* 把选中项翻译成动作 / 提示 / 准星状态。Tab 切换与每 80ms 的自动判定共用。 */
function applySelected(selected, list){
  /* actionE / actionF 是「{ fn }」形状（沿用旧接口）；目标里存的是裸函数，
     这里统一包一层，别让 beginInteractHold 拿到一个没有 .fn 的函数。 */
  actionE = selected && selected.actionE ? { fn: selected.actionE } : null;
  actionF = selected && selected.actionF ? { fn: selected.actionF } : null;

  /* 空格始终能用：如果手动选中的是水杯 / 电脑（没有攻击动作），
     保安走进范围时仍然要能一拳打出去，所以回退到最近的攻击目标。 */
  const attackBest = bestTarget(list.filter(t => t.actionSpace));
  const spaceTarget = selected && selected.actionSpace ? selected : attackBest;
  actionSpace = spaceTarget ? { fn: spaceTarget.actionSpace } : null;

  if (selected){
    if (selected.prompt && selected.prompt !== lastInteractKey){
      lastInteractKey = selected.prompt;
      promptEl.textContent = selected.prompt;
    }
    promptEl.classList.remove('hidden');
    if (selected.mode === 'attack') aim('attack', selected.key);
    else if (selected.mode === 'interact') aim('interact', selected.key);
    else aim('idle', '');
  } else {
    aim('idle', '');
  }

  renderTargets(list, selectedTargetKey);
}

export function updateInteract(){
  actionE = null;
  actionF = null;
  actionSpace = null;
  promptEl.classList.add('hidden');

  if (state.view !== 'world' || !state.started || state.ended || state.frozen){
    resetInteractTargets();
    aim('idle', '');
    return;
  }

  const { list } = buildTargets();
  targetList = list;
  const selected = chooseSelected(list);
  applySelected(selected, list);
}

/**
 * 清空目标列表与选中项（离开世界视图时用）。
 * 与 updateInteract 的「无效状态」分支共用，避免两处逻辑分叉。
 */
export function resetInteractTargets(){
  targetList = [];
  selectedTargetKey = '';
  manualSelection = false;
  lastInteractKey = '';
  actionE = null;
  actionF = null;
  actionSpace = null;
  promptEl.classList.add('hidden');
  renderTargets([], '');
}

/**
 * Tab / Shift+Tab：在右上角列表里切换选中项。
 * @param {number} dir +1 = Tab，-1 = Shift+Tab
 */
export function cycleTarget(dir){
  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return;
  if (!targetList.length) return;

  const cur = targetList.findIndex(t => t.key === selectedTargetKey);
  const next = cycleIndex(cur, targetList.length, dir);
  if (next < 0) return;

  selectedTargetKey = targetList[next].key;
  manualSelection = true;
  /* 换目标时正在走的蓄力作废：否则松手前会打到新目标上 */
  cancelInteractHold();
  applySelected(targetList[next], targetList);
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
