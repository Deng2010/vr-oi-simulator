# vr-oi-simulator
VR OI 参赛模拟器

一个纯前端的网页游戏：用 Three.js 搭建 3D 考场，以第一人称视角参加 4 小时模拟 OI 竞赛。

## 运行

直接用浏览器打开 `index.html` 即可，无需构建、无本地依赖。唯一的外部要求是能访问
cdn.jsdelivr.net 加载 Three.js；加载失败时页面会给出明确提示。

## 目录结构

```
index.html            页面外壳：head / body 标记 / 脚本加载顺序
assets/
  css/main.css        全部样式（原 index.html 内联 <style>）
  keywords.js         评分用 C++ 关键字表（静态数据）
  problems/_pool.js   题库注册表 PROBLEM_DATA + 起始代码模板（须最先加载）
  problems/P*.js      每题一个文件，格式为 PROBLEM_DATA.push({ ... })
js/
  judge.js            评测评分逻辑
  npc-gen.js          NPC 代码生成器（确定性）
  problems.js         题库逻辑：按 id 索引 / 每局抽 4 题
  core.js             工具函数 / 全局状态 / 几何材质缓存 / 音频 / DOM 引用 / 视角设置
  dialog3d.js          3D 悬浮弹窗：无遮罩、球面跟随、惯性、canvas 按钮拾取
  feedback.js         Toast 提示与成就解锁
  world.js            考场场景：房间 / 桌椅 / 显示器 / 人物 / 保安
  interact.js         准星交互判定（E / F / 空格）
  combat.js           殴打老师 / 保安 AI / 全员收尾
  debris.js           击中爆散：形状感知的刚体物理（与地板/墙壁碰撞）
  npc.js              屏蔽词机制与选手 NPC 行为
  teacher.js          监考老师：警告 / 惩罚 / 举手对话
  corridor.js         走廊往返与洗手间流程
  ide.js              IDE 面板 / 语法高亮 / 提交评测
  paper.js            草稿纸手写板
  look.js             FPS 视角 / 指针锁定 / 玩家移动 / 小地图
  reticle.js          3D 准星：45° 交互旋转 / 攻击红化放大 / 停留进度环
  tension.js          紧张值系统：灯光压暗 / 色偏 / 暗角 / 心跳 / 抖动 / 拖影
  postfx.js           全局动态模糊（AfterimagePass，CDN 失败自动回退）
  save.js             进度存档读写（localStorage）
  ending.js           比赛结算与结局分支
  main.js             事件绑定 / 主循环 / 初始化入口
```

JS 全部是传统脚本（非 ES Module），按 index.html 中的顺序加载并共享全局作用域，
新增模块时注意把被依赖的定义放在前面。

## 加题

1. 在 `assets/problems/` 新建一个以题目 id 命名的文件（如 `P10001.js`）；
2. 内容为 `PROBLEM_DATA.push({ id, name, max, tl, ml, desc, starter: STARTER_TEMPLATE });`；
3. 在 `index.html` 中按同样格式补一行 `<script>` 引入。

## 隐藏结局

殴打监考老师会叫来保安。保安总出场名额上限为 200 人（`GUARD_MAX_TOTAL`），
耗尽后不再补充。击倒全部 200 人触发隐藏结局「无人能挡」。
随着击倒数上升，紧张值（`js/tension.js`）会逐渐拉满：灯光压暗、雾色转暗红、
屏幕暗角随心跳收缩、对比度增强、镜头抖动加剧、全局拖影变长。
回座位静坐可以让紧张值部分回落，但贴身追来的保安不受影响。
击倒 10 / 20 / 50 / 100 名保安各有成就；从第 10 杀起每次击杀有 4%
概率弹出保安队通报（语气逐渐升级，配合可缓和，嘴硬会推高紧张值并叫来更多保安）。
出拳有视角扇形窗口（准星前约 51°），且一拳会扫倒范围内全部保安；
监考倒台之后，同学也会进入可攻击范围。
