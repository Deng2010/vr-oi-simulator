# VR OI 考场 · 模拟器

第一人称 3D 信息学奥赛考场模拟器：在 VR 考场里坐满 4 小时、写题、交卷，
顺便体验一下随意走动、干扰同学、和监考老师发生冲突的后果。

纯前端 · Three.js + Vite · 无后端 · 无后端接口 · 断网可玩（依赖全部本地打包）。

---

## 玩法

| 操作 | 作用 |
|------|------|
| `W` `A` `S` `D` | 移动 |
| `←` `→` | 转身 |
| `↑` `↓` | 抬头 / 低头（看显示器、看键盘都靠它） |
| `Shift` | 疾走 |
| `E` / 鼠标左键 | 交互（用电脑、草稿纸、水杯、出门）；拿着水杯时左键投掷 |
| 鼠标右键 | 拿着水杯时喝水（喝够一定次数会开出彩蛋结局） |
| `E`（按住） | 拿着水杯时放回最近的桌面 |
| `F` | 干扰同学 |
| `空格` | 出拳（老师 / 保安，后果自负） |
| `H` | 举手呼叫监考老师 |
| `Tab` / `Shift+Tab` | 在右上角的可交互对象列表里切换选中项 |
| `Esc` | 设置 / 暂停 |

比赛 4 小时、4 道题、满分 400。默认时间流速 15×，可在设置里调到 60×。

界面分成三块：**左上**是总分与每题得分，**正上**是「灵动岛」（计时器 +
警告次数 / 击倒保安数，后两者为 0 时不上岛；比赛中解锁的成就会在时间下方
短暂多出一行），**右上**是当前可交互对象（`Tab` / `Shift+Tab` 切换）。
警告时屏幕边缘闪黄光、击倒老师或保安闪红光、喝水闪蓝光并短暂显示喝水次数。
考生和监考老师只有**正对着**时才会进入可交互列表；保安不受这个限制。
电脑、草稿纸、水杯必须**光标对准**才能交互，其中水杯因为体积小，判定范围
比另外两件桌面物件略宽。

一局的 4 道题是**随机抽**的，抽完按难度从易到难排好（题目列表、HUD、桌面显示器都照这个顺序），
但不保证正好是「1 简单 1 较难 1 难 1 很难」—— 抽到两道同难度的题很正常。
**难度本身在游戏里不显示**，玩家只能从题目顺序感受梯度。

**评测分两阶段**：赛中在电脑上提交，跑的是**预测试**（每题 10 个点，当场出分，
HUD 上的总分也标着「预测试」）；交卷离场后评测机跑**系统测试**（每题 20 个点，
结算界面里逐点揭晓）。**最终成绩以系统测试为准** —— 预测试的数据弱、整体偏乐观，
所以系统测试通常比预测试低几分，偶尔也会因为预测试卡得过严反而涨一点。

---

## 快速开始

```bash
npm ci
npm run dev          # http://127.0.0.1:5173
```

构建与本地预览：

```bash
npm run build        # 产物在 dist/
npm run preview      # 预览构建产物
```

### 全部脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发服务器（HTML 局部模板改动会自动刷新） |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览 `dist/` |
| `npm run lint` | ESLint（`src/` 只给浏览器全局变量，`no-undef` 必须零错误） |
| `npm test` | 回归测试：评分/NPC 确定性、题面哈希、资产、DPR 策略、静态合批、水杯物理、交互目标判定、依赖方向、结局与统计（389 项断言） |
| `node tools/smoke-test.mjs` | 真浏览器端到端冒烟测试（50 项断言，需先 `npm run build`） |
| `node tools/smoke-test.mjs --dev` | 同上，但跑源代码（68 项断言，需另开 `npm run dev`） |
| `npm run bake:assets` | 重新生成 `assets/textures/*.webp`（幂等） |
| `npm run verify` | `lint` + `test` + `build` 一把梭 |

---

## 目录结构

```
index.html            41 行的外壳：meta + 首屏关键样式 + 局部模板 include
assets/               静态资产（贴图由 npm run bake:assets 生成并提交）
build/                Vite 插件（HTML 局部模板内联）
src/
  main.js             入口
  core/               工具 / 确定性随机 / 全局状态 / 设置 / 性能与 DPR 策略 / 输入 / 主循环
  render/             渲染核心、材质缓存、静态合批、屏幕与烘焙贴图
  models/             3D 模型构建（房间 / 课桌 / 人物 / 保安）
  world/              场景组装、实体注册表、碰撞
  systems/            评分器、NPC 代码生成、存档、图鉴、统计、结局正文状态机、交互、各类 AI、过场
  ui/                 各界面模块 + partials/*.html
  styles/             14 个分片样式表，按原顺序 @import
  data/
    keywords.js
    problems/         题库：manifest + 每题 <id>.js / <id>.md
    endings/          结局：<id>.js（一个结局一个文件）+ index.js + select.js
tests/                回归测试与行为基线
tools/                冒烟测试、贴图烘焙
docs/REFACTOR-PLAN.md 重构方案与实施记录（含全部实测数据）
```

---

## 加一道题

1. 把题面写成 `src/data/problems/<题号>.md`（Markdown）；
2. 建 `src/data/problems/<题号>.js`：

   ```js
   import { STARTER_TEMPLATE } from './template.js';
   import desc from './<题号>.md?raw';

   export default {
     id: '<题号>', name: '题名', max: 100, tl: '1.0s', ml: '256MB',
     starter: STARTER_TEMPLATE, desc,
   };
   ```

3. 在 `src/data/problems/manifest.js` 的 `PROBLEM_MANIFEST` 里补一行元数据 ——
   除了 id / 名称 / 分值 / 时空限制，还要给 `keywords`、`hints`（题目差异化评分用的
   特征词与代码片段）以及 `difficulty`（1~4）：
   **题号连续的 4 道题从前到后依次为 1~4**（清单本来就是按场次成组排的）。
   难度只用来把一局的题目列表排成「易 → 难」，**界面上一律不显示**，
   所以别把它写进任何 `src/ui/`、`src/styles/` 或显示器贴图的代码里
   （`npm test` 有一条静态断言盯着这件事）。

题面与起手代码会各自单独成为一个按需加载的 chunk，不会进首屏。
`npm test` 会检查清单与文件是否配对（但不会校验新题面的哈希——基线只覆盖已有题目）。

---

## 加一个结局

结算时开哪个结局，由「统计快照」决定；`npm test` 会检查配置是否合法。

1. 新建 `src/data/endings/<id>.js`（**一个结局一个文件**），导出配置对象：

   ```js
   export default {
     id: 'perfect-attendance',
     stage: 'final',        // final（跑完系统测试再判）| immediate（当场作废、不跑评测）
     priority: 35,          // 越大越先判
     badge: '结局 · 全勤',   // 揭榜上的小徽章
     title: '全 勤 选 手',
     tone: 'fun',           // good | bad | warn | fun | neutral（配色）
     voidScore: false,      // immediate 结局必须是 true
     condition: s => s.warns === 0 && s.bathroomTrips === 0,
     subtitle: s => `零警告、零离座，用时 ${Math.round(s.elapsed / 60)} 分钟。`,
     story: [               // 全屏正文：一段一个元素，逐段打字机播放
       '四道题的数据跑完，挂钟才走了一小时。',
       '你没有去过洗手间，也没有被监考老师叫住过一次。'
     ]
   };
   ```

2. 在 `src/data/endings/index.js` 的 `ENDINGS` 里加一行 import + 注册
   （测试会比对「文件数 == 注册数」，忘了加会红）。

`story` 至少 3 段、每段不超过 120 字（`npm test` 会用基准快照逐段检查）。
正文要引用本场数据就写成 `story: s => [...]`。

判据能读的字段，就是 `src/ui/ending.js` 的 `endingSnapshot()` 合并出来的那份快照；
要新增数据请在触发点埋点：`bump('npcDisturbed')` / `recordEvent('drink', '喝了一杯水')`
（`src/systems/stats.js`）。约束与细节见 [`AGENTS.md`](AGENTS.md) 的 §5.6 / §5.7。

新结局第一次被开出来之后，会自动出现在启动屏的「展示墙」里 —— 不需要额外配置。

---

## 发布

两条链路：**nightly 自动发，正式版人工发。**

### nightly：每次 push 到 `main` 自动构建

`nightly.yml` 跑一遍完整门禁（lint + 回归测试 + 浏览器冒烟测试），再构建并滚动发布到
一个**预发布**上 —— 固定地址，内容永远是最新的 `main`：

<https://github.com/Deng2010/vr-oi-simulator/releases/tag/nightly>

产物版本号形如 `1.1.0-nightly.20261011.c24bfaa`（`package.json` 本身不动），
包里是完整静态站点，解压后用任意静态服务器打开即可 —— 别双击 `index.html`，
ESM 会被 file:// 拦下：

```bash
unzip vr-oi-simulator-nightly-*.zip -d vr-oi-nightly
npx --yes serve vr-oi-nightly
```

nightly **不碰 GitHub Pages**：Pages 每次部署都是整站替换，nightly 上去就会把正式版盖掉。
（副作用：每次 push 都会重建这个预发布，仓库 watcher 会收到通知。）

### 正式版：人工在网页上发布 Release 才发布

```bash
npm version minor          # 同步 package.json 版本号，并打一个本地 tag
git push origin main
git push origin --tags     # 只触发 ci.yml 做校验（tag ≡ package.json 版本），不发布
```

然后到 **Releases → Draft a new release**，选/建 tag `v1.2.0`，点 **Publish release**。
这一步才会触发 `release.yml`：校验版本 → lint + 测试 → 构建 → 发布 Pages。
**推 tag 本身不会发布任何东西**，发布永远需要有人在网页上点一次。

首次使用需要在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

| 工作流 | 触发 | 做什么 |
|--------|------|--------|
| `ci.yml` | PR / push `main` / push tag `v*` | lint + 回归测试 + 构建 + 浏览器冒烟测试（**不发布**） |
| `nightly.yml` | push `main` / 手动触发 | 门禁 + 构建 → 滚动更新预发布 `nightly`（tag 固定） |
| `release.yml` | **人工发布 Release** | 校验 tag ≡ 版本 → 构建 → 发布 GitHub Pages |

---

## 实现要点

- **评分是确定性的两阶段伪评测**：`hashStr` + `mulberry32` 组成唯一的随机源
  （`src/core/rng.js`），同样的代码永远得到同样的分数，反复提交刷不了分。
  赛中提交跑**预测试**（每题 10 个点，本地即时出分，只作参照）；
  交卷 / 时间到跑**系统测试**（每题 20 个点，**最终成绩**，在结算界面逐点揭晓）。
  系统测试的分数是在预测试分数上叠确定性漂移，所以两阶段相关但不相等 ——
  预测试满分不等于最终满分。
  改这两个函数会让历史分数失效，`npm test` 会立刻发现（快照 + 语义判据两道守卫）。
  评分不看「关键字出现过没有」就算数：长度分只数有效代码行（注释灌水不加分），
  关键字分按代码规模打折、并优先匹配每题自己的特征词。
- **题面按需加载**：一局只抽 4 道题，就只下载 4 份题面。
- **静态网格合批**：世界装配完成后按材质合并静态网格（204 → 120），
  人物 / 老师 / 保安与可交互物体不参与合批 —— 人物的手臂、头每帧都在被 AI 旋转，
  腿组还要切换可见性，所以必须整棵子树排除。
- **自适应分辨率**：帧率不足时自动把 pixelRatio 从 1.5 降到 1.0（降档 2 个慢窗口、
  升档 4 个快窗口，带滞回防震荡）；决策是纯函数，有单测覆盖。
- **统计系统**（`src/systems/stats.js`）记录本场的各类数据与**事件流**
  （殴打老师、偷用他人电脑、喝水、去洗手间、提交、被警告…），
  只记「别处没有真源」的东西，结算时与 `core/state.js` 里的分数/警告合并成一份快照。
- **结局系统**（`src/data/endings/`）**一个结局一个文件**：按快照 + 优先级挑出唯一结局。
  分两个阶段：`immediate`（屏蔽词 / 被保安抓走 / 五次走动 / 作弊 —— 当场作废、
  不跑系统测试）与 `final`（AK / 交白卷 / 零分 / 闪电交卷 / 考场战神 / 时间到 /
  喝水彩蛋 / 完赛兜底）。判定逻辑是纯函数，每个结局都有单测判据。
- **水杯可以拿在手上**：按住 E 捡起后跟随视角，左键投掷、右键喝水；
  砸中老师会放倒他并招来保安，砸中其他选手等于一次干扰（对方起身找老师），
  砸到任何实体 / 墙体 / 课桌都会按法线反弹。投掷物理的判据在
  `src/systems/cup-physics.js`，是纯函数，不依赖浏览器。
- **结局正文是全屏分段打字机**：裁决出结局后先播正文、播完才揭榜。
  打字过程中按任意键立刻显示完整本段，本段完整后按任意键进入下一段
  （两条规则在 `src/systems/story.js`，纯函数 + 单测；打字机走 `setTimeout`，
  因为无头浏览器里 rAF 不触发）。
- **成就 / 结局展示墙**：启动屏的「展示墙」分页陈列**已经解锁**的成就与结局，
  没达成的不渲染（不是靠 CSS 藏 —— 名字本身就是剧透）。
  解锁记录存在本机 `oi_profile_v1`，与比赛存档 `oi_save_v8` 分开：
  交卷会清比赛存档，图鉴则一直留着、跨场次累积（`src/systems/profile.js`）。
- **音效是程序化合成的**（WebAudio），仓库里没有任何音频文件。

更详细的设计取舍、体积与性能对照数据见 [`docs/REFACTOR-PLAN.md`](docs/REFACTOR-PLAN.md)。

---

## 浏览器要求

需要 WebGL。桌面 Chrome / Edge / Firefox / Safari 均可（已针对 Chromium 做过
端到端冒烟测试）。移动端能打开，但操作手感是为键鼠设计的。

## 许可

MIT，见 [LICENSE](LICENSE)。
