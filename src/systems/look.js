/* =========================================================
   视角平滑（转向阻尼）
   由 index.html 内联脚本第 2620-2639 行拆出。
   ========================================================= */
import { pitchTarget, setPitchTarget, setYawTarget, smoothAmount, turnSpeed, yawTarget } from '../core/settings.js';
import { state } from '../core/state.js';
import { clamp } from '../core/util.js';

export function applyLook(dt){
  let kYaw = 0, kPitch = 0;
  if (state.keys['lookL']) kYaw += 1;
  if (state.keys['lookR']) kYaw -= 1;
  if (state.keys['lookU']) kPitch += 1;
  if (state.keys['lookD']) kPitch -= 1;
  if (kYaw)   setYawTarget(yawTarget + kYaw * turnSpeed * dt);
  if (kPitch) setPitchTarget(clamp(pitchTarget + kPitch * turnSpeed * 0.72 * dt, -1.35, 1.35));

  if (smoothAmount < 0.01){
    state.yaw = yawTarget;
    state.pitch = pitchTarget;
  } else {
    const tau = smoothAmount * 0.16;
    const k = 1 - Math.exp(-dt / Math.max(tau, 0.001));
    state.yaw   += (yawTarget   - state.yaw)   * k;
    state.pitch += (pitchTarget - state.pitch) * k;
  }
}
