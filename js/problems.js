'use strict';
/* =========================================================
   题库逻辑：按 id 索引 / 每局随机抽 4 题
   题面与起始模板是静态数据，存放在 assets/problems/：
   - _pool.js       注册表 PROBLEM_DATA + STARTER_TEMPLATE（须最先加载）
   - <题目 id>.js   每题一个文件，格式为 PROBLEM_DATA.push({ ... })
   加题：在 assets/problems/ 新增文件，并在 index.html 中按其引入
   ========================================================= */

const PROBLEM_POOL = PROBLEM_DATA;

/* =========================================================
   按 id 索引：O(1) 查找（供 tryLoadSave / 未来功能使用）
   ========================================================= */
const PROBLEM_BY_ID = new Map(PROBLEM_POOL.map(p => [p.id, p]));

/* =========================================================
   抽题：从题库随机抽 4 道
   部分 Fisher-Yates 洗牌：只洗前 count 个，避免 splice 的 O(n) 挪动
   ========================================================= */
function pickProblems(){
	const pool = PROBLEM_POOL.slice();
	const count = Math.min(4, pool.length);
	for (let i = 0; i < count; i++){
		const j = i + Math.floor(Math.random() * (pool.length - i));
		const tmp = pool[i];
		pool[i] = pool[j];
		pool[j] = tmp;
	}
	return pool.slice(0, count);
}

