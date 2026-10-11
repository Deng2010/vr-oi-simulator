/* =========================================================
   双层评测器（pretest / system test）
   ---------------------------------------------------------
   赛中点「提交」跑的是 pretest：10 个测试点，本地即时出分，
   玩家看到的只是**预测试**成绩。
   赛后（交卷/时间到）跑 system test：20 个测试点，分数作为最终成绩。

   system test 不是另掷一次骰子，而是在 pretest 的分数上叠一层
   **确定性漂移**（pretest 数据弱、整体偏乐观，所以平均略低），
   这样两阶段分数相关但不相等 —— 预测试满分不等于最终满分，
   和真实 OI 里「弱预测试放过 hack 数据」的手感一致。

   基础分三个维度（0~100）：关键字密度 40 / 代码长度 30 / 结构完整度 30。
   确定性来源是 hashStr + mulberry32，改动它们会改变历史分数，
   因此实现统一收敛到 src/core/rng.js，不允许再出现第二份副本。

   两条反灌水规则（都是被实测漏洞逼出来的）：
   1. 长度分只数**有效代码行**（剥离注释与字符串后的非空行）。
      旧版数原始行数，于是「1 行代码 + 150 行注释」能白拿满长度分。
   2. 关键字分乘一个规模因子。旧版只判「关键字是否出现过」，
      于是 `int dp,dfs,lca,dijkstra,INF,mod;` 这种一行声明就能刷满。
   ========================================================= */
import { hashStr, mulberry32 } from '../core/rng.js';

/* 预测试 / 系统测试的测试点数。每题 100 分，按点数均分 */
export const PRETEST_CASES = 10;
export const SYSTEM_CASES  = 20;

/* =========================================================
   代码预处理
   ========================================================= */

/* 剥离注释与字符串字面量（一次遍历搞定）。
   字符串只留占位符：里面的 "int main()" 不算代码，
   但也不能让 `cout<<"` 把后面的代码一起吞掉。 */
export function stripCode(code){
  return code.replace(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g,
    m => {
      const c = m.charCodeAt(0);
      if (c === 47) return '';                        // '/' → 注释，删除
      return c === 34 ? '""' : "''";                  // '"' 或 "'" → 保留占位
    }
  );
}

/* 有效代码行：剥离注释后的非空行。
   为什么不数「原始行数」：注释一加就能把长度分刷满，
   而这个分本来是奖励「你确实写了这么多代码」的。 */
export function effectiveLines(src){
  let n = 0;
  for (const line of src.split('\n')){
    if (line.trim()) n++;
  }
  return n;
}

/* =========================================================
   关键字 / 特征片段匹配
   ========================================================= */

/* 用 WeakMap 按关键字数组本身缓存正则：这些数组都是模块级常量
   （KEYWORDS_LIST 与每题 manifest.keywords），引用即身份，
   比原先「拿上一次的数组比引用」在换题时更稳，也顺手支持了多套词表。 */
const _kwCache = new WeakMap();

function escapeRe(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordRegexes(keywords){
  let cached = _kwCache.get(keywords);
  if (cached) return cached;
  cached = keywords.map(kw => new RegExp('\\b' + escapeRe(String(kw).toLowerCase()) + '\\b'));
  _kwCache.set(keywords, cached);
  return cached;
}

function countHits(regexes, lower){
  let hits = 0;
  for (let i = 0; i < regexes.length; i++){
    if (regexes[i].test(lower)) hits++;
  }
  return hits;
}

/* 题目特征片段（如 'sort('、'priority_queue'、'%'）按子串匹配：
   它们可能带符号，走词边界 \b 会匹配不到。 */
function probProfile(prob){
  return {
    keywords: (prob && Array.isArray(prob.keywords)) ? prob.keywords : null,
    hints:    (prob && Array.isArray(prob.hints))    ? prob.hints    : []
  };
}

/* =========================================================
   基础分：客观地看这份代码「像不像认真写的」
   ========================================================= */

/* CE 判定（与旧版一致：没有 main，或剥离注释后不足 40 字符） */
export function isCompileError(src){
  return !/\bint\s+main\s*\(/.test(src) || src.length < 40;
}

/**
 * @param {string} code 玩家代码
 * @param {object} prob 题目元数据（manifest 条目，可带 keywords / hints）
 * @param {string[]} keywords 全局关键字表
 * @returns {{ce: boolean, kw: number, len: number, struct: number, base: number, lines: number}}
 */
export function baseScoreOf(code, prob, keywords){
  const src = stripCode(code);
  if (isCompileError(src)) return { ce: true, kw: 0, len: 0, struct: 0, base: 0, lines: 0 };

  const lower = src.toLowerCase();
  const lines = effectiveLines(src);

  /* ---------- 1. 关键字密度（0~40） ---------- */
  const profile = probProfile(prob);
  const globalHits = countHits(keywordRegexes(keywords), lower);

  let kwRaw;
  if (profile.keywords){
    /* 有题目档案：题目特征词 3 个即满（每个 7 分），
       特征片段 2 个即满（每个 6 分），再叠通用关键字兜底。 */
    const probHits = countHits(keywordRegexes(profile.keywords), lower);
    let hintHits = 0;
    for (const h of profile.hints){
      if (lower.includes(String(h).toLowerCase())) hintHits++;
    }
    kwRaw = Math.min(20, probHits * 7) + Math.min(12, hintHits * 6) +
            Math.min(16, globalHits);
  } else {
    /* 兜底（题目没配特征词，或测试直接传一份关键字表）：沿用旧口径 */
    kwRaw = Math.min(40, globalHits * 2);
  }

  /* 规模因子：一行里塞满关键字不等于会写算法。
     下限 0.35 是为了不惩罚真正写得短的解。 */
  const scale = Math.min(1, Math.max(0.35, lines / 8));
  const kw = Math.min(40, kwRaw * scale);

  /* ---------- 2. 代码长度（0~30）：只数有效行 ---------- */
  const len = Math.max(0, Math.min(30, (lines - 5) / 100 * 30));

  /* ---------- 3. 结构完整度（0~30） ---------- */
  let struct = 0;
  if (/\bint\s+main\s*\(/.test(src))            struct += 5;
  if (/return\s+0\s*;/.test(src))               struct += 5;
  if (/(cin\s*>>|scanf\s*\()/.test(src))        struct += 7;
  if (/(cout\s*<<|printf\s*\()/.test(src))      struct += 7;
  /* 光有 main 外壳拿不到这 6 分：得有循环，或者自己写了函数。
     先剔除 main 是为了不让 `int main(){` 自己被当成自定义函数。 */
  const noMain = src.replace(/\bint\s+main\s*\(/, '');
  if (/(for|while|do)\s*\(/.test(src) || /\w+\s+\w+\s*\([^;{]*\)\s*\{/.test(noMain)){
    struct += 6;
  }

  return { ce: false, kw, len, struct, base: kw + len + struct, lines };
}

/* =========================================================
   抖动与测试点映射
   ========================================================= */

function clamp0to100(v){
  return Math.max(0, Math.min(100, v));
}

/* 失败点的状态分布：WA 偏多，然后 TLE / RE。
   固定权重而不是等概率，是为了让「错误类型」看起来像真的评测。 */
function failStatus(r){
  if (r < 0.55) return 'WA';
  if (r < 0.80) return 'TLE';
  return 'RE';
}

function buildCases(passed, total, rng){
  const perPoint = 100 / total;
  const cases = [];
  for (let i = 0; i < total; i++){
    let st;
    if (i < passed){
      st = 'AC';
    } else {
      st = failStatus(rng());
    }
    cases.push({
      id: i + 1, status: st,
      time: st === 'TLE' ? '>3.0s' : (rng() * 0.8 + 0.01).toFixed(3) + 's'
    });
  }
  const score = Math.round(passed * perPoint);
  const status = passed === total ? 'AC' : (passed > 0 ? 'PART' : 'WA');
  return { status, score, cases, passed, total };
}

function ceResult(total){
  return {
    status: 'CE', score: 0,
    cases: Array.from({ length: total }, (_, i) => ({
      id: i + 1, status: 'CE', time: '-'
    })),
    passed: 0, total
  };
}

/**
 * 双层评测统一入口。
 * @param {string} code 玩家代码
 * @param {object} prob 题目元数据
 * @param {string[]} keywords 全局关键字表
 * @param {'pretest'|'system'} phase 阶段：pretest 用于赛中，system 用于赛后
 */
export function judgeUnified(code, prob, keywords, phase = 'pretest'){
  const sys = phase === 'system';
  const total = sys ? SYSTEM_CASES : PRETEST_CASES;
  const base = baseScoreOf(code, prob, keywords);
  if (base.ce) return ceResult(total);

  const seedBase = code + '|' + prob.id;

  /* pretest：基础分叠加 ±10 抖动 */
  const rngPre = mulberry32(hashStr(seedBase + '|pretest'));
  const preBase = clamp0to100(base.base + (rngPre() - 0.5) * 20);
  const prePassed = Math.round(preBase / (100 / PRETEST_CASES));

  if (!sys){
    return buildCases(prePassed, PRETEST_CASES, rngPre);
  }

  /* system test：在 pretest 分数上叠确定性漂移，不另掷骰子 ——
     两阶段必须相关，否则「预测试」就没有参考意义了。
     roll 是主漂移（0 ~ -8 分，预测试数据弱所以整体偏乐观）；
     约 1/5 的代码反而被系统测试抬一下（说明预测试卡得过严）；
     约 1/16 的概率掉一个毒瘤数据点（额外 -5）。 */
  const rngSys = mulberry32(hashStr(seedBase + '|system'));
  const roll = rngSys();
  const luck = rngSys();
  const hack = rngSys();
  let drift = -roll * 8;
  if (luck < 0.21) drift += 4.5;
  if (hack > 0.94) drift -= 5;

  const sysBase = clamp0to100(preBase + drift);
  const sysPassed = Math.round(sysBase / (100 / SYSTEM_CASES));
  const res = buildCases(sysPassed, SYSTEM_CASES, rngSys);
  /* 记下来：结算界面要显示「预测试 90 → 系统测试 85」 */
  res.pretestScore = Math.round(prePassed * (100 / PRETEST_CASES));
  res.drift = res.score - res.pretestScore;
  return res;
}

/* 语义化别名：让调用点一眼看出自己在哪个阶段 */
export function judgePretest(code, prob, keywords){
  return judgeUnified(code, prob, keywords, 'pretest');
}

export function judgeSystem(code, prob, keywords){
  return judgeUnified(code, prob, keywords, 'system');
}
