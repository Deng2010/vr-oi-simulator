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
     10.  结局系统：配置自检 + 每个结局的触发判据 + 注册表与文件配对
     11.  统计系统：计数 / 开关 / 事件流（去重、上限、快照副本、存档恢复）
     12.  图鉴存档与展示墙：宽容解析、解锁累加、只显示已解锁的
     13.  结局正文播放器：分段内容、打字机推进、两条按键规则

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
import { ENDINGS } from '../src/data/endings/index.js';
import {
  ENDING_STAGES, endingText, resolveEnding, sortedEndings, validateEndings
} from '../src/data/endings/select.js';
import { BRAWLER_KILLS } from '../src/data/endings/brawler.js';
import { CHEAT_COMPUTER_USES } from '../src/data/endings/cheat.js';
import {
  SPEEDRUN_MAX_SECONDS, SPEEDRUN_MIN_SCORE
} from '../src/data/endings/speedrun.js';
import {
  EVENT_LIMIT, bump, eventList, flag, recordEvent, resetStats, restoreStats, statRows,
  stats, statsSnapshot
} from '../src/systems/stats.js';
import {
  PROFILE_BUCKETS, PROFILE_KEY, achievementRows, applyUnlock, emptyProfile,
  endingRows, parseProfile, readProfile, recordAchievement, serializeProfile
} from '../src/systems/profile.js';
import {
  HINT_LAST, HINT_NEXT, HINT_SKIP, STORY_SEGMENT_LIMIT, advanceStory, createStory,
  isSegmentDone, progressLabel, revealNext, storyHint, storySegmentsOf, visibleText
} from '../src/systems/story.js';

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

/* ---------- 10. 结局系统 ---------- */
/* 一个「正常完赛」的基准快照：各用例只改它关心的那几个字段。
   注意这里的所有字段名都必须和 ui/ending.js 的 endingSnapshot() 一致 ——
   结局判据与正文分段都在替那份快照的字段名把关。 */
const baseEndingSnapshot = () => ({
  elapsed: 7200, problemCount: 4, submits: 4, solves: 2, pretestBest: 90,
  finalSolves: 2, finalScore: 250,
  warns: 1, wanderCount: 1, wanderPenalty: false, guardKills: 0,
  npcDisturbed: 0, npcComputersUsed: 0, npcComplaints: 0,
  teacherHits: 0, teacherCalls: 1, drinkWater: 0, paperOpened: 0, bathroomTrips: 0,
  keystrokes: 100, acceptedSubmits: 1,
  banned: false, bannedWord: '', caughtByGuards: false,
  manualSubmit: true, timeUp: false, events: []
});

console.log('\n▸ 结局系统（src/data/endings/：配置自检 + 触发判据 + 文件配对）');
{
  const baseSnap = baseEndingSnapshot;
  /* 两个阶段的入口分开：
     违纪/被抓/作弊是 stage='immediate'（交卷那一刻就判，不跑系统测试），
     分数类与收场类才是 stage='final'（跑完系统测试再判）。
     混用会红 —— 这正是下面两组判据要钉住的接线。 */
  const pickAt = (stage, patch) => resolveEnding({ ...baseSnap(), ...patch }, stage);
  const idAt = (stage, patch) => { const e = pickAt(stage, patch); return e ? e.id : null; };
  const pickId = patch => idAt('final', patch);

  /* --- 配置自检 --- */
  const problems = validateEndings();
  check('注册表自检无问题（字段齐全 / id 唯一 / 每阶段有兜底）',
    problems.length === 0, problems.join(' '));

  /* 文件配对：加了结局文件却忘了在 index.js 里注册，会在这里红
     （和题库「清单 ↔ 文件必须配对」是同一条纪律） */
  const endingFiles = readdirSync(path.join(ROOT, 'src/data/endings'))
    .filter(f => f.endsWith('.js') && f !== 'index.js' && f !== 'select.js');
  check('每个结局一个文件，且都已注册进 ENDINGS',
    endingFiles.length === ENDINGS.length,
    `${endingFiles.length} 个文件 / ${ENDINGS.length} 条注册`);
  check('结局 id 唯一', new Set(ENDINGS.map(e => e.id)).size === ENDINGS.length);
  check('两个阶段都有结局', ENDING_STAGES.every(
    st => ENDINGS.some(e => (e.stage || 'final') === st)));

  /* 自检本身要有效：给它一份坏配置，必须报出来（否则它就是一条假绿断言） */
  {
    const broken = validateEndings([
      { id: 'dup', stage: 'immediate', priority: 1, title: 't', tone: 'bad' },   // 缺 badge、没作废分数
      { id: 'dup', stage: 'nope', priority: 2, title: 't', badge: 'b', tone: 'bad' }
    ]);
    check('自检抓得住重复 id', broken.some(p => /重复/.test(p)), broken.join(' '));
    check('自检抓得住非法 stage', broken.some(p => /stage/.test(p)), broken.join(' '));
    check('自检抓得住「immediate 却没有 voidScore」',
      broken.some(p => /voidScore/.test(p)), broken.join(' '));
    check('自检抓得住「这个阶段没有兜底结局」',
      broken.some(p => /兜底/.test(p)), broken.join(' '));
    check('自检抓得住缺字段', broken.some(p => /badge/.test(p)), broken.join(' '));
  }

  /* --- 每个结局各有一条正向判据 --- */
  eq('正常完赛 → 比赛结束（兜底）', pickId({}), 'finished');
  eq('系统测试四题全 AC → AK 结局',
    pickId({ finalSolves: 4, finalScore: 400 }), 'ak');
  eq('系统测试 0 分 → 零分结局', pickId({ finalScore: 0, finalSolves: 0 }), 'zero');
  eq('一次都没提交 → 交白卷（压在零分之上）',
    pickId({ submits: 0, solves: 0, finalScore: 0 }), 'blank');
  eq('时间到自动收卷 → 时间到',
    pickId({ manualSubmit: false, timeUp: true }), 'timeup');
  eq('提前交卷 + 1 小时内 + 200 分 → 闪电交卷',
    pickId({ elapsed: SPEEDRUN_MAX_SECONDS - 60, finalScore: SPEEDRUN_MIN_SCORE }), 'speedrun');
  eq('提前交卷很快但分数不够 → 不判闪电交卷',
    pickId({ elapsed: SPEEDRUN_MAX_SECONDS - 60, finalScore: SPEEDRUN_MIN_SCORE - 1 }), 'finished');
  eq('击倒 8 名保安 → 考场战神',
    pickId({ guardKills: BRAWLER_KILLS }), 'brawler');
  eq('击倒 7 名保安 → 还不到战神',
    pickId({ guardKills: BRAWLER_KILLS - 1 }), 'finished');

  /* --- 违规结局：都在 immediate 阶段（不跑系统测试） --- */
  eq('没有违规时 immediate 阶段不命中结局（照跑系统测试）',
    idAt('immediate', {}), null);
  eq('偷用他人电脑到阈值 → 作弊结局（AK 也救不了）',
    idAt('immediate', { npcComputersUsed: CHEAT_COMPUTER_USES, finalSolves: 4, finalScore: 400 }), 'cheat');
  eq('被保安抓住 → 被保安抓走（满分也照抓）',
    idAt('immediate', { caughtByGuards: true, finalSolves: 4, finalScore: 400 }), 'caught');
  eq('屏蔽词优先于其它一切违规',
    idAt('immediate', { banned: true, bannedWord: 'fuck', caughtByGuards: true, npcComputersUsed: 9 }), 'banned');
  eq('五次随意走动 → 成绩已取消',
    idAt('immediate', { wanderPenalty: true, finalScore: 0 }), 'disqualified');
  /* 同一份「作弊 + 满分」快照，两个阶段给出的答案必须不同：
     这正是「违纪不进评测队列」的接线判据 —— 一旦有人把 cheat 改成
     final 阶段，这条会立刻红。 */
  eq('作弊快照在 final 阶段只是普通 AK（违纪判定不在这边）',
    idAt('final', { npcComputersUsed: CHEAT_COMPUTER_USES, finalSolves: 4, finalScore: 400 }), 'ak');

  /* --- 阶段、优先级与确定性 --- */
  check('immediate 阶段的结局一律作废分数（不跑系统测试）',
    sortedEndings('immediate').every(e => e.voidScore === true),
    sortedEndings('immediate').map(e => `${e.id}:${e.voidScore}`).join(' '));
  check('immediate 阶段不会挑出 final 阶段的结局',
    sortedEndings('immediate').every(e => e.stage === 'immediate'));

  /* 空快照不能把判定器噎住（字段全缺时也该给一个结局） */
  check('空快照也能解析出结局（兜底生效）', resolveEnding({}, 'final') !== null);
  check('空快照解析出的是白卷（0 次提交）',
    (resolveEnding({}, 'final') || {}).id === 'blank');

  /* 确定性：同一快照解析两次必须一致（判定必须是纯函数） */
  const snap = { ...baseSnap(), finalSolves: 4, finalScore: 400 };
  eq('判定是纯函数：同一快照两次解析结果一致',
    resolveEnding(snap, 'final').id, resolveEnding(snap, 'final').id);
  check('判定不会修改传入的快照',
    JSON.stringify(snap) === JSON.stringify({ ...baseSnap(), finalSolves: 4, finalScore: 400 }));

  /* 文案：字符串与函数两种写法都要能渲染出文本
     （防手滑写错字段名，让结局界面上出现 undefined / 空白）。
     正文分段（story）在下面「结局正文播放器」一节单独校验。 */
  check('endingText 支持字符串与函数两种写法',
    endingText('x', {}) === 'x' && endingText(s => `y${s.a}`, { a: 1 }) === 'y1');
  const emptySub = ENDINGS.filter(e => endingText(e.subtitle, baseSnap()).length === 0)
    .map(e => e.id);
  check('每个结局的副标题都能渲染出文本', emptySub.length === 0, emptySub.join(' '));
}

/* ---------- 11. 统计系统 ---------- */
console.log('\n▸ 统计系统（src/systems/stats.js：计数 / 开关 / 事件流 / 快照 / 存档恢复）');
{
  resetStats();
  check('resetStats 后所有计数器与开关都归零',
    Object.keys(stats).every(k => !stats[k]), JSON.stringify(stats));

  bump('npcDisturbed');
  bump('npcDisturbed', 2);
  eq('bump 默认加 1，也可以一次加 n', stats.npcDisturbed, 3);

  flag('caughtByGuards');
  flag('manualSubmit', false);
  check('flag 能置真也能置假', stats.caughtByGuards === true && stats.manualSubmit === false);

  recordEvent('a', '第一件事');
  recordEvent('a', '第一件事');
  recordEvent('b', '第二件事');
  eq('同一 id 的事件合并计数', eventList().map(e => [e.id, e.n]), [['a', 2], ['b', 1]]);
  check('每条事件都带虚拟用时', eventList().every(e => Number.isFinite(e.at) && e.at >= 0));
  recordEvent('c', '第三件事', { dedupe: false });
  recordEvent('c', '第三件事', { dedupe: false });
  eq('dedupe:false 时同一 id 记成多条',
    eventList().filter(e => e.id === 'c').length, 2);

  /* 事件流上限：它会进存档，无上限地记会把 localStorage 撑大 */
  resetStats();
  for (let i = 0; i < EVENT_LIMIT + 20; i++) recordEvent('e' + i, 'x' + i);
  eq('事件流有上限，不会无界增长', eventList().length, EVENT_LIMIT);
  eq('超上限后 recordEvent 返回 null', recordEvent('overflow', 'x'), null);

  /* 快照：extra 覆盖同名键，且是**副本**（改快照不能污染真源） */
  resetStats();
  recordEvent('a', 'A');
  const snap = statsSnapshot({ finalScore: 123 });
  eq('快照里 extra 覆盖同名字段', snap.finalScore, 123);
  snap.events[0].n = 99;
  snap.npcDisturbed = 77;
  eq('快照是事件的副本（改快照不污染事件流）', eventList()[0].n, 1);
  eq('快照是计数器的副本（改快照不污染计数器）', stats.npcDisturbed, 0);

  /* 存档恢复：对缺字段 / 类型不符一律宽容（AGENTS §4.5） */
  resetStats();
  restoreStats({
    npcComputersUsed: 2, banned: 'yes', nope: 1,
    events: [{ id: 'k', label: 'L' }, { nope: 1 }, 'x']
  });
  eq('restoreStats 读得进合法字段', stats.npcComputersUsed, 2);
  check('restoreStats 拒绝类型不符的字段（旧的字符串存档）', stats.banned === false);
  eq('restoreStats 过滤掉坏事件', eventList().map(e => e.id), ['k']);
  eq('restoreStats 给缺字段的事件补默认值',
    [eventList()[0].at, eventList()[0].n], [0, 1]);
  restoreStats(null);
  restoreStats({ events: 'nope' });
  check('restoreStats 对 null / 坏类型不抛错', true);

  /* 统计格子：主线四项恒显示（哪怕全是 0），非主线为 0 时整格隐藏。
     为什么值得一条判据：「0 次警告」不该占一格 —— 但它很容易在重构里
     变回「永远 9 格」，所以这条既钉隐藏、也钉主线不会被一起隐藏掉。
     先清一次，否则上面存过的「坏事件」会让「触发事件」那一格一直非 0。 */
  resetStats();
  const OPTIONAL_LABELS = ['警告次数', '击倒保安', '干扰同学', '偷用电脑', '触发事件'];
  const emptyRows = statRows(statsSnapshot({ problemCount: 4 }));
  eq('统计格子：主线四项恒显示（全是 0 也显示）',
    emptyRows.map(r => r.label),
    ['实际用时', '提交次数', '预测试 AC', '系统测试 AC']);

  const busySnapshot = statsSnapshot({
    problemCount: 4, submits: 3, solves: 1, finalSolves: 2,
    warns: 1, guardKills: 5, npcDisturbed: 2, npcComputersUsed: 1,
    events: [{ id: 'a', label: 'A', at: 0, n: 1 }]
  });
  const busyRows = statRows(busySnapshot);
  eq('统计格子：非主线非 0 时全部显示（最多 9 格）', busyRows.length, 9);
  check('统计格子：9 格时含全部非主线标签',
    OPTIONAL_LABELS.every(l => busyRows.some(r => r.label === l)),
    busyRows.map(r => r.label).join(' '));

  /* 逐个隔离：只把某一项调成非 0，就只有那一格出现 */
  for (const [label, patch] of [
    ['警告次数', { warns: 2 }],
    ['击倒保安', { guardKills: 3 }],
    ['干扰同学', { npcDisturbed: 1 }],
    ['偷用电脑', { npcComputersUsed: 2 }],
    ['触发事件', { events: [{ id: 'e', label: 'E', at: 1, n: 1 }] }]
  ]){
    const labels = statRows(statsSnapshot({ problemCount: 4, ...patch })).map(r => r.label);
    eq(`统计格子：只有「${label}」非 0 时只多出这一格`,
      labels, ['实际用时', '提交次数', '预测试 AC', '系统测试 AC', label]);
  }

  check('统计格子只暴露 label / value 两个字段',
    busyRows.every(r => Object.keys(r).length === 2 && typeof r.label === 'string'),
    JSON.stringify(busyRows[0]));
  check('统计格子含格式化用时与 AC 计数',
    statRows(statsSnapshot({ problemCount: 4, elapsed: 3661, solves: 1, finalSolves: 2 }))
      .some(r => r.value === '01:01:01') &&
    statRows(statsSnapshot({ problemCount: 4, solves: 1 })).some(r => r.value === '1 / 4'));
  check('统计格子里的数值来自快照而不是内部状态',
    statRows(statsSnapshot({ guardKills: 42 })).some(r => r.value === 42));
  resetStats();
}

/* ---------- 12. 图鉴存档与展示墙 ---------- */
/* 启动屏的展示墙读的是 oi_profile_v1（跨场次），不是 state.achievements（本场）。
   这里钉三件事：存档要宽容、解锁要累加、**没解锁的绝不能出现在展示行里**
   （那是剧透 —— 未解锁的条目必须连 DOM 都不进，不是靠 CSS 藏）。 */
console.log('\n▸ 图鉴存档与展示墙（src/systems/profile.js）');
{
  /* --- 宽容解析：缺字段 / 坏 JSON / 坏条目都不能抛 --- */
  eq('空存档解析成空图鉴', parseProfile(null), { achievements: {}, endings: {} });
  eq('坏 JSON 解析成空图鉴', parseProfile('{ 这不是 json'), { achievements: {}, endings: {} });
  eq('非对象解析成空图鉴', parseProfile('[]'), { achievements: {}, endings: {} });

  const parsed = parseProfile(JSON.stringify({
    achievements: { a: { at: 5, n: 3 }, b: null, c: { n: 'x' } },
    endings: { z: { at: 'y' } },
    别的字段: 1
  }));
  eq('坏条目补默认值（at=0 / n=1）',
    [parsed.achievements.a, parsed.achievements.b, parsed.achievements.c],
    [{ at: 5, n: 3 }, { at: 0, n: 1 }, { at: 0, n: 1 }]);
  eq('结局分区同样宽容', parsed.endings.z, { at: 0, n: 1 });
  eq('未知分区被忽略', Object.keys(parsed).sort(), PROFILE_BUCKETS.slice().sort());

  /* --- 累加：重复解锁保留首次时间（展示墙按首次解锁倒序排） --- */
  const p = emptyProfile();
  applyUnlock(p, 'achievements', 'x', 100);
  applyUnlock(p, 'achievements', 'x', 200);
  eq('重复解锁累加次数并保留首次解锁时间', p.achievements.x, { at: 100, n: 2 });
  applyUnlock(p, 'endings', 'e1', 300);
  eq('成就与结局分开记', [!!p.endings.e1, !!p.achievements.e1], [true, false]);
  const before = JSON.stringify(p);
  applyUnlock(p, 'nope', 'x', 400);
  applyUnlock(p, 'achievements', '', 400);
  eq('非法分区 / 空 id 不写入', JSON.stringify(p), before);
  eq('序列化后能原样解析回来', parseProfile(serializeProfile(p)), p);

  /* --- 展示墙：只输出已解锁的 --- */
  const achCatalog = [
    { id: 'a', name: '甲成就', desc: '说明 A' },
    { id: 'b', name: '乙成就', desc: '说明 B' },
    { id: 'c', name: '丙成就', desc: '说明 C' }
  ];
  const achWall = emptyProfile();
  applyUnlock(achWall, 'achievements', 'a', 100);
  applyUnlock(achWall, 'achievements', 'c', 300);
  const achRows = achievementRows(achWall, achCatalog);
  eq('展示墙只输出已解锁的成就（按解锁时间倒序）', achRows.map(r => r.id), ['c', 'a']);
  check('未解锁的成就连文字都不出现（不是 CSS 藏）',
    !achRows.some(r => r.name === '乙成就') && !JSON.stringify(achRows).includes('乙成就'),
    JSON.stringify(achRows));
  eq('成就行带名称 / 描述 / 次数',
    [achRows[0].name, achRows[0].desc, achRows[0].n], ['丙成就', '说明 C', 1]);
  eq('空图鉴 → 空展示墙', achievementRows(emptyProfile(), achCatalog), []);

  /* 存档里残留的旧 id（目录里已删掉）不会渲染 */
  const stale = emptyProfile();
  applyUnlock(stale, 'achievements', 'old-removed-id', 50);
  eq('目录里已经没有的旧 id 不渲染', achievementRows(stale, achCatalog), []);

  /* --- 结局行：徽章 / 标题 / 语气 --- */
  const endCatalog = [
    { id: 'zero', badge: '结局 · 零分', title: '零 分 结 局', tone: 'warn' },
    { id: 'finished', badge: '结局 · 完赛', title: '比 赛 结 束' },
    { id: 'ak', badge: '结局 · AK', title: 'A K 全 场', tone: 'good' }
  ];
  const endWall = emptyProfile();
  applyUnlock(endWall, 'endings', 'finished', 10);
  applyUnlock(endWall, 'endings', 'ak', 20);
  applyUnlock(endWall, 'endings', 'ak', 30);
  const endRows = endingRows(endWall, endCatalog);
  eq('结局展示墙只输出已解锁的', endRows.map(r => r.id), ['ak', 'finished']);
  check('未解锁的结局不出现（不剧透）', !endRows.some(r => r.id === 'zero'));
  eq('结局行带徽章 / 标题 / 次数',
    [endRows[0].badge, endRows[0].title, endRows[0].n], ['结局 · AK', 'A K 全 场', 2]);
  eq('结局缺 tone 时回落 neutral', endRows[1].tone, 'neutral');

  /* --- 没有 localStorage 的环境（Node / 无痕模式）不能把页面带崩 --- */
  let threw = null;
  try { recordAchievement('x'); } catch (e){ threw = e; }
  check('没有 localStorage 时写图鉴不抛错', threw === null,
    threw ? threw.message : '');
  const nodeProfile = readProfile();
  check('读图鉴总能返回可用的结构',
    !!nodeProfile && typeof nodeProfile.achievements === 'object' &&
    typeof nodeProfile.endings === 'object');
  check('图鉴键名是稳定契约（跨场次进度靠它读回来）',
    PROFILE_KEY === 'oi_profile_v1', PROFILE_KEY);
}

/* ---------- 13. 结局正文播放器 ---------- */
/* 两条交互规则最容易写成一条（按一下跳两段）或漏掉最后一段，
   所以状态机做成纯函数，在这里把每一条都钉死。
   顺带校验每个结局的正文：段数、单段长度 —— 太长会溢出屏幕。 */
console.log('\n▸ 结局正文播放器（src/systems/story.js：分段 / 打字机 / 按键规则）');
{
  const baseSnap = baseEndingSnapshot;

  /* --- 每个结局都有一段能播的正文 --- */
  const tooFew = ENDINGS.filter(e => storySegmentsOf(e, baseSnap()).length < 3).map(e => e.id);
  check('每个结局至少 3 段正文', tooFew.length === 0, tooFew.join(' '));

  const tooLong = [];
  const suspicious = [];
  for (const e of ENDINGS){
    for (const seg of storySegmentsOf(e, baseSnap())){
      if (seg.length > STORY_SEGMENT_LIMIT) tooLong.push(`${e.id}(${seg.length})`);
      /* 快照字段名写错时，函数式正文里会冒出一个 "undefined" 出来 */
      if (/undefined|NaN|\[object/.test(seg)) suspicious.push(`${e.id}: ${seg.slice(0, 40)}`);
    }
  }
  check(`每段正文都不超过 ${STORY_SEGMENT_LIMIT} 字（一屏放得下）`,
    tooLong.length === 0, tooLong.join(' '));
  check('正文里没有 undefined / NaN（快照字段名没写错）',
    suspicious.length === 0, suspicious.join(' ｜ '));

  /* 动态段落确实用了本场数据（零分结局的第一段里有提交次数与最高分） */
  const zeroStory = storySegmentsOf({ story: s => [`提交了 ${s.submits} 次`] }, { submits: 5 });
  eq('正文支持 (snapshot) => 数组 的写法，且能读本场数据', zeroStory, ['提交了 5 次']);
  eq('没有 story 的结局解析成空数组', storySegmentsOf(null, baseSnap()), []);
  eq('story 不是数组时也解析成空数组', storySegmentsOf({ story: '文字' }, {}), []);

  /* --- 状态机 --- */
  const st = createStory(['abc', 'de']);
  eq('初始状态：停在第 0 段、一个字都没打', [st.index, st.revealed, st.finished], [0, 0, false]);
  eq('createStory 丢掉空段与空白段',
    createStory(['a', '', '   ', null, 'b']).segments, ['a', 'b']);
  check('没有正文时直接是结束态（UI 会跳过播放器）', createStory([]).finished === true);
  eq('初始进度是 1 / 2', progressLabel(st), '1 / 2');

  eq('打字机每次推进一步', visibleText(revealNext(st)), 'a');
  let typed = st;
  for (let i = 0; i < 10; i++) typed = revealNext(typed);
  eq('段尾之后停住、不会越界', [typed.revealed, visibleText(typed)], [3, 'abc']);
  check('段尾之后 isSegmentDone 为真', isSegmentDone(typed));

  eq('打字中提示「显示完整本段」', storyHint(st), HINT_SKIP);
  eq('本段完整且还有下一段时提示「继续」', storyHint(typed), HINT_NEXT);
  eq('最后一段完整时提示「揭晓成绩」',
    storyHint({ segments: ['abc', 'de'], index: 1, revealed: 2, finished: false }), HINT_LAST);
  eq('结束态没有提示与进度',
    [storyHint({ segments: [], index: 0, revealed: 0, finished: true }),
     progressLabel({ segments: [], index: 0, revealed: 0, finished: true })], ['', '']);

  /* 规则 1：打字中按键 → 显示完本段，**不跳段** */
  const typing = { segments: ['abc', 'de'], index: 0, revealed: 1, finished: false };
  const afterFirstPress = advanceStory(typing);
  eq('打字中按键：本段立刻显示完整', visibleText(afterFirstPress), 'abc');
  eq('打字中按键：不会顺手跳到下一段',
    [afterFirstPress.index, afterFirstPress.finished], [0, false]);

  /* 规则 2：本段完整时按键 → 下一段（从头开始打） */
  const afterSecondPress = advanceStory(afterFirstPress);
  eq('本段完整后按键：进入下一段并从第一个字开始打',
    [afterSecondPress.index, afterSecondPress.revealed], [1, 0]);
  eq('进入下一段后进度更新', progressLabel(afterSecondPress), '2 / 2');

  /* 最后一段之后 → 结束；再按不出变化 */
  const lastDone = { segments: ['abc', 'de'], index: 1, revealed: 2, finished: false };
  const finished = advanceStory(lastDone);
  check('最后一段完整后按键：结束', finished.finished === true);
  check('结束之后再按键没有任何变化', advanceStory(finished) === finished);
  eq('结束态不显示文字', visibleText(finished), '');

  /* 状态是不可变的：每个动作都返回新对象，不改传入的那个 */
  const before = JSON.stringify(typing);
  advanceStory(typing);
  revealNext(typing);
  eq('动作不修改传入的状态（不可变）', JSON.stringify(typing), before);
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
