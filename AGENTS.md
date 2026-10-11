# AGENTS.md

面向在本仓库里工作的 AI 编码代理（人也可以读）。

目标：让你**不必先读完 4200 行代码**就知道该跑什么命令、哪些东西绝对不能碰、
以及前面的人踩过哪些坑。

> 先读这两个，本文不重复它们的内容：
> - [`README.md`](README.md) —— 玩法、脚本、目录结构、加题步骤、发布流程
> - [`docs/REFACTOR-PLAN.md`](docs/REFACTOR-PLAN.md) —— 重构设计取舍 + 全部实测数据
>
> 本文只写「改代码时一定会用到、但从代码里读不出来」的东西。

---

## 0. 三十秒交代

- 纯前端 3D 游戏：**Three.js r128 + Vite 5**，无后端、无 UI 框架、无 TypeScript。
- `src/` 下 **71 个 ESM 模块 / 约 4780 行**，全部是浏览器端代码。
- 界面拆成 10 个 HTML 局部模板（`src/ui/partials/*.html`）：1 个常驻层（画布 + HUD + Toast）
  + 9 个互斥的全屏覆盖层；由 `build/vite-plugin-html-partials.mjs` 在开发与构建时
  内联回 `index.html`（语法：`<!--#include src/ui/partials/xxx.html -->`）。
- 样式是 11 个 CSS 分片 + 1 个入口 `src/styles/index.css`，由入口**按固定顺序** `@import`。
- 计分是**确定性的伪评测**（不真编译代码）：分数只由「代码 + 题号」的哈希决定，
  与 `Math.random()` 无关（详见 §4.1）。
- 一局只抽 4 道题，题面与起手代码按题懒加载（16 个独立 chunk）。

---

## 1. 命令

环境：Node ≥ 20（`package.json` 的 `engines`）。首次：`npm ci`。

| 命令 | 作用 | 期望结果 |
|------|------|----------|
| `npm run dev` | 开发服务器 | <http://127.0.0.1:5173>（`strictPort`，被占用会直接失败） |
| `npm run build` | 生产构建 | 产物在 `dist/`；`three` 单独成一个 chunk |
| `npm run preview` | 预览 `dist/` | <http://127.0.0.1:4173> |
| `npm run lint` | ESLint | **0 error / 0 warning** |
| `npm test` | Node 回归测试（无需浏览器） | **223 项断言全部通过** |
| `npm run smoke` | 真浏览器端到端（需先 build） | **33 项断言 + 控制台零错误** |
| `npm run smoke:dev` | 同上但跑源码 | **40 项断言**（需另开 `npm run dev`） |
| `npm run bake:assets` | 重新烘焙静态贴图 | 幂等；产出 `assets/textures/*.webp` |
| `npm run verify` | lint + test + build | 无需浏览器的门禁 |
| `npm run verify:full` | verify + smoke | 完整门禁 |

冒烟测试默认连 `http://127.0.0.1:5173/`；开发服务器换端口时用
`DEV_URL=http://127.0.0.1:5174/ npm run smoke:dev`。

**浏览器从哪来**：`tools/smoke-test.mjs` 会依次找 `CHROME_PATH`、
系统安装的 Chromium/Chrome、以及 Playwright/Puppeteer 的缓存目录
（CI 里用 `npx playwright install chromium` 提供）。**项目本身不依赖 playwright 包**。

---

## 2. 完成定义（DoD）

改完代码，下面这些必须全绿才算做完：

```bash
npm run lint          # 0 error / 0 warning
npm test              # 223 项断言
npm run build
npm run smoke         # 33 项断言 + 控制台零错误
```

**按改动类型追加**：

| 你改了什么 | 必须额外做 |
|------------|-----------|
| 场景 / 模型 / AI / 动效 | 跑一次 `npm run smoke:dev`（多出的 7 项是 dev-only 的场景完整性检查，`npm run smoke` 里不存在） |
| `src/render/texture-painters.js` 或 `assets/textures/` | `npm run bake:assets`，**并把新的 `.webp` 一起提交** |
| `src/data/problems/*.md` | `npm test` 会比对题面 SHA-256；**有意改题**要同步更新 `tests/problem-hashes.json` |
| 评分 / 随机数相关 | 见 §4.1，改之前先想清楚要不要更新 `tests/baseline.json` |
| 新增 `src/` 模块 | 确认 `npm test` 的「无循环 import」断言仍然通过 |

### 验证纪律（这个项目用血换来的）

1. **先写判据，再动手。** 修 bug 之前先写一条「在 bug 版代码上会失败」的断言。
   写完务必**把代码临时改回 bug 版跑一遍**，确认它真的红了 ——
   否则你写的可能是一条永远为真的假绿断言。
2. **测试要隔离多条防线。** 曾有 11 项单测在 bug 版代码下全绿，
   因为它们依赖了同一 bug 的第二条保护。现在每条保护都有独立用例。
3. **用不会骗人的指标。** 固定视角下的 `renderer.info.render.calls`
   会被视锥剔除严重干扰。**错误指标会把 bug 当成优化成果**（§4.4 就是实例）。

---

## 3. 架构地图

```
index.html ── 41 行外壳：meta + 首屏关键样式 + 10 条 include
   └── src/main.js ── 唯一入口：initGraphics → 抽题 → buildWorld → bindEvents → animate
```

| 目录 | 职责 | 关键文件 |
|------|------|----------|
| `src/core/` | 工具 / 确定性随机 / 全局状态 / 设置 / 性能 / 输入 / 主循环 | `rng.js` `state.js` `loop.js` `perf.js` `perf-policy.js` |
| `src/render/` | 渲染核心、材质缓存、**静态合批**、屏幕与烘焙贴图 | `gfx.js` `batch.js` `materials.js` |
| `src/models/` | 3D 模型构建（房间 / 课桌 / 人物 / 保安） | `person.js` `desk.js` |
| `src/world/` | 场景组装、实体注册表、碰撞 | `world.js` `entities.js` |
| `src/systems/` | 评分、NPC 代码生成、存档、交互、各类 AI、过场 | `scoring.js` `npc-codegen.js` `npc.js` `guards.js` |
| `src/ui/` | 各界面模块 + `partials/*.html` | `editor.js` `verdict.js` `panels.js` |
| `src/data/` | 关键字表、题库（清单 + 每题 js/md）、抽题与难度排序 | `problems/index.js` `problems/manifest.js` `problems/selection.js` |
| `src/audio/` | WebAudio 程序化音效（**仓库里没有任何音频文件**） | `audio.js` |
| `tests/` | 回归测试与行为基线 | `run.mjs` `baseline.json` `problem-hashes.json` |
| `tools/` | 冒烟测试、贴图烘焙、浏览器 profile 管理 | `smoke-test.mjs` `bake-assets.mjs` `lib/chrome-profile.mjs` |

**关键数据流**

- 抽题：`pickProblems()`（`problems/selection.js`）从清单随机抽 4 道，
  **按难度升序**返回 —— 名单顺序就是题目列表 / HUD / 显示器贴图的顺序。
  难度组合不固定为 1~4（从 16 道里均匀抽），且**难度字段不进界面**。
  抽题只返回**清单元数据**（id/名称/分值/时空限制）；
  题面与 `starter` 在 `loadProblemData(id)` 时才下载 → 所以首屏代码**不能**读 `problem.desc` / `problem.starter`。
- 渲染：`core/loop.js` 的 `animate()` 按 `state.view` 裁剪更新与渲染
  （IDE / 草稿纸等覆盖层视图会**跳过 render**，`VIEW_NO_RENDER`）。
- 计分：赛中 `ui/verdict.js` → `systems/scoring.js` `judgePretest()`（10 点，预测试）
  → `systems/score.js` → HUD（标着「预测试」）+ 显示器贴图；
  交卷后 `ui/ending.js` → `judgeSystem()`（20 点，最终成绩，逐点揭晓）→ 结算总分与成就。

---

## 4. 不可破坏的约束

每条都给「为什么」和「谁来守」。**不要绕过守卫，要改就一起改。**

### 4.1 计分与 NPC 代码生成的确定性

- **约束**：`src/core/rng.js` 的 `hashStr` / `mulberry32` 是**评分与 NPC 代码生成的唯一随机源**
  （全项目只有这一份实现），实现与调用方式都不可改；
  `systems/scoring.js` 与 `systems/npc-codegen.js` 只能从这里 import。
- **注意区分**：玩法层大量使用 `Math.random()`（抽题、保安出现角度、人物相位、音效抖动、
  NPC 行为…），那是**故意不确定**的，不受本条约束。本条只锁「同样的代码必须得到同样的分数」这条线。
- **为什么**：分数由 `hashStr(code + prob.id + '|阶段')` 决定 —— 同样的代码永远得同样的分
  （反复提交刷不了分），NPC 生成也靠它保持稳定。改一个比特，历史分数与存档全部失效。
- **评测分两个阶段**（都在 `systems/scoring.js`）：赛中提交跑 `judgePretest()`（10 个点，
  本地即时出分，只作赛中参照）；交卷 / 时间到跑 `judgeSystem()`（20 个点，**最终成绩**）。
  system test 不另掷骰子，而是在 pretest 分数上叠确定性漂移 —— 两阶段必须相关，
  否则「预测试」就没有参考意义。改评分曲线就是改这条线，见下面两条守卫。
- **守卫 1（快照）**：`tests/run.mjs` 比对 `tests/baseline.json`
  （pretest 24 组逐字段 + system 24 组点数/分数/逐点状态 + NPC 生成 15 组逐字节）。
  快照只证明「没有意外漂移」，**不证明「算得对」**。
- **守卫 2（语义判据）**：`tests/run.mjs` 的「评测器语义判据」一节才是正确性判据 ——
  注释灌水必须低于认真解、加 150 行注释不得改变基础分、关键词堆砌不得高于认真解、
  每题特征词都来自全局词表、抖动幅度有界且平均不偏高。这几条在旧评分器上会红。
- **如果你确实要改评分行为**：先改代码，再显式重冻评分快照 ——
  `node tests/capture-judge-baseline.mjs`（**只重冻 judgment / systemJudgment**，
  npc 与题库清单原样保留），并在提交信息里说明为什么。
  `node tests/capture-baseline.mjs <重构前的 git rev>` 是另一回事：它按 git 版本
  重建全部三节，只在「搬运旧实现」时用，**改评分时不要跑它**（会把 judgment 退化成旧行为）。
- **改评分就要想存档**：`oi_save_v8` 里存了 `code`，所以 `tryLoadSave()` 会用新规则
  重算每题分数（旧口径的分数不可比）。改评分时别把这条迁移路拆掉。

### 4.2 题面文本

- **约束**：`src/data/problems/<id>.md` 是题面唯一真源，内容不得在重构/搬运中被改动。
- **为什么**：题面是引自洛谷的原题，一个错别字都是事故。
- **守卫**：`tests/problem-hashes.json` 存了每道题的 SHA-256 与长度。
  有意修改题面时，必须同步更新这个文件，**并在提交信息里说明改了哪道题**。

### 4.3 ESM 导入绑定是只读的 —— 可变状态一律走 setter

- **约束**：在别的模块里 `renderer = …` / `teacher = null` / `forceRedraw = true` 会**直接 TypeError**。
- **为什么**：`import` 绑定只读，这是 ESM 规范，不是风格问题。
- **现有入口**（加新共享可变状态时照这个模式）：

  | 状态 | 声明处 | 写入口 |
  |------|--------|--------|
  | `scene/camera/renderer/clock` | `render/gfx.js` | `initGraphics()` |
  | `turnSpeed/smoothAmount/timeScale` | `core/settings.js` | `setTurnSpeed/setSmoothAmount/setTimeScale` |
  | `yawTarget/pitchTarget` | `core/settings.js` | `setYawTarget/setPitchTarget/setLookTarget` |
  | `teacher` | `world/entities.js` | `setTeacher()` |
  | `forceRedraw` | `core/loop.js` | `requestRedraw()` |
  | 场景规模统计 | `core/perf.js` | `setSceneStats()` |

- **守卫**：`npm run lint`。`src/` 只配置了浏览器全局变量，`no-undef` 0 error
  就等于「模块接线是完整的」—— 这也是为什么**不要**为了让 lint 过关而往 `globals` 里塞名字。

### 4.4 会动的物体必须排除静态合批 ⚠️ 最容易再犯

- **约束**：`mergeStaticMeshes(scene, { dynamicRoots })` 必须收到**真正的 `THREE.Object3D`**。
- **为什么（真实事故）**：`buildPerson()` / `buildSecurityGuard()` 返回的是**包装对象**
  `{ group, armL, armR, head, legsSit, legsStand }`，**不是** `Object3D`。
  第一版合批把这些包装对象传给 `dynamicRoots`，而判定是沿 `Object3D` 的 parent 链做引用匹配 ——
  包装对象永远不在那条链上，于是 6 个人物和监考老师全被烘进静态几何体：
  腿组 `visible` 切换失效（**露出 4 条腿**）、老师模型**冻在原地**与真实坐标脱节。
- **三层防线**（任一单独生效都能挡住）：
  1. `batch.js` 会解析 `ref.group`，解析不出来**直接抛 `TypeError`**（不再静默误合批）；
  2. `person.js` / `guard.js` 在自己的 **Group** 上打 `userData.dynamic = true`
     （打在 Group 上，不能打在包装对象上 —— `world.js` 会把包装对象的 `userData` 整体换成 NPC 状态）；
  3. `world.js` 显式传 `npcs.map(n => n.group)`，DEV 下 `skippedDynamic === 0` 会打印告警。
- **健康指标**：`skippedDynamic` **应为 66**（6 个人物 × 11 部件）。变成 0 就是又犯了这个 bug。
- **人物为什么不能合批**：`armL` / `armR` / `head` **每帧都在被 AI 旋转**
  （`systems/npc.js`、`guards.js`、`teacher.js`），腿组还要切换可见性。
- **守卫**：`tests/run.mjs` 13 项单测（分别隔离两条判据，并断言「判据都缺失时一定会误合批」）
  + `npm run smoke:dev` 的 7 项端到端断言（恰好可见一组腿 / 腿组网格数 4 与 2 / 老师根节点有网格 / 老师位置随时间变化）。
- **新增任何会移动或改可见性的物体，必须走同一条路**：给 Group 打 `userData.dynamic`，
  并把它加进 `world.js` 的 `dynamicRoots`。

### 4.5 存档键名与字段是兼容契约

- `oi_view_v8`（视角/音量设置）、`oi_save_v8`（比赛进度）**不要改名**，
  字段增删要同时改 `systems/save.js` 的 `persistSave` 与 `tryLoadSave`，
  并保证旧存档能读（`tryLoadSave` 对缺字段是宽容的）。
- 存档恢复依赖 `PROBLEM_BY_ID`（来自清单，不需要懒加载），不要改成读题面。

### 4.6 Three.js 锁在 r128

- **不要顺手升级**。r15x+ 把光照默认值改成物理正确、`outputEncoding` → `outputColorSpace`，
  画面会整体变化，需要独立的视觉迁移与比对。升级是一次**单独的任务**。

### 4.7 无循环 import

- 两个历史循环依赖已修好，改架构时别再造出来：
  - **走廊 ↔ 洗手间**：两个过场模块**互不认识**。`corridor.js` 只登记
    `takePendingArrival()`，`bathroom.js` 只登记 `takePendingExit()`，
    由 `core/loop.js` 仲裁去向。加新过场照抄这个模式。
  - **保安 ↔ 结算**：保安注册表与存活统计在 `world/entities.js`（实体层），
    所以 `ui/ending.js` 只依赖实体、`systems/guards.js` 依赖 `endContest`。
- **守卫**：`npm test` 会 DFS 整个 `src/` 报出循环。

### 4.8 CSS 分片顺序不能改

- `src/styles/index.css` 的 `@import` 顺序 = 原 `index.html` 内联 `<style>` 的行区间顺序。
  同优先级选择器的层叠结果依赖它。**新增分片请追加在末尾**，不要插队。

### 4.9 静态资源走 `import`，没有 `public/`

- `vite.config.js` 里 `publicDir: false`；`assets/` 下的东西通过 `import` 引入，
  由打包器做内容哈希 + 长缓存。`base: './'` 是为了项目站点子路径部署。
- 因此**没有** `/assets/xxx` 这种运行时硬编码 URL（除了 `index.html` 里的 favicon，
  它由 Vite 的 HTML 处理改写）。新增资源请 `import` 它。

---

## 5. 常见任务

### 5.1 加一道题

三个文件，缺一不可（`npm test` 会检查配对）：

1. `src/data/problems/<题号>.md` —— Markdown 题面正文；
2. `src/data/problems/<题号>.js` —— 元数据 + `import desc from './<题号>.md?raw'`；
3. `src/data/problems/manifest.js` 里补一行元数据，**连同 `keywords` / `hints` / `difficulty`**：
   - `keywords` / `hints`：题目差异化评分用的特征词与代码片段（§4.1）；
   - `difficulty`：1~4，**题号连续的 4 道题从前到后依次为 1~4**（清单按场次成组排）。
     它只用于把一局的题目列表排成易→难（`selection.js`），
     **界面一律不显示** —— `npm test` 有一条静态断言：这个字段只准出现在
     `manifest.js` 与 `selection.js` 里，别处引用（含显示器贴图）都会红。
   - 抽题规则本身（一局 4 道、按难度升序、难度组合不强制 1~4）也在 `selection.js`，
     刻意避开 `index.js` 的 `import.meta.glob`，好让 `tests/run.mjs` 直接单测这条规则。

模板见 `README.md`。新题目会各自成为一个按需加载的 chunk，不会进首屏。
注意 `npm test` 的哈希断言只覆盖**已有题目**，新题不在其中。

### 5.2 新增会动 / 可交互的物体

| 类型 | 做法 |
|------|------|
| 会移动或切换可见性 | Group 上打 `userData.dynamic = true`，并加进 `world.js` 的 `dynamicRoots`（§4.4） |
| 可交互（射线拾取） | 在**网格自己**身上设 `userData.interact = { label, action }`，并推进 `interactables`；合批会自动跳过它 |
| 透明材质 | 合批会自动跳过（排序敏感），不用特殊处理 |
| 想彻底不参与合批 | 设 `userData.noBatch = true` |

> 交互分两种手感，**不要统一**：
> - **E / F 是按住确认**（VR 指针手感）：按下后准星进度环走满 `HOLD_SECONDS`（0.3s）
>   才执行，松手 / 换目标 / 丢焦点一律取消。改动这块要同时照顾四处：
>   `systems/interaction.js`（`beginInteractHold` / `updateInteractHold` / `cancelInteractHold`
>   与提示文案）、`ui/crosshair.js`（环的进度）、`core/loop.js`（每帧推进 + 离开世界视图时清零）、
>   `core/input.js`（keydown **和** keyup 两侧 —— 只接 down 会让按键卡住）。
> - **空格（攻击）是按下即生效**：走 `attackNow()`，不蓄力、**不显示进度环**、
>   不依赖 keyup，而且**照收键盘自动重复** —— 按住不放就该持续出手
>   （保安走进范围的那一刻会被下一发打掉，不必松手重按）。
>   出手节奏由 `ATTACK_INTERVAL`（0.25s）限住：每拳会在 0.9s 后补进 2 名保安，
>   输入层完全不限速的话按住两秒能刷出上百名保安把游戏拖死。
>   注意**不要在 `input.js` 里用 `e.repeat` 过滤空格**，那会把「按住连打」一起挡掉
>   （踩过：玩家反馈「按着空格、保安走到脸上也不出手」）。
>   `npm test` 有三条静态判据钉住这条接线（真跑一遍要先放保安，会把冒烟测试后续步骤打乱）。
> 另外环的 `stroke-dasharray` 由 `crosshair.js` 按 `getTotalLength()` 现算：
> 改准星尺寸时若只改 CSS 宽高、忘了改 SVG 的 `viewBox`/`r`，弧长就会对不上，
> 没按任何键也常驻一小段弧（冒烟测试有一条断言钉这个不变量）。

### 5.3 新增一个界面面板

1. `src/ui/partials/<name>.html`（然后在 `index.html` 加一条 `<!--#include ... -->`，注意顺序）；
2. `src/styles/<name>.css` + 在 `src/styles/index.css` **末尾** `@import`；
3. `src/ui/panels.js` 里加 `openXxx/closeXxx`，把新视图名加进 `core/loop.js` 的
   `VIEW_NO_RENDER`（否则世界会在遮罩下面白渲染）；
4. 在 `core/input.js` 的 Esc 分支里接上关闭逻辑；
5. 元素引用统一放 `src/ui/dom.js`。

> 例外：启动屏（`src/ui/partials/start.html`）不是「一个视图一个覆盖层」，
> 而是 `#start` 内的三个 `.start-page` 分页（简介 / 设置 / 关于），
> 由 `src/ui/start.js` 的 `showStartPage()` 按 `data-start-page` 切 `.hidden`。
> 加分页时同步补上 `START_PAGES`、选项卡按钮与冒烟测试的分页断言。

### 5.4 改静态贴图（黑板 / 出口牌 / 键盘）

1. 改 `src/render/texture-painters.js` 里的绘制函数（**纯 Canvas2D，不许 import THREE**）；
2. `npm run bake:assets` 重新烘焙；
3. 提交更新后的 `assets/textures/*.webp`。

`assets/textures/` 是**构建产物但必须提交**：CI 会检查文件存在，缺失直接失败。
显示器画面与草稿纸依赖实时数据/用户输入，**保持运行时绘制**，不要烘焙。

### 5.5 调性能：先量，再改

```bash
npm run dev          # 一个终端
npm run smoke:dev    # 另一个终端：会打印网格数、合批组数、skippedDynamic、frameMs
```

- **看「场景网格数」**（198 → 114），不要看固定视角的 draw call（§2 验证纪律 3）。
- `src/core/perf.js` 的 `perfStats` 只在 dev 存在（`import.meta.env.DEV` 守卫，
  生产构建里会被 Rollup 摇掉，且有断言守着）。要加指标就加在这里。
- DPR 自适应策略在 `src/core/perf-policy.js`，是**纯函数 + 独立单测** ——
  改策略请改那个文件并补用例，不要去动 `perf.js` 里的采样。

---

## 6. 陷阱清单

1. **注释里出现 `*/` 会提前闭合块注释。** 写 `.chrome-*/` 这种通配路径时尤其容易中招
   （本项目真踩过，导致 ESLint 报 `Unexpected token $`）。
2. **无头 Chromium 在本环境里 `requestAnimationFrame` 一次都不触发。**
   冒烟测试因此注入了一个 `setTimeout` 版的 rAF 垫片。
   所以：**永远不要为了测试在产物代码里加分支** —— 测试侧能解决的就别污染产物。
3. **`?raw` 与 `import.meta.glob` 是 Vite 专属。** 任何被 `tests/run.mjs` 直接
   `import` 的模块都不能用它们（在 Node 里会解析失败）。这就是
   `tests/run.mjs` 只 import `manifest.js`、而 `PROBLEM_BY_ID` 放在 `index.js` 的原因。
4. **`git checkout <file>` 会连你未提交的修复一起丢掉。** 做「bug 版 vs 修复版」对照实验时，
   用 `cp` 备份到 `/tmp` 再还原，别用 `git checkout`（本项目真踩过）。
5. **桌面显示器贴图读的是共享起手模板**，不是 `state.problems[0].starter`。
   后者在懒加载后首屏根本不存在 —— 不要改回去。
6. **首屏代码不能读 `problem.desc` / `problem.starter`**（§3 数据流）。
   需要起手模板时 import `src/data/problems/template.js` 的 `STARTER_TEMPLATE`。
7. **`import.meta.env.DEV` 守卫的探针在生产构建里必须消失**，冒烟测试对此有断言
   （dist 跑 33 项、dev 跑 40 项，差的就是这些 dev-only 检查）。
8. **合批发生在保安生成之前**，所以保安从来不会被合批；但 `guard.js` 仍保留
   `userData.dynamic` 标记，以防以后多合批一次。
9. **`src/` 里不要用 Node API**，也不要往 ESLint 的 `globals` 里加名字来蒙混过关。
10. **`tools/smoke-test.mjs` 里的 `pageScript()` 是跑在浏览器里的**，
    所以那个文件同时需要 Node 与浏览器全局变量（ESLint 配置里单独放开了）。
11. **`--dev` 冒烟测试需要先起 `npm run dev`**；`npm run smoke` 需要先 `npm run build`。
12. **工具会被强杀**：`tools/lib/chrome-profile.mjs` 负责「先杀浏览器、再删 profile 目录」。
    新增会拉起浏览器的工具，请复用它（`createProfile` + `trackChild` + `dispose`），
    否则会在仓库根留下 10~20 MB 的 `.chrome-*` 和一堆后台 Chromium 进程。

---

## 7. 代码风格

- **2 空格缩进**、单引号、必须有分号、不用 `var`（`.editorconfig` + ESLint 的 `no-var`）。
- 行尾 LF、文件末尾留一个换行（`.gitattributes` 强制；历史上 CRLF/LF 混用过）。
- **注释写「为什么」，不写「是什么」**。这个仓库的注释密度偏高是**有意的**：
  很多决定（为什么 rng 不能动、为什么人物不能合批、为什么走廊和洗手间不互相 import）
  从代码本身看不出来，只能靠注释留下来。
- 界面文案、注释、提交信息**都用中文**（角色名沿用 小明/小红/小刚/小强/小丽）。
- ESLint 只做**正确性**检查（`js.configs.recommended` + `no-undef`），**没有**格式规则 ——
  所以格式靠 `.editorconfig` + 约定，不要期待 `lint:fix` 帮你排版。
- 复杂函数写块注释（JSDoc 风格，`@param` / `@returns`）；简单函数不写。

---

## 8. 提交与发布

**提交信息**：中文，Conventional Commits 前缀（`fix:` / `feat:` / `refactor:` / `docs:` / `misc:`），
主题 ≤ 50 字，正文写**为什么** + **怎么验证的**。
参考历史：`git log --oneline`。

**绝对不要提交**：`node_modules/`、`dist/`、`.npm-cache/`、`.chrome-*`、`.DS_Store`
（都已在 `.gitignore` 里）。`assets/textures/*.webp` 是例外 —— **必须提交**。

**发布（只有打 tag 才会发到 GitHub Pages）**：

```bash
npm version patch        # 或 minor，同步 package.json 版本号
git push origin main
git push origin --tags   # 触发 .github/workflows/deploy.yml
```

- `main` 的推送**不会**发布，只会跑 `ci.yml`（lint + test + build + 冒烟，不发布）。
- `deploy.yml` 会强制校验 **tag ≡ `package.json` 版本**（`v1.2.0` ↔ `"1.2.0"`），
  不一致直接失败。所以**不要手改版本号后跳过着 tag 这一步**。

---

## 9. 不要做的事

- ❌ 不要升级 Three.js（§4.6）或引入 UI/状态框架。
- ❌ 不要动 `hashStr` / `mulberry32` 的实现与调用（§4.1）。
- ❌ 不要在产物代码里加仅测试用的分支（§6 第 2 条）。
- ❌ 不要为了让 lint 通过而往 `globals` 里加名字。
- ❌ 不要用固定视角的 draw call 判断合批效果（§5.5）。
- ❌ 不要把 Markdown 渲染库塞进产物 —— 题面目前原样转义进 `<pre>`；
  真要排版，请在**构建期**把 `.md` 编译成 HTML 字符串（运行时零依赖）。
- ❌ 不要烘焙显示器画面与草稿纸（依赖实时数据 / 用户输入）。
- ❌ 不要在密码/密钥上浪费精力 —— 这是个纯静态站点，没有后端也没有密钥。

---

## 10. 快速索引：改了 X，先看 Y

| 你要改的东西 | 先看 |
|--------------|------|
| 计分 / 分数曲线 | `src/systems/scoring.js` → §4.1 |
| NPC 生成的代码长什么样 | `src/systems/npc-codegen.js` → §4.1 |
| 题目内容 / 加题 | `src/data/problems/` → §5.1、§4.2 |
| 一局抽几道题 / 按难度排序 / 难度字段 | `src/data/problems/selection.js` + `manifest.js` → §5.1 |
| 房间 / 课桌 / 人物 / 保安外观 | `src/models/` → §4.4 |
| 人物腿、姿态、走路 | `src/models/person.js` + `src/systems/npc.js` → §4.4 |
| 场景里东西太多、卡 | `src/render/batch.js` → §5.5 |
| 贴图（黑板/出口牌/键盘） | `src/render/texture-painters.js` → §5.4 |
| 界面面板 / HUD | `src/ui/` + `src/styles/` → §5.3、§4.8 |
| 过场（走廊/洗手间） | `src/systems/corridor.js` + `bathroom.js` → §4.7 |
| 存档 | `src/systems/save.js` → §4.5 |
| 构建 / 部署 / 发布 | `vite.config.js`、`.github/workflows/` → §8 |
| 测试怎么写 | `tests/run.mjs`、`tools/smoke-test.mjs` → §2 |
