/* =========================================================
   水杯：捡起 / 跟随视角 / 投掷 / 物理反弹 / 喝水 / 放回桌面
   ---------------------------------------------------------
   操作：
     · 按住 E（或按住左键）瞄准桌上的水杯 → 捡起；
     · 拿在手里时，左键投掷、右键喝水、按住 E 放回最近的空桌面；
     · 杯子砸中监考老师 = 放倒老师 + 召唤保安；
       砸中其他选手 = 一次干扰，对方直接起身去找老师（与离座干扰同路径）；
       砸中任何实体 / 墙 / 课桌都会按法线反弹。
   ---------------------------------------------------------
   为什么杯子不设 userData.dynamic：
     合批已经靠 userData.interact / noBatch / 半透明材质三条判据跳过它；
     而 dev 的场景完整性自检会把带 dynamic 标记的节点当成「人物根」，
     多出 6 个杯子会让 dynamicRoots / skippedDynamic 的健康指标失真。
   ========================================================= */
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { WATER_EGG_DRINKS } from '../data/endings/water.js';
import { camera, scene } from '../render/gfx.js';
import { cupHitNPC } from './npc.js';
import { knockDownTeacher } from './teacher.js';
import { bump, recordEvent, stats } from './stats.js';
import { flashDrink } from '../ui/feedback.js';
import { toast } from '../ui/toast.js';
import { interactables, npcs, securityGuards, teacher } from '../world/entities.js';
import { obstacles } from '../world/obstacles.js';
import {
  CUP_GRAVITY, CUP_RADIUS, CUP_RESTITUTION, FLOOR_RESTITUTION, THROW_SPEED,
  reflectVelocity, segmentHitsCylinder
} from './cup-physics.js';

/* 放回桌面时，玩家离最近一张空桌子的最大距离 */
export const PUT_DOWN_RANGE = 3.2;

/* 拿在手里的缩放与位置：0.52m 处放大 1.5 倍，杯子在视野里约 15° 高，
   既能看清又不挡准星。位置是相机局部坐标（右 / 下 / 前）。 */
const HELD_SCALE = 1.5;
const HAND_POS = new THREE.Vector3(0.30, -0.27, -0.52);

const DRINK_ANIM_SECONDS = 0.55;
const DRINK_COOLDOWN_MS = 550;
const HIT_COOLDOWN = 0.3;

/* 一次投掷最多在空中飞多久。正常 1~3 秒就落地；给一个上限是为了
   防止杯子恰好卡在课桌侧面 / 墙角之间反复低速弹跳，永远不满足
   「速度足够小」的落地判据。超过上限就直接躺在当前位置的地面上。 */
const MAX_FLIGHT_SECONDS = 4.5;

/* 房间内壁：比 ROOM_W/2、ROOM_D/2 各留一点余量，避免正好贴着脸 */
const ROOM_HALF_W = 7.9;
const ROOM_HALF_D = 6.9;
const ROOM_H = 3.3;

/* 低于这个高度才把课桌当障碍；高过桌面的飞行不拦 */
const DESK_BLOCK_TOP = 0.88;

const cups = [];
/* 所有课桌的桌面坐标。它比「每只杯子自己的 home」更稳定：
   杯子可以被放到别的桌子上，若只按每只杯子的 home 记占用，
   被占的那张桌子会从候选里消失，而另一张桌子又会被重复占用。 */
const deskHomes = [];
let heldCup = null;
let nextDrinkAt = 0;

/* 复用的临时向量：物理每帧都在跑，别在热路径里 new */
const _dir = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _next = new THREE.Vector3();
const _hand = new THREE.Vector3();

function canUseCup(){
  return state.view === 'world' && state.started && !state.ended && !state.frozen;
}

function removeInteractable(obj){
  const i = interactables.indexOf(obj);
  if (i >= 0) interactables.splice(i, 1);
}

function addInteractable(obj){
  if (!interactables.includes(obj)) interactables.push(obj);
}

function setHeldMaterial(data, held){
  if (!data.material) return;
  data.material.depthTest = !held;
  data.material.depthWrite = !held;
}

/**
 * 把一只建好的水杯登记进系统（由 models/desk.js 调用）。
 * @param {THREE.Mesh} cup 水杯网格
 * @param {THREE.Vector3} home 它在桌面上的世界坐标
 * @returns {THREE.Mesh}
 */
export function registerCup(cup, home){
  cup.userData.cup = {
    mode: 'desk',                 // desk | held | flying | rest
    home: home.clone(),
    vel: new THREE.Vector3(),
    bounces: 0,
    hitCooldown: 0,
    lastHit: '',
    drinkT: 0,
    airT: 0,
    material: cup.material
  };
  /* 交互 + 半透明已足以避开合批，再显式标一次：
     以后即使把杯子换成不透明材质，也不会被烘进静态几何体。 */
  cup.userData.noBatch = true;
  /* name / emoji 是右上角「可交互对象」列表的展示字段；
     label 才是按住 E 时的完整动作提示。 */
  cup.userData.interact = {
    name: '水杯', emoji: '\u{1F964}', label: '捡起水杯', action: () => pickUpCup(cup)
  };
  cups.push(cup);
  if (!deskHomes.some(h => h.distanceToSquared(home) < 1e-4)) deskHomes.push(home.clone());
  addInteractable(cup);
  return cup;
}

/** 当前是否拿着水杯（输入层 / 交互提示用）。 */
export function isHoldingCup(){ return !!heldCup; }

/**
 * 现在按 E 能不能放下杯子（附近要有没被别的杯子占用的桌面）。
 * 交互提示需要它，所以单独暴露。
 */
export function canPutDownCup(){
  return !!heldCup && !!nearestFreeHome(state.pos.x, state.pos.z);
}

function nearestFreeHome(x, z){
  /* 「空桌面」按杯子当前归属的 home 判断：把 A 杯放到 B 的桌位后，
     A 的 home 会改成那张桌子（见 putDownCup），于是 B 不会再叠上去。 */
  const occupied = cups
    .filter(c => c !== heldCup && c.userData.cup && c.userData.cup.mode === 'desk')
    .map(c => c.userData.cup.home);

  let best = null;
  let bestD = PUT_DOWN_RANGE;
  for (const h of deskHomes){
    if (occupied.some(p => p.distanceToSquared(h) < 1e-4)) continue;
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < bestD){ bestD = d; best = h; }
  }
  return best;
}

/**
 * 捡起水杯：把杯子从桌面移到手上，之后每帧跟随视角。
 * @param {THREE.Mesh} cup
 * @returns {boolean} 是否真的拿起来了
 */
export function pickUpCup(cup){
  if (!cup || !cup.userData.cup || heldCup) return false;
  if (!canUseCup()) return false;
  const data = cup.userData.cup;
  if (data.mode === 'flying' || data.mode === 'held') return false;

  heldCup = cup;
  data.mode = 'held';
  data.drinkT = 0;
  removeInteractable(cup);

  /* 用 attach 而不是 add：杯子原本挂在课桌 Group 下，
     attach 会保留世界变换，拿起来的第一帧不会闪一下 */
  scene.attach(cup);
  cup.scale.setScalar(HELD_SCALE);
  cup.renderOrder = 999;
  setHeldMaterial(data, true);
  updateHeldCup(0);

  audio.beep(520, 0.07, 0.04);
  setTimeout(() => audio.beep(660, 0.06, 0.035), 90);
  toast('\u{1F964} 你拿起了水杯：左键投掷 · 右键喝水 · 按住 E 放回桌面。', 3000);
  return true;
}

/** 把手里的杯子放回最近的空桌面。 */
export function putDownCup(){
  if (!heldCup || !canUseCup()) return false;
  const home = nearestFreeHome(state.pos.x, state.pos.z);
  if (!home){
    toast('这里离桌面太远了，走回桌边再放下水杯。', 1800);
    return false;
  }

  const cup = heldCup;
  const data = cup.userData.cup;
  heldCup = null;

  scene.attach(cup);
  cup.position.copy(home);
  cup.rotation.set(0, 0, 0);
  cup.scale.setScalar(1);
  cup.renderOrder = 0;
  setHeldMaterial(data, false);
  data.mode = 'desk';
  data.home.copy(home);
  data.vel.set(0, 0, 0);
  data.bounces = 0;
  data.drinkT = 0;
  data.hitCooldown = 0;
  data.airT = 0;
  addInteractable(cup);

  audio.beep(380, 0.07, 0.035);
  toast('\u{1F964} 水杯放回桌面了。', 1400);
  return true;
}

/** 左键投掷：以准星方向出手，之后交给 updateCup() 的物理。 */
export function throwCup(){
  if (!heldCup || !canUseCup()) return false;
  const cup = heldCup;
  const data = cup.userData.cup;
  heldCup = null;

  camera.getWorldDirection(_dir);
  scene.attach(cup);
  cup.position.addScaledVector(_dir, 0.10);
  cup.rotation.set(0, 0, 0);
  cup.scale.setScalar(1);
  cup.renderOrder = 0;
  setHeldMaterial(data, false);

  data.mode = 'flying';
  data.bounces = 0;
  data.hitCooldown = 0;
  data.lastHit = '';
  data.drinkT = 0;
  data.airT = 0;
  /* +0.6 的向上补偿：抵消一部分重力下坠，让准星大致等于落点 */
  data.vel.set(
    _dir.x * THROW_SPEED,
    _dir.y * THROW_SPEED + 0.6,
    _dir.z * THROW_SPEED
  );

  recordEvent('cup-throw', '扔出了水杯');
  audio.beep(720, 0.08, 0.04, 'triangle');
  setTimeout(() => audio.beep(480, 0.1, 0.03, 'triangle'), 80);
  toast('\u{1F964} 水杯脱手飞出……', 1200);
  return true;
}

/**
 * 右键喝水：次数进统计；超过阈值会在结算时开出彩蛋结局。
 * 喝的时候杯子会朝嘴边倾一下（只是视觉，不影响物理）。
 */
export function drinkFromCup(){
  if (!canUseCup()) return false;
  if (!heldCup){
    toast('先按住 E 捡起桌上的水杯，再喝水。', 1600);
    return false;
  }
  const now = performance.now();
  if (now < nextDrinkAt) return false;
  nextDrinkAt = now + DRINK_COOLDOWN_MS;

  heldCup.userData.cup.drinkT = DRINK_ANIM_SECONDS;
  bump('drinkWater');
  recordEvent('drink', '喝了一杯水');

  audio.beep(520, 0.08, 0.05);
  setTimeout(() => audio.beep(420, 0.1, 0.04), 110);
  toast('\u{1F964} 你喝了一口水，感觉清醒了一些。', 1600);
  /* 边缘亮蓝光 + 喝水次数短暂上岛（2.6s 后自动收起） */
  flashDrink(stats.drinkWater);

  /* 只在水数正好到阈值时提示一次；阈值本体在结局文件里，
     cup.js 不另存一个数字，避免两边改漏一边。 */
  if (stats.drinkWater === WATER_EGG_DRINKS){
    recordEvent('water-egg', '喝水量达到了一个危险的数字');
    toast('\u{1F964} 你好像……喝得有点太多了。', 2600);
  }
  return true;
}

/* =========================================================
   持杯与物理
   ========================================================= */

function updateHeldCup(dt){
  if (!heldCup) return;
  const data = heldCup.userData.cup;

  /* 跟随视角：相机局部坐标 → 世界坐标。杯子不挂在相机下面，
     所以不需要把 camera 加进 scene（少一处渲染图改动）。 */
  _hand.copy(HAND_POS).applyQuaternion(camera.quaternion).add(camera.position);
  heldCup.position.copy(_hand);
  heldCup.quaternion.copy(camera.quaternion);
  heldCup.rotateZ(-0.12);

  if (data.drinkT > 0){
    data.drinkT = Math.max(0, data.drinkT - dt);
    const p = 1 - data.drinkT / DRINK_ANIM_SECONDS;
    const tilt = Math.sin(Math.min(1, p) * Math.PI) * 1.15;
    heldCup.rotateX(tilt);
  }
}

function findEntityHit(a, b, data){
  let best = null;

  const test = (key, kind, index, x, z, yMin, yMax, radius) => {
    if (data.hitCooldown > 0 && data.lastHit === key) return;
    const hit = segmentHitsCylinder(a, b, x, z, radius + CUP_RADIUS, yMin, yMax);
    if (hit && (!best || hit.t < best.t)){
      best = { ...hit, key, kind, index };
    }
  };

  if (teacher && !teacher.userData.leaving){
    test('teacher', 'teacher', -1,
      teacher.group.position.x, teacher.group.position.z, 0.15, 1.85, 0.36);
  }
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];
    test('npc:' + i, 'npc', i,
      n.group.position.x, n.group.position.z, 0.15, 1.8, 0.34);
  }
  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;
    test('guard:' + i, 'guard', i,
      g.group.position.x, g.group.position.z, 0.1, 1.95, 0.38);
  }
  return best;
}

function restCup(cup, data){
  data.mode = 'rest';
  data.vel.set(0, 0, 0);
  data.bounces = 0;
  data.airT = 0;
  cup.position.y = CUP_RADIUS;
  /* 躺平：绕 X 轴转 90°，看起来像掉在地上的杯子 */
  cup.rotation.set(Math.PI / 2, Math.random() * Math.PI * 2, 0);
  addInteractable(cup);
  audio.beep(220 + Math.random() * 80, 0.06, 0.03, 'triangle');
}

function resolveRoom(cup, data, pos){
  /* 地面：速度还大就弹一下，弹到第三次或速度很小就躺下 */
  if (pos.y < CUP_RADIUS){
    pos.y = CUP_RADIUS;
    const vy = Math.abs(data.vel.y);
    const speed = Math.hypot(data.vel.x, data.vel.z);
    if ((vy > 0.9 || speed > 1.2) && data.bounces < 5){
      data.vel.y = vy * FLOOR_RESTITUTION;
      data.vel.x *= 0.72;
      data.vel.z *= 0.72;
      data.bounces++;
      audio.beep(240 + Math.random() * 90, 0.05, 0.03, 'triangle');
    } else {
      cup.position.copy(pos);
      restCup(cup, data);
      return;
    }
  }

  /* 天花板 */
  if (pos.y > ROOM_H - CUP_RADIUS){
    pos.y = ROOM_H - CUP_RADIUS;
    data.vel.y = -Math.abs(data.vel.y) * CUP_RESTITUTION;
  }

  /* 四面墙 */
  if (pos.x < -ROOM_HALF_W){
    pos.x = -ROOM_HALF_W;
    data.vel.x = Math.abs(data.vel.x) * CUP_RESTITUTION;
  } else if (pos.x > ROOM_HALF_W){
    pos.x = ROOM_HALF_W;
    data.vel.x = -Math.abs(data.vel.x) * CUP_RESTITUTION;
  }
  if (pos.z < -ROOM_HALF_D){
    pos.z = -ROOM_HALF_D;
    data.vel.z = Math.abs(data.vel.z) * CUP_RESTITUTION;
  } else if (pos.z > ROOM_HALF_D){
    pos.z = ROOM_HALF_D;
    data.vel.z = -Math.abs(data.vel.z) * CUP_RESTITUTION;
  }

  /* 课桌 / 饮水机的侧面：只在低于桌面时拦。
     用 2D AABB 的穿透深度选最小的那个轴推出去，避免卡在角上抖。 */
  if (pos.y <= DESK_BLOCK_TOP){
    for (const o of obstacles){
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const ox = o.hw + CUP_RADIUS - Math.abs(dx);
      const oz = o.hd + CUP_RADIUS - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      if (ox < oz){
        const s = dx >= 0 ? 1 : -1;
        pos.x = o.x + s * (o.hw + CUP_RADIUS);
        data.vel.x = -data.vel.x * CUP_RESTITUTION;
      } else {
        const s = dz >= 0 ? 1 : -1;
        pos.z = o.z + s * (o.hd + CUP_RADIUS);
        data.vel.z = -data.vel.z * CUP_RESTITUTION;
      }
    }
  }

  cup.position.copy(pos);
}

function updateFlying(cup, data, dt){
  data.hitCooldown = Math.max(0, data.hitCooldown - dt);
  data.airT += dt;
  if (data.airT > MAX_FLIGHT_SECONDS){
    cup.position.y = CUP_RADIUS;
    restCup(cup, data);
    return;
  }
  _prev.copy(cup.position);
  data.vel.y -= CUP_GRAVITY * dt;
  _next.copy(cup.position).addScaledVector(data.vel, dt);

  const hit = findEntityHit(_prev, _next, data);
  if (hit){
    const bounce = reflectVelocity(data.vel, hit.nx, 0, hit.nz, CUP_RESTITUTION);
    data.vel.set(bounce.x, bounce.y, bounce.z);
    /* 放到碰撞体表面外侧，下一帧才不会又从里面穿出去 */
    cup.position.set(
      hit.x + hit.nx * (CUP_RADIUS + 0.015),
      hit.y,
      hit.z + hit.nz * (CUP_RADIUS + 0.015)
    );
    data.lastHit = hit.key;
    data.hitCooldown = HIT_COOLDOWN;

    if (hit.kind === 'teacher'){
      knockDownTeacher('cup');
    } else if (hit.kind === 'npc'){
      cupHitNPC(hit.index);
    } else {
      audio.beep(180, 0.05, 0.03, 'square');
    }
    return;
  }

  /* 飞行时让杯子翻个身，比直挺挺平移自然 */
  cup.rotation.x += dt * 7;
  cup.rotation.z += dt * 4;
  resolveRoom(cup, data, _next);
}

/**
 * 主循环每帧调用：推进持杯跟随与所有飞行中的杯子。
 * @param {number} dt 秒
 */
export function updateCup(dt){
  if (!canUseCup()) return;
  if (heldCup) updateHeldCup(dt);
  for (const cup of cups){
    const data = cup.userData.cup;
    if (data && data.mode === 'flying') updateFlying(cup, data, dt);
  }
}
