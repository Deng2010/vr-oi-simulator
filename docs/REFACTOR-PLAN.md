# VR OI 考场 · 重构方案与实施记录

> 本文既是**设计方案**，也是**实施记录**：每一节先写「为什么这么设计」，
> 再写「实际怎么做的」和「实测数据」。所有数字都来自本仓库的真实构建与测试，
> 复现命令写在每节末尾。

---

## 0. 目标与约束

需求拆成 7 件事：

| # | 需求 | 落地方式 |
|---|------|----------|
| 1 | `index.html` 拆为多文件 | HTML 局部模板 + 11 个 CSS 分片 + 41 个 ESM 模块 |
| 2 | GitHub Actions 打包 | `ci.yml`：lint / 回归测试 / 构建 / 浏览器冒烟测试 |
| 3 | 只在打 tag 时推送 Pages | `deploy.yml`：`on.push.tags: v*`，并校验 tag ≡ package.json 版本 |
| 4 | 每道题目拆成 js / markdown | `src/data/problems/<id>.js` + `<id>.md`，懒加载 |
| 5 | 3D 模型放到 assets 下面 | 模型构建代码 → `src/models/`；静态贴图烘焙 → `assets/textures/` |
| 6 | 代码体积优化 | 分片、tree-shaking、题面懒加载、去重；见 §7 |
| 7 | 性能优化 | 静态网格合批、贴图/材质共享、自适应 DPR；见 §8 |

**贯穿全程的硬约束：零行为变化。**
评分器的 `hashStr + mulberry32` 决定历史分数，NPC 代码生成依赖同一个随机源，
任何一处实现漂移都会让存档与分数不可复现。所以这次重构是**纯搬运 + 可度量的优化**，
并用三层机制把它锁死（§9）。

---

## 1. 重构前现状盘点

```
index.html   3297 行 / 123,128 B   内联 <style> 19,912 B + 内联 <script> ~85 KB
judge.js        119 行 /   4,106 B
keywords.js      39 行 /   1,249 B
npc-gen.js      130 行 /   3,809 B
problems.js    1217 行 /  42,097 B   16 道题面全量内联
```

实测问题清单：

| 类别 | 具体问题 |
|------|----------|
| 结构 | 一个 3,297 行的 HTML；162 个顶层声明全在全局作用域，靠 5 个 `classic script` 的加载顺序隐式接线 |
| 重复 | `hashStr` / `mulberry32` 在 `index.html` 与 `judge.js` 中各有一份（后者被覆盖，实为死代码），而它们是**分数确定性的唯一来源** |
| 首屏 | 16 道题的题面（42 KB）无论如何都随首屏加载，一局只用 4 道 |
| 模型 | 44 处 `new THREE.Mesh` 全在运行时用图元搭；6 张课桌**各建一次** Canvas 键盘贴图、各建一个材质 |
| 首帧 | 键盘 ×6、出口指示牌、黑板共 8 处 Canvas2D 绘制挤在首帧之前 |
| 绘制 | 场景约 204 个独立 `Mesh`，每个一次 draw call |
| 依赖 | Three.js r128 从 jsDelivr 拉取：第三方可用性风险、无法离线、无 SRI |
| 工程 | 没有 `package.json` / `.gitignore` / CI；换行符 CRLF 与 LF 混用；`README.md` 只有 40 B |

---

## 2. 目标结构

```
.
├── index.html                    # 41 行的外壳：meta + 首屏关键样式 + include 指令
├── vite.config.js                # base './'、关闭 publicDir、three 单独分 chunk
├── eslint.config.js              # src/ 只给浏览器全局变量（让 no-undef 真正有用）
├── package.json
├── .gitattributes                # 仓库内统一 LF（原先 CRLF/LF 混用）
├── .github/workflows/
│   ├── ci.yml                    # PR/主干：lint + test + build + 冒烟，不发布
│   └── deploy.yml                # 仅 tag：校验版本 → 构建 → 发布 Pages
├── assets/                       # 静态资产（由打包器做内容哈希 + 长缓存）
│   ├── icon.svg
│   └── textures/                 # 构建期烘焙，命令：npm run bake:assets
│       ├── board.webp
│       ├── door-sign.webp
│       └── keyboard.webp
├── build/
│   └── vite-plugin-html-partials.mjs   # <!--#include ... --> 内联插件
├── src/
│   ├── main.js                   # 唯一入口：装配 + 启动 + 首屏兜底
│   ├── core/        util rng state settings perf perf-policy input loop
│   ├── render/      gfx materials batch screen-textures static-textures
│   │                texture-painters(构建期)
│   ├── models/      room desk person guard          ← 3D 模型构建代码
│   ├── world/       world entities obstacles
│   ├── systems/     scoring npc-codegen score save interaction player look
│   │                teacher guards banned npc warn corridor bathroom
│   ├── ui/          dom panels settings-panel toast achievements hud editor
│   │                verdict minimap paper ending
│   │                partials/*.html                 ← 10 个界面局部模板
│   ├── styles/      index.css + 11 个分片样式表
│   └── data/
│       ├── keywords.js
│       └── problems/  manifest.js template.js index.js
│                      P14962.js  P14962.md  …（16 组）
├── tests/            run.mjs baseline.json problem-hashes.json
└── tools/            smoke-test.mjs bake-assets.mjs
```

---

## 3. `index.html` 的拆法

### 3.1 外壳 + 局部模板（而不是组件框架）

`index.html` 只保留 41 行：`<head>`、首屏关键样式（避免白闪）、10 条 include 指令。

```html
<!--#include src/ui/partials/hud.html -->
<!--#include src/ui/partials/start.html -->
…
<script type="module" src="/src/main.js"></script>
```

`build/vite-plugin-html-partials.mjs`（约 50 行，零依赖）在 dev 与 build 两个阶段
把局部模板原样内联回去。这样得到三个好处：

- **产物仍是单文件入口**，不引入额外请求，也没有运行时模板开销；
- 按「覆盖层」拆分，改暂停菜单只需要动 `partials/pause.html`；
- 顺序由 `index.html` 里的 include 顺序显式决定，code review 时一眼能看出层级。

没有引入组件框架（Vue/React）：这个项目的界面是 10 个互斥的全屏覆盖层，
状态机已经写在 `src/ui/panels.js` 里，引入框架只会增加体积和一层抽象。

### 3.2 CSS 拆成 11 片，且**顺序不变**

`src/styles/index.css` 用 `@import` 按原 `index.html` 内联 `<style>` 的**原始行区间顺序**
导入 11 个分片。这一点是有意为之：CSS 层叠依赖顺序，只要顺序不变，
同优先级选择器的最终结果就与重构前逐像素一致。

### 3.3 内联 JS → 41 个 ESM 模块

拆分按「顶格声明」为边界机械切分（162 个声明），再按职责归到 41 个模块。
机械切分带来的最大风险是**跨模块写可变绑定**——ESM 的导入绑定是只读的，
原代码里 `renderer = …`、`teacher = null`、`forceRedraw = true` 这类赋值
一旦跨越模块边界就会直接报 `TypeError`。

处理方式是「**谁声明谁负责写**」，对外只暴露 setter：

| 变量 | 声明模块 | 原写入点 | 现在的入口 |
|------|----------|----------|------------|
| `scene/camera/renderer/clock` | `render/gfx.js` | `main.js` 的 `init()` | `initGraphics()` |
| `turnSpeed/smoothAmount/timeScale` | `core/settings.js` | `core/input.js` 滑条、`systems/warn.js` | `setTurnSpeed/setSmoothAmount/setTimeScale` |
| `yawTarget/pitchTarget` | `core/settings.js` | `look.js`、`corridor.js`、`input.js` | `setYawTarget/setPitchTarget/setLookTarget` |
| `teacher` | `world/entities.js` | `world/world.js`、`systems/teacher.js` | `setTeacher()` |
| `forceRedraw` | `core/loop.js` | `core/input.js` resize | `requestRedraw()` |

同时打断了两个循环依赖（用声明式检查脚本发现，现在由 `npm test` 守着）：

- `bathroom ↔ corridor`：走廊/洗手间的**去向**改由主循环仲裁 ——
  `corridor.js` 只登记 `takePendingArrival()`，`bathroom.js` 只登记 `takePendingExit()`，
  `core/loop.js` 决定切哪个视图。两个过场模块从此互不认识。
- `guards ↔ ending`：保安注册表与存活统计下移到实体层
  `world/entities.js`，`ui/ending.js` 只依赖实体，`systems/guards.js` 依赖 `endContest`，
  依赖方向单一。

> **验证**：`eslint . --rule no-undef` 零错误（说明没有漏掉的 import，也不是靠全局变量兜住的），
> `npm test` 断言 `src/` 无循环 import。

---

## 4. 题库拆分：每题 js + markdown + 懒加载

```
src/data/problems/
  manifest.js     轻量清单：id / name / max / tl / ml（进入主 chunk）
  template.js     16 道题共用的起手模板（拆分前是 problems.js 里的一个 const）
  index.js        PROBLEM_BY_ID（O(1) 查表）、pickProblems()、loadProblemData() 懒加载
  P14962.js       元数据 + import desc from './P14962.md?raw'
  P14962.md       题面正文（Markdown，唯一真源）
  …（共 16 组）
```

### 4.1 为什么是「js + markdown」而不是「全 js」或「全 md」

- 题面正文是**给人读、给人改**的：放进 `.md`，diff 干净，也能直接被编辑器预览；
- 元数据（分值、时空限制）与逻辑相关，放在 `.js` 里能和清单、类型注释待在一起；
- `.md` 通过 Vite 的 `?raw` 内联进该题的 chunk，**运行时零额外请求**，
  渲染路径与重构前完全一致（依旧是原样转义后塞进 `<pre>`）。

### 4.2 懒加载的边界画在哪里

一局只抽 4 道题，所以只下载 4 份题面。这里有一个隐藏耦合必须处理：
桌面显示器贴图原先读 `state.problems[0].starter` 来画代码预览，
而懒加载后首屏拿不到 `starter`。

解法不是「把 4 道题提前加载」，而是发现**16 道题的 `starter` 本来就是同一个
`STARTER_TEMPLATE`**（拆分前 `problems.js` 里 16 处都写 `starter: STARTER_TEMPLATE`）。
于是 `render/screen-textures.js` 直接引用共享模板，既省掉请求，输出也逐字节一致。

同理，IDE 里的「重置代码」用 `getLoadedProblem(id)?.starter ?? STARTER_TEMPLATE` 兜底。

**实测**：16 个题面 chunk 合计 38,756 B / 21,588 B(gzip)，一局只加载其中 4 个
（≈ 3.8 KB gzip），而不是把 42,097 B 全塞进首屏。

> 顺带修掉一个死代码：`hashStr`/`mulberry32` 原先在 `index.html` 与 `judge.js`
> 各有一份。现在统一收敛到 `src/core/rng.js`，`scoring.js` 与 `npc-codegen.js` 都从它 import。

---

## 5. 3D 模型与 assets

### 5.1 为什么没有 `.glb`

场景里的「模型」全部是运行时用 Three.js 图元搭出来的（`new THREE.Mesh` 44 处），
仓库里从来没有任何模型文件。所以「模型放到 assets 下面」有两种解法：

- **A. 烘焙成 `.glb` 放进 `assets/models/`**：assets 目录最彻底，但人物需要换色
  （`shirtColor` 参数）、保安需要动态生成、NPC 手臂腿部还要按状态切换姿势力，
  走资源化就得引入实例化材质或变体资源，玩法代码要改，收益却有限；
- **B. 模型构建代码迁到 `src/models/`，把可静态化的贴图烘焙到 `assets/textures/`** ← 采用

`src/models/` 现在按对象拆分：`room.js`（房间/黑板/挂钟/门窗/饮水机）、
`desk.js`（课桌+显示器+键鼠+水杯+草稿纸+椅子）、`person.js`（选手/老师，坐站两姿）、
`guard.js`（保安）。`src/world/world.js` 只负责把它们摆进世界。

### 5.2 贴图烘焙管线

```
src/render/texture-painters.js   纯 Canvas2D 绘制函数（唯一真源，不参与运行时）
        │
        │  tools/bake-assets.mjs：esbuild 打包 → 无头 Chromium 执行 → WebP
        ▼
assets/textures/{board,door-sign,keyboard}.webp     ← 提交进仓库
        │
        │  import（Vite 内容哈希 + 长缓存）
        ▼
src/render/static-textures.js     运行时加载 + 缓存（贴图与材质都共享）
```

烘焙工具不依赖 Puppeteer/Playwright：用 Node 内建的 `WebSocket` 直连
Chromium 的 DevTools 协议，`esbuild`（Vite 的既有依赖）负责打包绘制模块。
Canvas2D 不需要 GPU，所以 `--no-sandbox --disable-gpu` 的无头实例就够。

**哪些贴图能烘焙、哪些不能**（这一点决定收益上限）：

| 贴图 | 能否烘焙 | 原因 |
|------|----------|------|
| 黑板守则 | ✅ | 内容是静态文案 |
| 出口指示牌 | ✅ | 同上 |
| 键盘 | ✅ | 同上，且 6 张课桌本来各画一遍 |
| 显示器画面 | ❌ | 实时显示题目进度、得分、当前题目的起手代码预览 |
| 草稿纸 | ❌ | 用户鼠标书写，且背景是运行时生成 |

### 5.3 这一项的取舍（如实说明）

烘焙不是「纯赚」：

- **赚**：8 处 Canvas2D 绘制（含 6 次键盘）移出首帧；6 张键盘贴图 + 6 个材质
  收敛成 1 张 + 1 个；贴图可被浏览器缓存复用；字体度量在构建期固化，跨机器渲染一致。
- **赔**：首屏多下载 `board.webp` 24,640 B。PNG 无调色板时是 59,919 B，
  换 WebP q0.85 后压到 24,640 B；`door-sign`(1.2 KB) 与 `keyboard`(2.9 KB)
  因小于 Vite 默认的 4 KB 内联阈值，被打成 data URL 直接内联，零额外请求。
- **代价**：字体的最终渲染被固化在烘焙机（`Microsoft YaHei` 在 macOS 上会回退到
  系统无衬线体）。对这个「几米外看黑板」的场景，肉眼无差别（`assets/textures/board.webp`
  可直接打开核对）。

> 如果更看重首屏字节数，把黑板改回运行时绘制即可省下这 24.6 KB —— 保留
> `texture-painters.js` 就是为了让这个决定随时可以回退。

---

## 6. 构建与 CI/CD

### 6.1 Vite 配置要点

| 配置 | 值 | 理由 |
|------|-----|------|
| `base` | `'./'` | 相对路径，`/vr-oi-simulator/` 项目站点不需要写死仓库名，换路径部署也不用改 |
| `publicDir` | `false` | 资产统一走 `import`，由打包器做内容哈希 + 长缓存，避免 `public/` 与产物目录两套规则 |
| `manualChunks` | `{ three: ['three'] }` | Three.js 单独成 chunk：升级引擎不会让应用代码的缓存失效 |
| `cssCodeSplit` | `false` | 单页应用，样式合并成一个文件，少一次串行往返 |
| `define` | `__APP_VERSION__` | 版本号来自 `package.json`，发布流水线用 `APP_VERSION` 覆盖 |

### 6.2 `ci.yml`：PR 与主干只校验，不发布

`on: pull_request / push(main) / workflow_dispatch`，步骤：
依赖安装 → 校验烘焙资产存在 → **ESLint** → **回归测试** → **构建** →
产物体积写进 job summary → **真浏览器 WebGL 冒烟测试** → 上传 `dist` 工件。

冒烟测试这一步是刻意加的：ESLint 只能证明名字解析得对，
证明不了「模块接线错、初始化顺序错、懒加载路径断」。它用无头 Chromium
（SwiftShader 软渲染）真跑一遍：

```
初始化 → 开始比赛 → 计时器推进 → 低头用准星命中显示器 → E 打开 IDE
→ 题面懒加载完成 → 提交评测 → HUD 总分同步 → 离开 IDE → Esc 设置面板 → 存档写盘
```

共 18 项断言，任何一项失败或控制台出现错误都会让 CI 变红。
浏览器由 `npx playwright install chromium` 提供，`tools/smoke-test.mjs`
自己会在 `~/.cache/ms-playwright` 里找到它（项目本身不依赖 playwright 包）。

### 6.3 `deploy.yml`：只有 tag 能发布

```yaml
on:
  push:
    tags: ['v*']            # ← 唯一自动入口
  workflow_dispatch:
    inputs: { tag: {...} }  # 应急手动重发，必须显式指定 tag
```

- `main` 的推送**不会**触发本工作流，线上永远是某个 tag 的产物；
- 发布前强制校验 **tag ≡ package.json 版本**（`v1.2.0` 必须对应 `"version": "1.2.0"`），
  避免出现「站点里写着旧版本号」这种最尴尬的不一致；
- 发布路径上把 lint + 测试再跑一遍：宁可不发布，也不发布一个坏站点；
- `permissions` 只有 `contents: read` + `pages: write` + `id-token: write`；
- `concurrency: pages` 且 `cancel-in-progress: false`，不会出现发布到一半被取消的半成品；
- 额外写 `.nojekyll`，避免 Pages 的 Jekyll 处理忽略下划线开头的文件。

**首次启用需要在仓库 Settings → Pages 把 Source 设为 “GitHub Actions”。**

发布流程：

```bash
npm version patch          # 同步 package.json 版本
git push && git push --tags
```

---

## 7. 代码体积：实测对照

### 7.1 首屏

| 资源 | 重构前 | 重构后 |
|------|--------|--------|
| 入口 HTML | 123,128 B / 35,083 gz（含 19,912 B CSS + ~85 KB JS） | 11,952 B / 3,875 gz |
| CSS | （内联在上面） | 17,321 B / 4,534 gz |
| 应用 JS | 5,355 B / 3,848 gz（judge+keywords+npc-gen） | 78,219 B / 31,264 gz |
| 题面 | 42,097 B / 14,394 gz（**全量**） | 16 个 chunk，一局只取 4 个 ≈ 3.8 KB gz |
| Three.js | 603,445 B / 148,752 gz（CDN 外链） | 505,609 B / 124,895 gz（本地打包） |
| 贴图 | 0（运行时画） | 24,640 B（board.webp，不可压缩） |
| **首屏合计** | **777,834 B / 202,077 gz** | **638,647 B / 189,652 gz** |

几个值得单独说的数字：

- **自有代码（不含 Three.js）**：174,389 → 119,952 B（-31%），
  gzip 53,325 → 40,117 B（**-25%**）；
- **Three.js**：tree-shaking 生效，603,445 → 505,609 B（-16%），
  gzip 148,752 → 124,895 B；更重要的是**不再依赖第三方 CDN**（可离线、无第三方可用性风险）；
- **首屏总量**：gzip -6.1%；首屏之后除题面外**再无任何请求**；
- 唯一变大的一笔是 24,640 B 的 `board.webp`（见 §5.3 的取舍说明）。

### 7.2 优化项逐条

| 措施 | 效果 |
|------|------|
| 题面按题切片 + 懒加载 | 首屏少 14,394 B(gzip)；一局只取 4 份 |
| Three.js tree-shaking | -23,857 B(gzip) |
| 去重 `hashStr`/`mulberry32` | 删掉一份 500 B 的死代码（更重要的是消除「两份实现漂移」的隐患） |
| CSS/JS 压缩 + 内容哈希 | 单文件变多文件，但可长缓存；改一处不再让整包失效 |
| 键盘贴图 6 → 1，材质 6 → 1 | 少 5 次 GPU 上传、5 个材质实例 |

复现命令：`npm run build`（逐文件体积见 CI 的 job summary）。

---

## 8. 运行时性能

### 8.1 静态网格合批（本次最大的性能改动）

原场景约 **204 个独立 Mesh**，每个一次 draw call。`src/render/batch.js` 在
`buildWorld()` 结束后做一次合批：

1. 遍历场景，跳过**会动的**（人物/老师/保安，通过 `dynamicRoots` 引用列表排除）、
   **可交互的**（`userData.interact`：水杯/草稿纸/显示器屏幕）与**透明的**（排序敏感）；
2. 按**材质实例**分桶 —— 材质本来就通过 `render/materials.js` 的缓存共享，桶数很少；
3. 把每个网格的 world 矩阵烘进几何体，再合成一个 `BufferGeometry`。

**实测（`npm test` 之外，由冒烟测试的运行时探针输出）：**

```
网格 204 → 63（合批 21 组）   -69%
```

> 为什么不用 `renderer.info.render.calls` 做对比：在固定视角下，视锥剔除会让大部分
> 静态物体根本不参与统计（实测同一份代码「面朝前方」时只有 28 次 draw call），
> 拿它对比会得出错误结论。**场景网格数**是不受视角影响的确定性指标，所以选它。
> 探针仍然会输出 draw call、program 数，仅作参考。

### 8.2 贴图与材质共享

- 键盘贴图：6 次 Canvas 绘制 + 6 次 GPU 上传 → 1 张烘焙贴图；
- 键盘材质：6 个 `MeshStandardMaterial` → 1 个共享实例；
- 黑板/出口牌：绘制移出首帧。

### 8.3 自适应 pixelRatio

决策逻辑单独放在 `src/core/perf-policy.js`（纯函数、8 项单测覆盖），
`src/core/perf.js` 只负责采样与把决策施加到 renderer 上。
每帧采样帧耗时（EMA 供探针读取），每 60 帧做一次变档决策：

- 窗口均值 fps < 45 连续 2 次 → pixelRatio 降一档（下限 1.0）；
- fps > 58 连续 4 次且已经降过档 → 升回一档（上限 1.5）。

带回滞是刻意的：这个场景是**填充率受限**（大量小三角形），DPR 从 1.5 降到 1.0
意味着像素数减 55%，是弱机上最有效的一档调节；但没有回滞会在阈值附近来回震荡。

### 8.4 保留了原有的优化

原代码里已经做过且有效的优化全部保留，未做无谓改动：
几何/材质缓存、几何体按视图跳过 render、resize 防抖、交互判定 80ms 节流、
显示器贴图合并刷新、死亡保安清理、`raycaster.far` 限制、三盏 PointLight 而非每屏一盏。

### 8.5 明确「测过但不值得做」的项

- `mat()` 的缓存键用 `JSON.stringify(opts)`：每次构建约 200 次调用，
  单次成本是几十纳秒，**合计不到 0.1 ms**，改成手写键构造只增加出错面，因此保留原样；
- 静态网格 `matrixAutoUpdate = false`：three.js 每帧更新 200 个矩阵的开销量级
  同样是微秒级，已被合批顺带消掉大半（合批后的 mesh 本来就设了 `matrixAutoUpdate = false`）。

### 8.6 参考帧耗时

无头 Chromium 走 SwiftShader **软件**光栅化，多次实测 `frameMs ≈ 24 ~ 65 ms`
（约 15 ~ 42 fps，随机器负载波动很大）。这个数字只能说明「软件光栅化下 CPU 侧压力」，
**不能代表真机 GPU 性能**，因此不作为结论，仅记录基线以便后续在真实设备上对比。

---

## 9. 「零行为变化」是怎么保证的

三层，全部可重复执行：

**第一层 · 行为基线快照**（`tests/run.mjs` + `tests/baseline.json`，151 项断言）

- 评分器：24 组固定输入（含空代码、只有注释、字符串里藏 `main` 等边界）
  逐字段比对重构前的 `judgeUnified` 输出；
- NPC 代码生成：15 组（5 个角色 × 3 道题）逐字节比对；
- 题库清单：16 道题的 id/名称/分值/时空限制与重构前一致；
- 题面内容哈希：每道题 `.md` 的 SHA-256 与 `tests/problem-hashes.json` 一致
  （该文件由重构前的 `problems.js` 生成），并校验长度；
- 依赖方向：`src/` 无循环 import；
- 自适应 pixelRatio 策略：8 项纯函数单测（降档 2 窗口 / 升档 4 窗口 / 死区清计数 /
  单帧抖动不触发 / 到达上下限后不再变），见 `src/core/perf-policy.js`。

**第二层 · 静态检查**：`src/` 只配置浏览器全局变量，`no-undef` 必须零错误 ——
这直接证明「41 个模块之间的接线是完整的」，而不是靠残留的全局变量侥幸跑通。

**第三层 · 真浏览器端到端**（`tools/smoke-test.mjs`，18 项断言）
覆盖初始化 → 主循环 → 准星交互 → IDE → 题面懒加载 → 提交评测 → 计分 → 存档写盘，
并要求**控制台零错误**。

三层之间的分工是明确的：第一层保证「逻辑没变」，第二层保证「接线完整」，
第三层保证「真的能在浏览器里跑起来」。任何一层单独存在都不够。

---

## 10. 落地顺序（本次实际的提交顺序）

每一步都可独立验证、独立回滚：

1. 捕获基线（`tests/baseline.json`、`tests/problem-hashes.json`）—— 先有判据再动手；
2. 工具链：`package.json` / `.gitignore` / `.gitattributes` / ESLint / Vite；
3. 题库拆分 + 懒加载，`npm test` 的题面哈希断言守门；
4. `index.html` 拆外壳 / CSS 分片 / 局部模板；
5. 内联 JS 机械切分为 41 个模块 → ESLint `no-undef` 清零 → 打断 2 个循环依赖；
6. 模型代码迁 `src/models/`，贴图烘焙管线 + `assets/textures/`；
7. 静态网格合批 + 贴图/材质共享 + 自适应 DPR，用探针量化；
8. CI / Deploy 工作流；
9. 文档与 README。

---

## 11. 已知取舍与后续可做项

| 项 | 现状 | 建议 |
|----|------|------|
| 黑板贴图 | 烘焙成 24,640 B 的 WebP | 若首屏字节更敏感，改回运行时绘制即可省下这一笔（painter 仍在） |
| Three.js 版本 | 锁定 r128（与重构前一致，保证画面不变） | 升级到 r15x+ 是一次**独立**的视觉迁移：光照默认值改为物理正确、`outputEncoding` → `outputColorSpace`，需要重新调光并做画面比对 |
| 静态合批粒度 | 按材质分桶，21 组 | 若再加大量静态道具，可按「视锥区域」分桶以避免整块几何体无法剔除 |
| 题面渲染 | 仍按原样转义进 `<pre>`（Markdown 不渲染） | 若要让题面真正排版，建议**构建期**把 `.md` 编译成 HTML 字符串，运行时零依赖（而不是引入 `marked` 到产物里） |
| 音效 | WebAudio 程序化合成，零资源文件 | 保持现状；换成音频文件只会增加体积 |
| 存档格式 | `oi_view_v8` / `oi_save_v8`，键名与字段完全未变 | 向后兼容，老存档可直接读取 |

---

## 12. 验收清单

```bash
npm ci
npm run bake:assets     # 重新生成 assets/textures/（幂等）
npm run lint            # ESLint：0 error
npm test                # 151 项回归断言
npm run build           # 产物在 dist/
node tools/smoke-test.mjs   # 真浏览器 18 项端到端断言，控制台零错误
npm run dev             # 本地开发（HTML 局部模板支持热重载）
```

发布：

```bash
npm version minor       # 或 patch
git push origin main --tags    # 打 tag 才会触发 Pages 发布
```

| 验收点 | 判据 |
|--------|------|
| `index.html` 已拆多文件 | `index.html` 41 行；`src/` 41 个 JS 模块 + 10 个 HTML 局部模板 + 11 个 CSS 分片 |
| 每题 js + markdown | `src/data/problems/` 下 16 组 `<id>.js` / `<id>.md` + 轻量清单 |
| 3D 模型归位 | 模型构建代码在 `src/models/`；静态贴图在 `assets/textures/` 且由脚本可复现生成 |
| 只在 tag 发布 | `deploy.yml` 只监听 `push.tags: v*`；tag 与 `package.json` 版本不一致时直接失败 |
| 体积 | 首屏 gzip 202,077 → 189,652 B；自有代码 gzip -25%；题面按需加载 |
| 性能 | 场景网格 204 → 63；键盘贴图/材质 6 → 1；pixelRatio 自适应（策略有单测） |
| 行为不变 | 评分器 / NPC 生成 / 题面哈希 / 题库元数据全部与重构前一致；共 151 项回归断言 |
