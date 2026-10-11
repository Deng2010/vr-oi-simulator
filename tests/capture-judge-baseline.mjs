/* =========================================================
   评测基线重冻工具（评分行为**有意变更**之后才用）
   ---------------------------------------------------------
   用法：
     node tests/capture-judge-baseline.mjs

   产物：就地改写 tests/baseline.json 的 judgment / systemJudgment 两节；
         npc / pool 两节原样保留（那两节由 legacy 的 capture-baseline.mjs
         按 git rev 生成，与本工具无关）。

   为什么需要它：judgment 节是「行为快照」，保证的是**不再意外漂移**。
   评分规则一旦有意改动（本版：反灌水 + 题目差异化 + 双层评测），
   旧快照必然对不上，必须显式重冻，并在提交信息里写清为什么。
   真正的正确性判据在 tests/run.mjs 的「评测器语义判据」一节。
   ========================================================= */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYWORDS_LIST } from '../src/data/keywords.js';
import { PROBLEM_MANIFEST } from '../src/data/problems/manifest.js';
import { judgePretest, judgeSystem } from '../src/systems/scoring.js';
import { JUDGE_IDS, JUDGE_SAMPLES } from './judge-samples.mjs';

/* 用 fileURLToPath 而不是 URL.pathname：后者在部分 Node 版本上
   会丢掉结尾斜杠，导致拼接出来的路径少一层分隔符。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'tests/baseline.json');
const baseline = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(PROBLEM_MANIFEST.map(p => [p.id, p]));

const judgment = [];
const systemJudgment = [];
for (const id of JUDGE_IDS){
  const prob = byId.get(id);
  if (!prob){
    console.error(`清单里没有题目 ${id}`);
    process.exit(1);
  }
  for (const code of JUDGE_SAMPLES){
    judgment.push({ id, code, out: judgePretest(code, prob, KEYWORDS_LIST) });
    /* 系统测试只冻结紧凑指纹：20 个点的完整结果会让基线文件膨胀一倍，
       而点数 / 分数 / 逐点状态已经足够抓住任何漂移。 */
    const sys = judgeSystem(code, prob, KEYWORDS_LIST);
    systemJudgment.push({
      id, code,
      score: sys.score, passed: sys.passed,
      statuses: sys.cases.map(c => c.status).join('')
    });
  }
}

writeFileSync(file, JSON.stringify({
  judgment, systemJudgment, npc: baseline.npc, pool: baseline.pool
}, null, 2) + '\n');
console.log(`已重冻评测基线：pretest ${judgment.length} 组 / system ${systemJudgment.length} 组` +
  `（npc ${baseline.npc.length} 组与题库清单原样保留）`);
