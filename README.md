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
| `E` / 鼠标左键 | 交互（用电脑、喝水、看草稿纸、出门） |
| `F` | 干扰同学 |
| `空格` | 出拳（老师 / 保安，后果自负） |
| `H` | 举手呼叫监考老师 |
| `Esc` | 设置 / 暂停 |

比赛 4 小时、4 道题、满分 400。默认时间流速 15×，可在设置里调到 60×。

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
| `npm test` | 回归测试：评分/NPC 确定性、题面哈希、资产、DPR 策略、静态合批、依赖方向（223 项断言） |
| `node tools/smoke-test.mjs` | 真浏览器端到端冒烟测试（33 项断言，需先 `npm run build`） |
| `node tools/smoke-test.mjs --dev` | 同上，但跑源代码（40 项断言，需另开 `npm run dev`） |
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
  systems/            评分器、NPC 代码生成、存档、交互、老师 / 保安 / NPC AI、过场
  ui/                 各界面模块 + partials/*.html
  styles/             11 个分片样式表，按原顺序 @import
  data/
    keywords.js
    problems/         题库：manifest + 每题 <id>.js / <id>.md
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

## 部署到 GitHub Pages

**只在打 tag 时发布**，`main` 分支的推送不会影响线上：

```bash
npm version minor          # 同步 package.json 版本号
git push origin main
git push origin --tags     # 触发 .github/workflows/deploy.yml
```

工作流会先校验 **tag ≡ package.json 版本**，不一致直接失败；
然后跑 lint + 测试 + 构建，最后发布到 Pages。

首次使用需要在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

- `.github/workflows/ci.yml`：PR / 主干推送 → lint + 回归测试 + 构建 + 浏览器冒烟测试（**不发布**）
- `.github/workflows/deploy.yml`：`push.tags: v*` → 校验版本 → 构建 → 发布 Pages

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
- **音效是程序化合成的**（WebAudio），仓库里没有任何音频文件。

更详细的设计取舍、体积与性能对照数据见 [`docs/REFACTOR-PLAN.md`](docs/REFACTOR-PLAN.md)。

---

## 浏览器要求

需要 WebGL。桌面 Chrome / Edge / Firefox / Safari 均可（已针对 Chromium 做过
端到端冒烟测试）。移动端能打开，但操作手感是为键鼠设计的。

## 许可

MIT，见 [LICENSE](LICENSE)。
