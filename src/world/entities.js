/* =========================================================
   场景实体注册表（可交互物体 / NPC / 监考老师）
   由 index.html 内联脚本第 848-853 行拆出。
   ========================================================= */
export let interactables = [];

export let npcs = [], teacher = null;

/* teacher 会被 punchTeacher() 置空、被 buildWorld() 赋值，
   两处都在别的模块里，因此提供显式 setter。 */
export function setTeacher(t){ teacher = t; }

/* ---------- 保安 ----------
   注册表与存活查询放在实体层（而不是 systems/guards.js），
   这样 ui/ending.js 只依赖实体、systems/guards.js 依赖 endContest，
   依赖方向单一，不会形成循环 import。 */
export const securityGuards = [];

export function aliveGuardCount(){
  let n = 0;
  for (const g of securityGuards) if (g.userData.alive) n++;
  return n;
}

export function pruneDeadGuards(){
  for (let i = securityGuards.length - 1; i >= 0; i--){
    if (!securityGuards[i].userData.alive) securityGuards.splice(i, 1);
  }
}
