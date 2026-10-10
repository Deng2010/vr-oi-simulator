/* =========================================================
   通用评分器（原 judge.js）
   三个维度：关键字密度（0~40）/ 代码长度（0~30）/ 结构完整度（0~30），
   叠加确定性抖动（±10）后映射到 10 个测试点。
   确定性来源是 hashStr + mulberry32，改动它们会改变历史分数，
   因此实现统一收敛到 src/core/rng.js，不允许再出现第二份副本。
   ========================================================= */
import { hashStr, mulberry32 } from '../core/rng.js';


/* ---------- 关键字正则缓存（模块级，一次构建多次复用） ---------- */
let _kwRegexes = null;
let _kwSource  = null;

function getKeywordRegexes(keywords){
  if (_kwSource === keywords && _kwRegexes) return _kwRegexes;
  _kwSource = keywords;
  _kwRegexes = keywords.map(kw =>
    new RegExp('\\b' + kw.toLowerCase() + '\\b')
  );
  return _kwRegexes;
}

export function judgeUnified(code, prob, keywords){
  /* ---------- 剥离注释与字符串（一次遍历搞定） ---------- */
  const src = code.replace(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g,
    m => {
      const c = m.charCodeAt(0);
      if (c === 47) return '';                        // '/' → 注释，删除
      return c === 34 ? '""' : "''";                  // '"' 或 "'" → 保留占位
    }
  );

  /* ---------- CE 判定 ---------- */
  if (!/\bint\s+main\s*\(/.test(src) || src.length < 40){
    return {
      status: 'CE', score: 0,
      cases: Array.from({ length: 10 }, (_, i) => ({
        id: i + 1, status: 'CE', time: '-'
      }))
    };
  }

  /* ---------- 1. 关键字密度（0~40） ---------- */
  const lower = src.toLowerCase();
  const regexes = getKeywordRegexes(keywords);
  let hits = 0;
  for (let i = 0; i < regexes.length; i++){
    if (regexes[i].test(lower)) hits++;
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
