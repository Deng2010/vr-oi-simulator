/* =========================================================
   走廊过场
   由 index.html 内联脚本第 2047-2114 行拆出。
   ========================================================= */
import { setLookTarget } from '../core/settings.js';
import { state } from '../core/state.js';
import { $ } from '../core/util.js';
import { unlockAch } from '../ui/achievements.js';
import { corrBar, corridorUI, crosshair, promptEl } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { bump, recordEvent } from './stats.js';

export let corridorPhase = 'toilet';

export let corridorProgress = 0;

export let corridorDone = false;

/* 走廊走完后的去向。这里只登记意图，由主循环调用 takePendingArrival()
   并决定切到洗手间还是回到座位 —— 这样 corridor / bathroom 两个
   过场模块之间不需要互相 import（否则会形成循环依赖）。 */
let pendingArrival = null;

export function takePendingArrival(){
  const v = pendingArrival;
  pendingArrival = null;
  return v;
}

export function enterCorridor(phase){
  state.view = 'corridor';
  state.keys = {};
  corridorPhase = phase;
  corridorProgress = 0;
  corridorDone = false;
  corridorUI.classList.remove('hidden');
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');

  const stepEl = $('corrStep'), hintEl = $('corrHint'), labelEl = $('corrDoorLabel');
  if (phase === 'toilet'){
    stepEl.textContent = '沿着走廊走向洗手间……';
    hintEl.textContent = '按住 W 前进';
    labelEl.textContent = '洗手间';
  } else {
    stepEl.textContent = '沿着走廊走回考场……';
    hintEl.textContent = '按住 W 前进';
    labelEl.textContent = '考场';
  }
  updateCorridorUI();
}

export function updateCorridorUI(){
  const p = corridorProgress;
  const scale = 0.55 + p * 1.5;
  const vanEl = $('corrVanish');
  if (vanEl) vanEl.style.transform = `translate(-50%,-50%) scale(${scale})`;
  if (corrBar) corrBar.style.width = (p * 100) + '%';
}

export function updateCorridor(realDt){
  if (corridorDone) return;
  if (state.keys['w']) corridorProgress += realDt * 0.32;
  if (corridorProgress >= 1){
    corridorProgress = 1;
    corridorDone = true;
    updateCorridorUI();
    setTimeout(() => {
      corridorUI.classList.add('hidden');
      if (corridorPhase === 'toilet'){
        pendingArrival = 'toilet';
      } else {
        state.view = 'world';
        state.keys = {};
        crosshair.classList.remove('hidden');
        state.pos.set(0, 1.65, -2.08);
        state.yaw = 0; state.pitch = 0;
        setLookTarget(0, 0);
        state.bathroomApproved = false;
        state.wanderTimer = 0;
        state.teacherWarnActive = false;
        toast('你回到了座位上，继续答题。', 2000);
        /* 走到这里才是完整的一趟（走廊 → 洗手间 → 走廊 → 座位）：
           按 E 离开考场、走进洗手间又折返，中间任何一步都不会记 */
        bump('bathroomTrips');
        recordEvent('bathroom', '完整地去了一趟洗手间');
        unlockAch('explorer');
      }
    }, 500);
    return;
  }
  updateCorridorUI();
}
