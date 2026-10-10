/* =========================================================
   第一人称移动与键盘映射
   由 index.html 内联脚本第 2641-2685 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { state } from '../core/state.js';
import { clamp } from '../core/util.js';
import { camera } from '../render/gfx.js';
import { collides } from '../world/obstacles.js';
import * as THREE from 'three';

export const KEYMAP = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  ArrowLeft: 'lookL', ArrowRight: 'lookR',
  ArrowUp: 'lookU', ArrowDown: 'lookD',
};

/* 复用的临时向量，避免每帧 new Vector3 触发 GC */

export const _fwd = new THREE.Vector3();

export const _right = new THREE.Vector3();

export const _move = new THREE.Vector3();

export function updatePlayer(dt){
  const sprinting = !!state.keys['shift'];
  const speed = sprinting ? 5.0 : 3.1;   // Shift 加速
  _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  _move.set(0, 0, 0);
  if (state.keys['w']) _move.add(_fwd);
  if (state.keys['s']) _move.sub(_fwd);
  if (state.keys['d']) _move.add(_right);
  if (state.keys['a']) _move.sub(_right);

  const moving = _move.lengthSq() > 0;
  if (moving){
    _move.normalize().multiplyScalar(speed * dt);
    const nx = clamp(state.pos.x + _move.x, -7.5, 7.5);
    const nz = clamp(state.pos.z + _move.z, -6.5, 6.5);
    /* 分轴滑动碰撞 */
    if (!collides(nx, state.pos.z, 0.28)) state.pos.x = nx;
    if (!collides(state.pos.x, nz, 0.28)) state.pos.z = nz;

    state.bob += dt * (sprinting ? 15 : 11);   // 疾走时脚步更急促
    if (Math.sin(state.bob) > 0.96 && Math.random() < 0.4) audio.step();
  } else {
    state.bob += dt * 1.2;
  }
  const bobY = moving ? Math.sin(state.bob) * 0.022 : Math.sin(state.bob) * 0.004;
  camera.position.set(state.pos.x, 1.65 + bobY, state.pos.z);
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
}
