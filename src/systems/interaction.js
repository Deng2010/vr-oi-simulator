/* =========================================================
   交互判定：准星射线拾取 + 距离判定，生成 E / F / 空格动作
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
import { promptEl } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { interactables, npcs, teacher } from '../world/entities.js';

export let actionE = null;       // E 键动作：交互（电脑/水杯/草稿纸/出口）

export let actionF = null;       // F 键动作：干扰同学

export let actionSpace = null;   // 空格键动作：打老师 / 打保安

export let lastInteractKey = '';

export function updateInteract(){
  actionE = null;
  actionF = null;
  actionSpace = null;
  promptEl.classList.add('hidden');

  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return;

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
        const txt = `[ F ] 干扰${ud.name}（他可能会报告老师）`;
        if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
        promptEl.classList.remove('hidden');
        return;
      } else if (ud.state === 'walking_away' || ud.state === 'away'){
        actionE = { fn: () => useNPCComputer(i) };
        const txt = `[ E ] 使用${ud.name}的电脑`;
        if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
        promptEl.classList.remove('hidden');
        return;
      }
    }
  }

  /* 出口 → E */
  const dDoor = Math.hypot(state.pos.x - 7.85, state.pos.z - 0);
  if (dDoor < 3.0){
    if (state.bathroomApproved){
      actionE = { fn: () => enterCorridor('toilet') };
      const txt = '[ E ] 离开考场去洗手间';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
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
    const txt = '[ E ] ' + it.label;
    if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    promptEl.classList.remove('hidden');
  }
}

export function doInteract(key){
  if (state.view !== 'world' || state.ended || state.frozen) return;
  if (key === 'e'     && actionE)     actionE.fn();
  if (key === 'f'     && actionF)     actionF.fn();
  if (key === 'space' && actionSpace) actionSpace.fn();
}

export function drinkWater(){
  audio.beep(520, 0.08, 0.05);
  setTimeout(() => audio.beep(420, 0.1, 0.04), 110);
  toast('\u{1F964} 你喝了一口水，感觉清醒了一些。', 1600);
}
