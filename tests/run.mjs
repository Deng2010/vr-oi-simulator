/* =========================================================
   回归测试（不需要浏览器）
   ---------------------------------------------------------
   目标：把「不能坏的东西」固化成断言 —— 既有「搬运零漂移」的快照，
   也有「算得对」的语义判据（快照只证明没变，不证明对）。

   覆盖：
     1.   评分行为快照（pretest 24 组逐字段 + system 24 组点数与逐点状态）
     1.5  评测器语义判据（反灌水 / 题目差异化 / 双层评测 / 抖动形状）
     1.6  难度字段与抽题排序（1~4 分档、抽题按难度升序、难度不进界面）
     2.   NPC 代码生成 == 重构前基线（15 组）
     3.   题库清单元数据 == 重构前基线
     4+5. 每题 .md 题面哈希与共享起手模板哈希 == 重构前基线
     6.   烘焙贴图资产存在且非空
     7.   自适应 pixelRatio 策略
     8.   静态合批的动态物体排除（人物 4 条腿 / 老师冻结）
     9.   src/ 无循环 import

   用法：  npm test
   ========================================================= */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRETEST_CASES, SYSTEM_CASES, baseScoreOf, judgePretest, judgeSystem, judgeUnified, stripCode
} from '../src/systems/scoring.js';
import { genNpcCode } from '../src/systems/npc-codegen.js';
import { KEYWORDS_LIST } from '../src/data/keywords.js';
import { PROBLEM_MANIFEST } from '../src/data/problems/manifest.js';
import { pickProblems, sortByDifficulty } from '../src/data/problems/selection.js';
import { STARTER_TEMPLATE } from '../src/data/problems/template.js';
import {
  COMMENT_PAD, HONEST_PADDED, HONEST_SOLUTION, KEYWORD_SOUP
} from './judge-samples.mjs';
import {
  HIGH_FPS, LOW_FPS, MAX_PIXEL_RATIO, MIN_PIXEL_RATIO, initialPixelRatioState,
  nextPixelRatio
} from '../src/core/perf-policy.js';
import * as THREE from 'three';
import { mergeStaticMeshes } from '../src/render/batch.js';

/* 用 fileURLToPath 而不是 URL.pathname：后者在部分 Node 版本上
   会丢掉结尾斜杠，导致拼接出来的路径少一层分隔符。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(path.join(ROOT, 'tests/baseline.json'), 'utf8'));
const hashes = JSON.parse(readFileSync(path.join(ROOT, 'tests/problem-hashes.json'), 'utf8'));
const manifestById = new Map(PROBLEM_MANIFEST.map(p => [p.id, p]));

let passed = 0;
const failures = [];

function check(name, ok, detail = ''){
  if (ok){ passed++; return; }
  failures.push(name + (detail ? `\n      ${detail}` : ''));
}
function eq(name, actual, expected){
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  check(name, a === b, a === b ? '' : `期望 ${b}\n      实际 ${a}`);
}
const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex');

/* ---------- 1. 评分行为快照 ---------- */
/* 快照保证的是「不再意外漂移」，不是「算得对」。
   本版评分规则是**有意变更**的（反灌水 + 题目差异化 + 双层评测），
   重冻方式见 tests/capture-judge-baseline.mjs；正确性判据在 1.5 节。 */
console.log('\n▸ 评分行为快照（提前冻结，防止后续无意漂移）');
for (const item of baseline.judgment){
  const prob = manifestById.get(item.id);
  const out = judgeUnified(item.code, prob, KEYWORDS_LIST);
  check(`judgeUnified(${item.id}) 预测试结果一致`, JSON.stringify(out) === JSON.stringify(item.out),
    `代码: ${item.code.slice(0, 60)}…`);
}
for (const item of baseline.systemJudgment){
  const prob = manifestById.get(item.id);
  const out = judgeSystem(item.code, prob, KEYWORDS_LIST);
  const now = {
    id: item.id, code: item.code, score: out.score, passed: out.passed,
    statuses: out.cases.map(c => c.status).join('')
  };
  check(`judgeSystem(${item.id}) 系统测试结果一致`, JSON.stringify(now) === JSON.stringify(item),
    `期望 ${item.score} 分 / ${item.passed} 点，实际 ${out.score} 分 / ${out.passed} 点`);
}

/* ---------- 1.5 评测器语义判据 ---------- */
/* 上面那节只证明「没变」，这节才证明「对」。
   四条反灌水判据在旧版评分器（长度分按原始行数、关键字只判是否出现）下
   一定会红：注释灌水与关键词堆砌当时都能压过认真解。 */
console.log('\n▸ 评测器语义判据（反灌水 / 题目差异化 / 双层评测）');

{
  const rows = PROBLEM_MANIFEST.map(p => ({
    id: p.id,
    honest: judgePretest(HONEST_SOLUTION, p, KEYWORDS_LIST).score,
    pad: judgePretest(COMMENT_PAD, p, KEYWORDS_LIST).score,
    soup: judgePretest(KEYWORD_SOUP, p, KEYWORDS_LIST).score,
    starter: judgePretest(STARTER_TEMPLATE, p, KEYWORDS_LIST).score
  }));
  const badPad = rows.filter(r => r.pad >= r.honest).map(r => `${r.id}(灌水${r.pad}≥正解${r.honest})`);
  const badSoup = rows.filter(r => r.soup >= r.honest).map(r => `${r.id}(堆砌${r.soup}≥正解${r.honest})`);
  const badStarter = rows.filter(r => r.starter >= 40).map(r => `${r.id}(模板${r.starter})`);
  const badHonest = rows.filter(r => r.honest < 50).map(r => `${r.id}(正解${r.honest})`);
  check('每道题：注释灌水分数严格低于认真解', badPad.length === 0, badPad.join(' '));
  check('每道题：关键词堆砌严格低于认真解', badSoup.length === 0, badSoup.join(' '));
  check('每道题：起手模板白拿的分数 < 40', badStarter.length === 0, badStarter.join(' '));
  check('每道题：认真解 ≥ 50 分（题目特征词没配错）', badHonest.length === 0, badHonest.join(' '));
}

{
  const prob = manifestById.get('P14962');
  const padInfo = baseScoreOf(COMMENT_PAD, prob, KEYWORDS_LIST);
  check('长度分只数有效代码行（150 行注释 = 1 行代码）', padInfo.lines === 1,
    `effectiveLines=${padInfo.lines}`);

  /* 最锋利的一条：同一份代码挂上 150 行注释，基础分必须一分不涨。
     旧版长度分按原始行数算，这里会涨 27 分（len 3.3 → 30）→ 判据变红。 */
  const plain = baseScoreOf(HONEST_SOLUTION, prob, KEYWORDS_LIST);
  const padded = baseScoreOf(HONEST_PADDED, prob, KEYWORDS_LIST);
  check('加 150 行注释不改变基础分', padded.base === plain.base,
    `加注释 ${padded.base.toFixed(1)} vs 原样 ${plain.base.toFixed(1)}`);
  check('加 150 行注释不改变有效行数', padded.lines === plain.lines,
    `${padded.lines} vs ${plain.lines}`);

  const once = stripCode(HONEST_SOLUTION);
  check('stripCode 幂等（重复剥离不再变化）', stripCode(once) === once);
}

{
  const p0 = PROBLEM_MANIFEST[0];
  const pre = judgePretest(HONEST_SOLUTION, p0, KEYWORDS_LIST);
  const sys = judgeSystem(HONEST_SOLUTION, p0, KEYWORDS_LIST);
  check('pretest 是 10 个测试点', pre.cases.length === PRETEST_CASES && pre.total === 10,
    `${pre.cases.length} 点`);
  check('system test 是 20 个测试点', sys.cases.length === SYSTEM_CASES && sys.total === 20,
    `${sys.cases.length} 点`);
  check('pretest 分数 = 通过点数 × 10', pre.score === pre.passed * 10,
    `${pre.score} vs ${pre.passed}`);
  check('system test 分数 = 通过点数 × 5', sys.score === sys.passed * 5,
    `${sys.score} vs ${sys.passed}`);
  check('system test 可复现（同一个代码永远同样的分）',
    JSON.stringify(judgeSystem(HONEST_SOLUTION, p0, KEYWORDS_LIST)) === JSON.stringify(sys));
}

{
  /* 抖动形状：幅度有界、整体偏乐观、但不是不变。
     一个代码 × 一道题就是一粒种子，凑 16×12 粒看统计量。 */
  const deltas = [];
  for (const p of PROBLEM_MANIFEST){
    for (let k = 0; k < 12; k++){
      const code = HONEST_SOLUTION + '\n// v' + k + (k % 3 === 0 ? ' sort(' : '');
      deltas.push(judgeSystem(code, p, KEYWORDS_LIST).score -
                  judgePretest(code, p, KEYWORDS_LIST).score);
    }
  }
  const maxAbs = Math.max(...deltas.map(Math.abs));
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  check('系统测试相对预测试的抖动幅度有界（|Δ| ≤ 20）', maxAbs <= 20, `maxAbs=${maxAbs}`);
  check('系统测试确实会抖动（存在 Δ≠0）', deltas.some(d => d !== 0));
  check('系统测试平均不高于预测试（预测试数据弱、偏乐观）', mean <= 0,
    `mean=${mean.toFixed(2)}`);
}

{
  /* 题目档案完整性：特征词必须来自全局词表，否则评测器永远匹配不到 */
  const missing = [], dupes = [], notGlobal = [], fewHints = [];
  for (const p of PROBLEM_MANIFEST){
    if (!Array.isArray(p.keywords) || p.keywords.length < 3) missing.push(p.id);
    else if (new Set(p.keywords).size !== p.keywords.length) dupes.push(p.id);
    for (const k of (p.keywords || [])){
      if (!KEYWORDS_LIST.includes(k)) notGlobal.push(`${p.id}:${k}`);
    }
    if (!Array.isArray(p.hints) || p.hints.length < 2) fewHints.push(p.id);
  }
  check('每题都配了 ≥3 个题目特征词', missing.length === 0, missing.join(' '));
  check('题目特征词没有重复', dupes.length === 0, dupes.join(' '));
  check('题目特征词都来自全局词表', notGlobal.length === 0, notGlobal.join(' '));
  check('每题都配了 ≥2 个特征代码片段', fewHints.length === 0, fewHints.join(' '));
}

{
  /* 关键字是拿来做正则的：'a+b' 若没转义，会匹配到代码里的 aab。
     旧版直接拼字符串，属于「加一个带元字符的关键字就悄悄错」的隐患。 */
  const meta = { id: 'TEST', keywords: ['a+b'], hints: [] };
  const withMeta = baseScoreOf('int main(){int aab=1;cin>>aab;cout<<aab;return 0;' +
    'for(int i=0;i<2;i++)aab+=i;}', meta, KEYWORDS_LIST);
  const plain = baseScoreOf('int main(){int zz=1;cin>>zz;cout<<zz;return 0;' +
    'for(int i=0;i<2;i++)zz+=i;}', meta, KEYWORDS_LIST);
  check('关键字按字面量匹配（正则元字符已转义）',
    Math.abs(withMeta.kw - plain.kw) < 1e-9,
    `含 aab 的 kw=${withMeta.kw} vs 对照 kw=${plain.kw}`);
}

/* ---------- 1.6 难度与抽题 ---------- */
/* 抽题在 src/data/problems/selection.js（不是 index.js）：
   index.js 用了 import.meta.glob，Node 里 import 不了，
   规则搬出来才测得到「一局 4 道、按难度升序」这条真规则。 */
console.log('\n▸ 难度字段与抽题排序（src/data/problems/selection.js）');

{
  const nums = PROBLEM_MANIFEST.map(p => Number(p.id.replace(/\D/g, '')));
  check('清单纯按题号升序、每 4 道连续成组',
    nums.every((v, i) => i === 0 || v > nums[i - 1]) &&
    nums.every((v, i) => i % 4 === 0 || v === nums[i - 1] + 1),
    nums.join(','));
  const badDiff = PROBLEM_MANIFEST
    .filter((p, i) => p.difficulty !== (i % 4) + 1)
    .map(p => `${p.id}:${p.difficulty}`);
  check('题号连续的 4 道题难度依次为 1~4', badDiff.length === 0, badDiff.join(' '));
}

{
  const reversed = PROBLEM_MANIFEST.slice().reverse();
  const before = reversed.map(p => p.id).join(',');
  const sorted = sortByDifficulty(reversed);
  check('sortByDifficulty 不改动入参（返回新数组）',
    reversed.map(p => p.id).join(',') === before && sorted !== reversed);
  check('排序后难度单调不减',
    sorted.every((p, i) => i === 0 || sorted[i - 1].difficulty <= p.difficulty));
  check('同难度按题号升序（同一个集合顺序确定）',
    sorted.every((p, i) => i === 0 || sorted[i - 1].difficulty < p.difficulty ||
                sorted[i - 1].id < p.id));
  check('排序不丢题', sorted.length === PROBLEM_MANIFEST.length);
}

{
  /* 抽题是游戏规则：一局 4 道、互不重复、按难度升序，
     且难度组合**不强制** 1,2,3,4 —— 题目是从整个池子里均匀抽的。 */
  const poolIds = new Set(PROBLEM_MANIFEST.map(p => p.id));
  const combos = new Set();
  let badLen = 0, badDup = 0, asc = true, fromPool = true;
  for (let k = 0; k < 400; k++){
    const picked = pickProblems(4);
    if (picked.length !== 4) badLen++;
    if (new Set(picked.map(p => p.id)).size !== picked.length) badDup++;
    if (!picked.every((p, i) => i === 0 || picked[i - 1].difficulty <= p.difficulty)) asc = false;
    if (!picked.every(p => poolIds.has(p.id))) fromPool = false;
    combos.add(picked.map(p => p.difficulty).join(''));
  }
  check('一局抽 4 道互不重复的题', badLen === 0 && badDup === 0, `len=${badLen} dup=${badDup}`);
  check('抽题结果按难度升序', asc);
  check('抽到的题都来自清单', fromPool);
  /* 400 局里能看到 5 种以上难度组合（一共只有 35 种）的概率接近 1；
     这条断言正是用来钉「允许重难度、不强制 1~4」的。 */
  check('难度组合多样（不强制 1,2,3,4）', combos.size >= 5,
    `400 局出现 ${combos.size} 种：${[...combos].slice(0, 8).join(' ')}`);
}

{
  /* 难度不进界面，也不该进别的逻辑层：静态扫整个 src/，
     这个字段只准出现在题库数据与抽题模块里。
     为什么用静态扫描：难度是 1~4 的数字，混在分数里肉眼分不出来；
     pattern 带词边界，sortByDifficulty 这类函数名不会被误判。 */
  const FIELD = /(^|[^A-Za-z0-9_])difficulty([^A-Za-z0-9_]|$)/i;
  const ALLOWED = new Set([
    'src/data/problems/manifest.js',    /* 数据本身 */
    'src/data/problems/selection.js'    /* 排序读它 */
  ]);
  const files = [];
  (function walk(d){
    for (const f of readdirSync(d)){
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html|css)$/.test(p)) files.push(p);
    }
  })(path.join(ROOT, 'src'));
  const offenders = files
    .map(f => ({ rel: path.relative(ROOT, f).split(path.sep).join('/'), abs: f }))
    .filter(x => !ALLOWED.has(x.rel) && FIELD.test(readFileSync(x.abs, 'utf8')))
    .map(x => x.rel);
  check('难度字段只出现在题库数据与抽题模块（不进界面 / 别的逻辑）',
    offenders.length === 0, offenders.join(' '));
}

{
  /* 空格（攻击）必须是「按下即生效」，不能混进 E / F 的按住确认。
     为什么只能静态判据：要真跑一遍得先放保安出来，而保安会追着玩家
     把冒烟测试后面的步骤全打乱；源码接线是这条行为的唯一入口，
     扫它就够挡住「三个动作键被统一接进 beginInteractHold」这种回归。 */
  const inputSrc = readFileSync(path.join(ROOT, 'src/core/input.js'), 'utf8');
  check('空格接的是 attackNow()（按下即生效）',
    /Space[\s\S]{0,200}?attackNow\(\)/.test(inputSrc));
  check('空格没有走 beginInteractHold（短按要能打出拳）',
    !/beginInteractHold\(\s*'space'\s*\)/.test(inputSrc));
  /* 曾经为了「按一下打一拳」在 input.js 里用 e.repeat 过滤自动重复，
     结果按住空格时保安走进范围也不出手 —— 玩家反馈的正是这个。
     限速归 attackNow() 的 ATTACK_INTERVAL，输入层不许再拦重复事件。 */
  check('空格不看 e.repeat（按住要能持续出手）',
    !/Space[\s\S]{0,200}?e\.repeat/.test(inputSrc));
}

/* ---------- 2. NPC 代码生成 ---------- */
console.log('\n▸ NPC 代码生成（src/systems/npc-codegen.js vs 重构前 npc-gen.js）');
for (const item of baseline.npc){
  const code = genNpcCode(item.name, item.id);
  check(`genNpcCode(${item.name}, ${item.id}) 逐字一致`, code === item.code,
    code === item.code ? '' : '生成结果与基线不同');
}

/* ---------- 3. 题库清单元数据 ---------- */
console.log('\n▸ 题库清单（src/data/problems/manifest.js vs 重构前 problems.js）');
check('题目数量一致', PROBLEM_MANIFEST.length === baseline.pool.length,
  `${PROBLEM_MANIFEST.length} vs ${baseline.pool.length}`);
for (const old of baseline.pool){
  const now = manifestById.get(old.id);
  if (!now){ check(`题目 ${old.id} 存在`, false); continue; }
  eq(`${old.id} 元数据一致`,
    { id: now.id, name: now.name, max: now.max, tl: now.tl, ml: now.ml },
    { id: old.id, name: old.name, max: old.max, tl: old.tl, ml: old.ml });
}

/* ---------- 4. 题面哈希 + 5. 起手模板 ---------- */
console.log('\n▸ 题面与起手模板内容哈希');
const dir = path.join(ROOT, 'src/data/problems') + path.sep;
for (const [id, meta] of Object.entries(hashes.problems)){
  const md = dir + id + '.md';
  if (!existsSync(md)){ check(`${id}.md 存在`, false); continue; }
  const text = readFileSync(md, 'utf8');
  check(`${id} 题面哈希与拆分前一致`, sha256(text) === meta.desc,
    `长度 ${text.length}（基线 ${meta.descLen}）`);
  check(`${id} 题面长度一致`, text.length === meta.descLen,
    `${text.length} vs ${meta.descLen}`);
  const js = dir + id + '.js';
  check(`${id}.js 存在`, existsSync(js));
  if (existsSync(js)){
    const src = readFileSync(js, 'utf8');
    check(`${id}.js 引用同名 .md`, src.includes(`./${id}.md?raw`));
    check(`${id}.js 复用共享起手模板`, src.includes('STARTER_TEMPLATE'));
  }
}
check('共享起手模板哈希与拆分前一致',
  sha256(STARTER_TEMPLATE) === hashes.starterTemplate);

/* ---------- 6. 烘焙资产 ---------- */
console.log('\n▸ 烘焙贴图资产 assets/textures/');
const needed = ['board.webp', 'door-sign.webp', 'keyboard.webp'];
for (const f of needed){
  const p = path.join(ROOT, 'assets/textures', f);
  const ok = existsSync(p) && statSync(p).size > 200;
  check(`assets/textures/${f} 存在且非空`, ok,
    existsSync(p) ? `${statSync(p).size} bytes` : '文件缺失，运行 npm run bake:assets');
}
check('assets/icon.svg 存在', existsSync(path.join(ROOT, 'assets/icon.svg')));

/* ---------- 7. 自适应 pixelRatio 策略 ----------
   纯函数，所以能直接单测；不需要浏览器，也不依赖渲染器。 */
console.log('\n▸ 自适应 pixelRatio 策略（src/core/perf-policy.js）');
{
  const feed = (fps, times) => {
    let s = initialPixelRatioState();
    const seen = [s.ratio];
    for (let i = 0; i < times; i++){
      s = nextPixelRatio(s, fps);
      seen.push(s.ratio);
    }
    return { state: s, seen };
  };

  /* 慢机：连续慢窗口降档，一路降到下限后不再降 */
  const slow = feed(LOW_FPS - 10, 12);
  check('持续低帧率会逐级降到下限',
    slow.state.ratio === MIN_PIXEL_RATIO, `最终 ${slow.state.ratio}`);
  check('降档是逐级的（0.25 一档）',
    JSON.stringify(slow.seen.slice(0, 5)) === JSON.stringify([1.5, 1.5, 1.25, 1.25, 1.0]),
    JSON.stringify(slow.seen));
  check('降到下限后不再继续降',
    nextPixelRatio(slow.state, 10).direction === 'none');

  /* 快机：从下限升回上限，且升档比降档更迟钝（4 个窗口 vs 2 个） */
  let up = { ratio: MIN_PIXEL_RATIO, lowStreak: 0, highStreak: 0 };
  const upSeen = [up.ratio];
  for (let i = 0; i < 16; i++){ up = nextPixelRatio(up, HIGH_FPS + 5); upSeen.push(up.ratio); }
  check('持续高帧率会升回上限', up.ratio === MAX_PIXEL_RATIO, `最终 ${up.ratio}`);
  check('升档需要 4 个连续快窗口（前 4 次不变）',
    JSON.stringify(upSeen.slice(0, 4)) === JSON.stringify([1.0, 1.0, 1.0, 1.0]),
    JSON.stringify(upSeen));

  /* 死区：45~58fps 之间维持现状，并且清空连胜计数 */
  const dead = feed(50, 10);
  check('死区内维持现状', dead.state.ratio === MAX_PIXEL_RATIO, `最终 ${dead.state.ratio}`);
  let mixed = { ratio: MAX_PIXEL_RATIO, lowStreak: 0, highStreak: 0 };
  mixed = nextPixelRatio(mixed, LOW_FPS - 5);      // lowStreak = 1
  mixed = nextPixelRatio(mixed, 50);               // 死区 → 清零
  mixed = nextPixelRatio(mixed, LOW_FPS - 5);      // lowStreak = 1（若未清零这里会降档）
  check('死区会清空连胜计数（避免跨窗口累计误降档）',
    mixed.ratio === MAX_PIXEL_RATIO && mixed.lowStreak === 1,
    `ratio=${mixed.ratio} lowStreak=${mixed.lowStreak}`);

  /* 一帧抖动不该触发降档 */
  let jitter = { ratio: MAX_PIXEL_RATIO, lowStreak: 0, highStreak: 0 };
  jitter = nextPixelRatio(jitter, LOW_FPS - 20);
  jitter = nextPixelRatio(jitter, 60);
  check('单帧卡顿不会触发降档',
    jitter.ratio === MAX_PIXEL_RATIO, `ratio=${jitter.ratio}`);
}

/* ---------- 8. 静态合批的动态物体排除 ----------
   这一段是**回归测试**：曾经因为 buildPerson() 返回的是包装对象
   （{ group, armL, armR, legsSit, legsStand }）而不是 Object3D，
   dynamicRoots 匹配不上 Object3D 的 parent 链，导致人物与监考老师
   被误合批，表现是「人物同时露出坐姿 + 站姿共 4 条腿」
   和「老师模型冻在原地、和真实坐标对不上」。

   合批器对动态物体有**两条独立的判据**，这里分别单独验证，
   避免「一条失效、另一条恰好兜住」让测试变成假绿：
     判据 A：dynamicRoots 引用匹配（且必须能解析包装对象 → .group）
     判据 B：祖先链上的 userData.dynamic 标记
   所以下面的 fakePerson 可以决定要不要打标记，
   从而把两条判据隔离测试。 */
console.log('\n▸ 静态合批：动态物体排除（src/render/batch.js）');
{
  const box = (w, h, d, material) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

  /* 与 src/models/person.js 的返回结构保持一致：
     对外返回包装对象；Group 上的 dynamic 标记可选，用于隔离两条判据 */
  function fakePerson({ marked }){
    const g = new THREE.Group();
    if (marked) g.userData.dynamic = true;
    const pants = new THREE.MeshStandardMaterial();
    const legsSit = new THREE.Group();
    for (let i = 0; i < 4; i++) legsSit.add(box(0.17, 0.17, 0.44, pants));
    const legsStand = new THREE.Group();
    for (let i = 0; i < 2; i++) legsStand.add(box(0.17, 0.9, 0.17, pants));
    legsSit.visible = false;
    g.add(legsSit, legsStand);
    return { group: g, legsSit, legsStand };
  }

  function fakeScene({ marked = false } = {}){
    const root = new THREE.Group();
    const person = fakePerson({ marked });
    root.add(person.group);
    /* 静态家具：共享材质，应该被合批 */
    const wood = new THREE.MeshStandardMaterial();
    for (let i = 0; i < 6; i++) root.add(box(1.9, 0.06, 0.95, wood));
    /* 可交互物体：必须原样保留（射线拾取依赖它） */
    const cup = box(0.07, 0.1, 0.07, new THREE.MeshStandardMaterial());
    cup.userData.interact = { label: '喝水', action: () => {} };
    root.add(cup);
    /* 透明材质：排序敏感，跳过 */
    const glass = box(0.3, 0.3, 0.3, new THREE.MeshStandardMaterial({ transparent: true }));
    root.add(glass);
    return { root, person, cup, glass };
  }

  const countMeshes = node => {
    let n = 0;
    node.traverse(o => { if (o.isMesh) n++; });
    return n;
  };

  /* 判据 A-1：包装对象（world.js 曾经就是这么传的）—— 不做标记，只靠引用解析 */
  {
    const s = fakeScene({ marked: false });
    const r = mergeStaticMeshes(s.root, { dynamicRoots: [s.person] });
    check('判据A：dynamicRoots 传包装对象时，人物网格被保留',
      countMeshes(s.person.group) === 6,
      `人物网格 ${countMeshes(s.person.group)}（期望 6）`);
    check('判据A：坐姿腿 4 个盒子仍在 legsSit 组内',
      s.person.legsSit.children.length === 4,
      `${s.person.legsSit.children.length} 个`);
    check('判据A：站姿腿 2 个盒子仍在 legsStand 组内',
      s.person.legsStand.children.length === 2);
    check('判据A：被跳过的动态网格数 = 6', r.skippedDynamic === 6,
      `skippedDynamic=${r.skippedDynamic}`);
    /* 合批后：1（合并后的家具）+ 6（人物）+ 1（水杯）+ 1（玻璃）= 9 */
    check('静态家具确实被合批', r.meshesAfter === 9 && r.mergedGroups === 1,
      `meshesAfter=${r.meshesAfter} groups=${r.mergedGroups}`);
    check('合并前后网格数守恒', r.meshesBefore === 14, `meshesBefore=${r.meshesBefore}`);
    check('可交互物体未被合批（仍在场景里）', s.cup.parent === s.root);
    check('透明物体未被合批（仍在场景里）', s.glass.parent === s.root);
  }

  /* 判据 A-2：直接传 Object3D（world.js 现在的写法） */
  {
    const s = fakeScene({ marked: false });
    const r = mergeStaticMeshes(s.root, { dynamicRoots: [s.person.group] });
    check('判据A：dynamicRoots 传 Object3D 时人物网格被保留',
      countMeshes(s.person.group) === 6 && r.skippedDynamic === 6);
  }

  /* 判据 B：不传 dynamicRoots，只靠模型的 userData.dynamic 标记 */
  {
    const s = fakeScene({ marked: true });
    const r = mergeStaticMeshes(s.root, {});
    check('判据B：仅靠 userData.dynamic 标记也能保住人物',
      countMeshes(s.person.group) === 6 && r.skippedDynamic === 6,
      `人物网格 ${countMeshes(s.person.group)}, skipped=${r.skippedDynamic}`);
  }

  /* 判据缺失时的表现：既没标记、也没传引用 → 一定会被误合批。
     这条断言把「为什么必须有这两条判据」写进测试里：
     一旦它变成 false，说明合批器有了别的保护，需要同步更新文档。 */
  {
    const s = fakeScene({ marked: false });
    const r = mergeStaticMeshes(s.root, {});
    check('两条判据都缺失时人物会被误合批（这就是曾经的 bug）',
      countMeshes(s.person.group) === 0 && r.skippedDynamic === 0,
      `人物网格 ${countMeshes(s.person.group)}`);
  }

  /* 无法解析的动态根：必须抛错，而不是静默误合批 */
  {
    let threw = null;
    try { mergeStaticMeshes(fakeScene().root, { dynamicRoots: [{ nope: 1 }] }); }
    catch (e){ threw = e; }
    check('无法解析的动态根会直接抛错（不静默误合批）',
      threw instanceof TypeError, threw ? threw.message.slice(0, 60) : '没有抛错');
  }

  /* 腿组可见性切换仍然有效（这就是「4 条腿」的判据） */
  {
    const s = fakeScene({ marked: false });
    mergeStaticMeshes(s.root, { dynamicRoots: [s.person] });
    s.person.legsStand.visible = false;
    s.person.legsSit.visible = true;
    let visible = 0;
    s.person.group.traverse(o => { if (o.isMesh && o.parent.visible) visible++; });
    check('切换 legsSit/legsStand 可见性后只剩一组腿（4 个盒子）',
      visible === 4 && s.person.legsStand.visible === false,
      `可见网格 ${visible}`);
  }
}

/* ---------- 9. 循环依赖 ---------- */
console.log('\n▸ 模块依赖方向');
{
  const files = [];
  (function walk(d){
    for (const f of readdirSync(d)){
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  })(path.join(ROOT, 'src'));

  const graph = new Map();
  for (const f of files){
    const deps = [];
    for (const m of readFileSync(f, 'utf8').matchAll(/^import (?:[^'"]*from )?'([^']+)'/gm)){
      if (m[1].startsWith('.')) deps.push(path.resolve(path.dirname(f), m[1]));
    }
    graph.set(f, deps);
  }
  const state = new Map();
  const cycles = [];
  const dfs = (n, stack) => {
    const st = state.get(n);
    if (st === 1){
      cycles.push(stack.slice(stack.indexOf(n)).map(x => path.relative(ROOT, x)).join(' → '));
      return;
    }
    if (st === 2) return;
    state.set(n, 1);
    for (const d of graph.get(n) || []) if (graph.has(d)) dfs(d, stack.concat(n));
    state.set(n, 2);
  };
  for (const f of files) dfs(f, []);
  check('src/ 无循环 import', cycles.length === 0, cycles.join('\n      '));
  check('模块数量合理（≥ 30）', files.length >= 30, `${files.length} 个模块`);
}

/* ---------- 汇总 ---------- */
console.log('\n' + '─'.repeat(64));
if (failures.length){
  console.log(`\n✗ ${failures.length} 项失败（通过 ${passed} 项）\n`);
  for (const f of failures) console.log('  · ' + f);
  console.log('');
  process.exitCode = 1;
} else {
  console.log(`\n✓ 全部通过：${passed} 项断言\n`);
}
