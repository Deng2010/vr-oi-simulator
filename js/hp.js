'use strict';
/* =========================================================
   hp —— 玩家血条（打倒监考后才显示）
   ---------------------------------------------------------
   - 默认隐藏；监考倒台一刻显示，并提醒"你现在有血条了"；
   - 被保安抓住扣 1 格，窗口闪红 + 左下角提示"你被命中了！"；
   - 扣到 0 走"被保安抓走"结局；
   - 玩家侧 1 秒受击无敌（PLAYER_HURT_INVULN）：任何保安都能动手，
     但玩家 1 秒内只会真的掉一格。
   ========================================================= */

const HP_MAX = 3;
const PLAYER_HURT_INVULN = 1000;   /* 玩家受击无敌：1 秒内无论几个保安都只掉一格 */

/* 纯函数：本次被抓是扣血还是致命 */
function guardHitResult(hpVisible, hp){
  if (!hpVisible || hp <= 0) return 'fatal';
  if (hp - 1 <= 0) return 'fatal';
  return 'damage';
}

/* 纯函数：此刻是否还在受击无敌期（时间基准为世界时钟，单位秒） */
function playerInvulnerable(now){
  return now - (state.lastDamageAt || 0) < PLAYER_HURT_INVULN / 1000;
}

function initHp(){
  state.hp = HP_MAX;
  state.hpVisible = false;
  renderHp();
}

/* 监考倒台：亮出血条 */
function revealHp(){
  if (state.hpVisible) return;
  state.hpVisible = true;
  state.hp = HP_MAX;
  renderHp();
  toast('你现在有血条了', 2600);
}

function renderHp(){
  const bar = $('hpBar');
  if (!bar) return;
  bar.classList.toggle('show', !!state.hpVisible);
  const cells = bar.children;
  for (let i = 0; i < cells.length; i++){
    cells[i].classList.toggle('on', i < state.hp);
  }
}

/* 被保安抓住：扣 1 格。返回是否还活着 */
function damagePlayer(g, now){
  const r = guardHitResult(state.hpVisible, state.hp);
  /* 命中反馈：窗口闪红 + 左下角提示（与出拳闪白是两回事） */
  if (redFlash){
    redFlash.style.opacity = '0.55';
    setTimeout(() => { redFlash.style.opacity = '0'; }, 200);
  }
  audio.beep(160, 0.22, 0.07, 'sawtooth');
  if (r === 'damage'){
    state.hp--;
    renderHp();
    toast('你被命中了！', 1500);
    /* 把动手的保安推开一点，给玩家喘息空间 */
    if (g){
      const dx = g.group.position.x - state.pos.x;
      const dz = g.group.position.z - state.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      g.group.position.x = state.pos.x + dx / len * 1.6;
      g.group.position.z = state.pos.z + dz / len * 1.6;
    }
    return true;
  }
  return false;   /* 血量耗尽 → 由调用方走结局 */
}
