/* =========================================================
   事件绑定：键盘、鼠标、滑条、按钮
   由 index.html 内联脚本第 2885-3087 行拆出。
   ========================================================= */
import { audio } from '../audio/audio.js';
import { requestRedraw } from './loop.js';
import { saveViewSettings, scheduleSaveViewSettings, setLookTarget, setSmoothAmount, setTimeScale, setTurnSpeed, sliderToTurn } from './settings.js';
import { state } from './state.js';
import { $ } from './util.js';
import { getLoadedProblem } from '../data/problems/index.js';
import { STARTER_TEMPLATE } from '../data/problems/template.js';
import { clock, renderer, resizeViewport } from '../render/gfx.js';
import { BATHROOM_STEPS, bathroomStepIdx, finishBathroom } from '../systems/bathroom.js';
import { doInteract } from '../systems/interaction.js';
import { closeNPCComputer } from '../systems/npc.js';
import { KEYMAP } from '../systems/player.js';
import { clearSave, persistSave, tryLoadSave } from '../systems/save.js';
import { callTeacher, closeTeacherDialog } from '../systems/teacher.js';
import { codeArea, crosshair, hud, minimapWrap, pauseMenu } from '../ui/dom.js';
import { codeHighlight, saveCode, scheduleHighlight } from '../ui/editor.js';
import { endContest } from '../ui/ending.js';
import { closeCode, closePauseMenu, openPauseMenu } from '../ui/panels.js';
import { closePaper } from '../ui/paper.js';
import { syncViewUI } from '../ui/settings-panel.js';
import { toast } from '../ui/toast.js';
import { submitCode } from '../ui/verdict.js';

export function bindEvents(){
  renderer.domElement.addEventListener('click', () => { doInteract('e'); });

  document.addEventListener('keydown', e => {
    /* 走廊 */
    if (state.view === 'corridor'){
      if (e.code === 'KeyW' || e.code === 'ArrowUp'){
        state.keys['w'] = true; e.preventDefault();
      }
      return;
    }
    /* 洗手间 */
    if (state.view === 'bathroom'){
      if (e.code === 'KeyW'){ state.keys['w'] = true; e.preventDefault(); }
      if (e.code === 'Space'){ state.keys['space'] = true; e.preventDefault(); }
      const step = BATHROOM_STEPS[bathroomStepIdx];
      if (step && step.key === 'e' && e.code === 'KeyE'){
        finishBathroom(); e.preventDefault();
      }
      return;
    }
    /* NPC 电脑 */
    if (state.view === 'npcComputer'){
      if (e.code === 'Escape' || e.code === 'KeyE'){
        closeNPCComputer(); e.preventDefault();
      }
      return;
    }
    /* Esc 关闭面板 */
    if (e.code === 'Escape'){
      if (state.view === 'pause'){ closePauseMenu(); return; }
      if (state.view === 'code'){ closeCode(); return; }
      if (state.view === 'paper'){ closePaper(); return; }
      if (state.view === 'dialog'){ closeTeacherDialog(); return; }
      if (state.view === 'world' && state.started && !state.ended){ openPauseMenu(); return; }
      return;
    }
    if (state.view !== 'world') return;

    const k = KEYMAP[e.code];
    if (k){
      state.keys[k] = true;
      if (k.startsWith('look') || 'wasd'.includes(k)) e.preventDefault();
    }
    if (e.code === 'KeyE'){ doInteract('e'); }
    if (e.code === 'KeyF'){ doInteract('f'); }
    if (e.code === 'Space'){ doInteract('space'); e.preventDefault(); }
    if (e.code === 'KeyH') callTeacher();
  });

  document.addEventListener('keyup', e => {
    if (state.view === 'corridor'){
      if (e.code === 'KeyW' || e.code === 'ArrowUp') state.keys['w'] = false;
      return;
    }
    if (state.view === 'bathroom'){
      if (e.code === 'KeyW') state.keys['w'] = false;
      if (e.code === 'Space') state.keys['space'] = false;
      return;
    }
    const k = KEYMAP[e.code];
    if (k) state.keys[k] = false;
  });

  window.addEventListener('blur', () => { state.keys = {}; });

  /* resize 防抖：拖窗口时避免反复重建 drawing buffer */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeViewport();
      requestRedraw();
    }, 150);
  });

  /* 滑条 */
  function bindSlider(id, apply){
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      apply(parseFloat(el.value));
      scheduleSaveViewSettings();
      syncViewUI();
    });
  }
  bindSlider('turnSliderStart',   v => setTurnSpeed(sliderToTurn(v)));
  bindSlider('turnSlider',        v => setTurnSpeed(sliderToTurn(v)));
  bindSlider('smoothSliderStart', v => setSmoothAmount(v / 100));
  bindSlider('smoothSlider',      v => setSmoothAmount(v / 100));
  bindSlider('timeSliderStart',   v => setTimeScale(v));
  bindSlider('timeSlider',        v => setTimeScale(v));
  bindSlider('volSliderStart',    v => audio.setVolume(v / 100));
  bindSlider('volSlider',         v => audio.setVolume(v / 100));

  /* 静音开关 */
  const mt = $('muteToggle');
  if (mt){
    mt.classList.toggle('on', !audio.muted);
    mt.onclick = () => {
      audio.setMuted(!audio.muted);
      mt.classList.toggle('on', !audio.muted);
      saveViewSettings();
    };
  }

  /* 暂停菜单按钮 */
  $('btnResume').onclick = closePauseMenu;
  $('btnPauseEnd').onclick = () => {
    if (confirm('确定要提前交卷离场吗？')){
      pauseMenu.classList.add('hidden');
      endContest(true);
    }
  };
  $('btnSave').onclick = () => { persistSave(); toast('进度已保存', 1200); };
  $('btnClearSave').onclick = () => { clearSave(); toast('存档已清除', 1200); };

  $('btnSettings').onclick = openPauseMenu;
  $('btnCloseNPCComp').onclick = closeNPCComputer;

  /* 代码编辑器 */
  codeArea.addEventListener('input', () => {
    saveCode();
    scheduleHighlight();
    if (Math.random() < 0.7) audio.key();
  });
  codeArea.addEventListener('keydown', e => {
    if (e.code === 'Tab'){
      e.preventDefault();
      const s = codeArea.selectionStart, en = codeArea.selectionEnd;
      codeArea.value = codeArea.value.substring(0, s) + '    ' +
                       codeArea.value.substring(en);
      codeArea.selectionStart = codeArea.selectionEnd = s + 4;
      saveCode();
      scheduleHighlight();
    }
    if (e.code !== 'Escape') e.stopPropagation();
  });
  codeArea.addEventListener('scroll', () => {
    codeHighlight.scrollTop = codeArea.scrollTop;
    codeHighlight.scrollLeft = codeArea.scrollLeft;
  });
  codeArea.addEventListener('keyup', e => {
    if (e.code !== 'Escape') e.stopPropagation();
  });
  codeArea.addEventListener('click', updateCursorInfo);
  codeArea.addEventListener('keyup', updateCursorInfo);

  function updateCursorInfo(){
    const v = codeArea.value.substring(0, codeArea.selectionStart);
    const lines = v.split('\n');
    $('cursorInfo').textContent =
      `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}  ·  C++14  ·  g++ -O2`;
  }

  $('btnSubmit').onclick = submitCode;
  $('btnLeave').onclick = closeCode;
  $('btnReset').onclick = () => {
    if (!confirm('确定要重置本题代码吗？')) return;
    /* 所有题目共用同一份起手模板；万一题面还在懒加载，用模板兜底即可。 */
    const p = getLoadedProblem(state.curProb);
    const starter = p ? p.starter : STARTER_TEMPLATE;
    codeArea.value = starter;
    state.code[state.curProb] = starter;
    scheduleHighlight();
  };
  $('btnEnd').onclick = () => {
    if (state.ended) return;
    if (confirm('确定要提前交卷离场吗？')) endContest(true);
  };
  $('btnRestart').onclick = () => {
    clearSave();
    location.reload();
  };

  $('btnClearSaveStart').onclick = () => {
    if (confirm('确定要清空存档吗？已保存的代码和进度都会丢失。')){
      clearSave();
      toast('存档已清除', 1500);
    }
  };

  $('btnStart').onclick = () => {
    audio.init();
    audio.setVolume(audio.volume);
    $('start').classList.add('hidden');
    hud.classList.remove('hidden');
    minimapWrap.classList.remove('hidden');
    crosshair.classList.remove('hidden');
    state.started = true;
    state.startTime = performance.now();
    setLookTarget(state.yaw, state.pitch);
    clock.getDelta();
    toast('比赛开始！方向键转身，WASD 移动，E 交互。', 2600);
    /* 尝试恢复存档 */
    if (tryLoadSave()) toast('已恢复上次的答题进度。', 2200);
  };
}
