/* =========================================================
   回归测试（不需要浏览器）
   ---------------------------------------------------------
   目标：证明这次重构是「零行为变化」的搬运，并且把结论固化成断言。

   覆盖：
     1. 评分器确定性输出 == 重构前基线（24 组固定输入逐字段比对）
     2. NPC 代码生成 == 重构前基线（15 组）
     3. 题库清单元数据 == 重构前基线
     4. 每题 .md 题面内容哈希 == 重构前基线（防止拆分损坏文本）
     5. 共享起手模板哈希 == 重构前基线
     6. 烘焙贴图资产存在且非空
     7. src/ 无循环 import

   用法：  npm test
   ========================================================= */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { judgeUnified } from '../src/systems/scoring.js';
import { genNpcCode } from '../src/systems/npc-codegen.js';
import { KEYWORDS_LIST } from '../src/data/keywords.js';
import { PROBLEM_MANIFEST } from '../src/data/problems/manifest.js';
import { STARTER_TEMPLATE } from '../src/data/problems/template.js';
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

/* ---------- 1. 评分器确定性 ---------- */
console.log('\n▸ 评分器确定性（src/systems/scoring.js vs 重构前 judge.js）');
for (const item of baseline.judgment){
  const prob = manifestById.get(item.id);
  const out = judgeUnified(item.code, prob, KEYWORDS_LIST);
  check(`judgeUnified(${item.id}) 结果一致`, JSON.stringify(out) === JSON.stringify(item.out),
    `代码: ${item.code.slice(0, 60)}…`);
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
