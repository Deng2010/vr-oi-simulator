'use strict';
/* =========================================================
   通用评分器
   基于三个维度：
     - 关键字密度（0~40 分）
     - 代码长度（0~30 分）
     - 结构完整度（0~30 分）
   叠加确定性抖动（±10），映射到 10 个测试点
   ========================================================= */

function judgeUnified(code, prob, keywords){
  /* ---------- 剥离注释与字符串 ---------- */
  const src = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");

  /* ---------- CE 判定 ---------- */
  if (!/\bmain\s*\(/.test(src) || src.length < 40){
    return {
      status: 'CE', score: 0,
      cases: Array.from({ length: 10 }, (_, i) => ({
        id: i + 1, status: 'CE', time: '-'
      }))
    };
  }

  /* ---------- 1. 关键字密度（0~40） ---------- */
  const lower = src.toLowerCase();
  let hits = 0;
  for (let i = 0; i < keywords.length; i++){
    const kwLower = keywords[i].toLowerCase();
    const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('\\b' + escaped + '\\b').test(lower)) hits++;
  }
  const kwScore = Math.min(40, hits * 2);   // 命中 20 个即满分

  /* ---------- 2. 代码长度（0~30） ---------- */
  const lines = code.split('\n').length;
  const lenScore = Math.max(0, Math.min(30, (lines - 5) / 100 * 30));

  /* ---------- 3. 结构完整度（0~30） ---------- */
  let structScore = 0;
  if (/int\s+main\s*\(/.test(src))                    structScore += 8;
  if (/(cin\s*>>|scanf\s*\()/.test(src))              structScore += 8;
  if (/(cout\s*<<|printf\s*\()/.test(src))            structScore += 7;
  if (/return\s+0\s*;/.test(src))                     structScore += 7;

  let baseScore = kwScore + lenScore + structScore;   // 0 ~ 100

  /* ---------- 4. 确定性抖动 ±10 ---------- */
  const rng = mulberry32(hashStr(code + '|' + prob.id));
  baseScore += (rng() - 0.5) * 20;
  baseScore = Math.max(0, Math.min(100, baseScore));

  /* ---------- 5. 映射到 10 个测试点 ---------- */
  const passed = Math.round(baseScore / 10);
  const cases = [];
  for (let i = 0; i < 10; i++){
    let st;
    if (i < passed){
      st = 'AC';
    } else {
      const r = rng();
      if (r < 0.30)      st = 'WA';
      else if (r < 0.55) st = 'TLE';
      else if (r < 0.75) st = 'RE';
      else               st = 'WA';
    }
    cases.push({
      id: i + 1, status: st,
      time: st === 'TLE' ? '>3.0s' : (rng() * 0.8 + 0.01).toFixed(3) + 's'
    });
  }

  const score  = passed * 10;
  const status = passed === 10 ? 'AC' : (passed > 0 ? 'PART' : 'WA');
  return { status, score, cases, passed };
}

/* ---------- 辅助函数（与主脚本兼容） ---------- */
function hashStr(s){
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}