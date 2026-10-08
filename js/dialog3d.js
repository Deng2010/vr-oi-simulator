'use strict';
/* =========================================================
   dialog3d —— 3D 悬浮弹窗（无遮罩 / 不打断鼠标吸附）
   ---------------------------------------------------------
   空间模型：
   - 弹窗是世界空间里的一块不透明画板，恒位于"以观察者（相机）为
     球心、DLG_RADIUS 为半径"的球面上；球心随玩家平移，生成时确定的
     方向此后固定在世界坐标系中 —— 玩家转身离开后需转回面对弹窗，
     从空间上保证"必须交互才能消除"。
   - 画板与球面相切：法线沿"当前实际位置 → 球心"的半径方向，
     因此弹窗永远正面对着玩家。
   - 生成时，弹窗中心在准心周围 ±DLG_SPAWN_YAW / ±DLG_SPAWN_PITCH
     范围内随机落位。
   - 无遮罩：不使用任何全屏 DOM 蒙层，state.view 保持 'world'，
     指针锁定全程不释放。
   惯性：
   - 位置用欠阻尼弹簧追踪球面目标点，玩家平移时弹窗滞后回摆；
   - 朝向由实际（滞后的）半径向量推出，快速转身时附加一点
     滚转角，像一块被空气拖住的悬浮板。
   交互：
   - 按钮绘制在 canvas 上；准心射线（未锁定指针时用鼠标位置）
     命中即高亮，左键 / E / 数字键 1-9 触发对应按钮；
   - 弹窗存在期间，左键 / E 不再作用于场景（见 main.js / interact.js），
     点击按钮是消除弹窗的唯一途径，每个按钮的回调自行决定关闭或
     改写弹窗内容（见 activateDialogButton）。
   遮挡：
   - 画板不透明（depthTest=false + renderOrder 置顶），稳定悬浮在准心
     附近挡住视野，而它自身不被场景遮挡，玩家无法"看不见它"。
   ========================================================= */

/* ---------- 可调参数 ---------- */
const DLG_RADIUS      = 2.0;    // 球面半径（米）：弹窗中心到眼睛的距离
const DLG_SPAWN_YAW   = 0.15;   // 生成时相对准心的随机偏航（弧度，约 ±8.6°）
const DLG_SPAWN_PITCH = 0.11;   // 生成时相对准心的随机俯仰（弧度，约 ±6.3°）
const DLG_CANVAS_W    = 2000;   // 画布像素尺寸（与整体倍率同步翻倍，保持清晰度）
const DLG_CANVAS_H    = 1200;
const DLG_WORLD_H     = 1.488;  // 画板世界高度（米），宽度按画布比例推算
const DLG_SCALE       = 2;      // 布局与字号的整体倍率（警告窗整体放大 2x）
const DLG_STIFFNESS   = 90;     // 弹簧刚度（欠阻尼 → 轻微过冲回摆）
const DLG_DAMPING     = 9;
const DLG_MAX_LEAN    = 0.32;   // 转身带来的最大附加滚转角（弧度）
const DLG_DWELL_TIME  = 1.0;    // 视线停留确认时长（秒）
const DLG_DWELL_DECAY = 0.32;   // 未对准时进度倒退速度（秒清空）
const DLG_DWELL_LOCK  = 0.45;   // 触发后的冷却，防止同按钮立刻重复触发
const DLG_STACK_STEP  = 0.44;   // 叠放时每层半径增量（随倍率同步放大）

/* 面板配色，与 CSS 变量保持一致 */
const DLG_COL = {
  bg: '#10141d', border: '#2b3448', accent: '#5b8cff',
  title: '#aebdd8', text: '#dde5f3', dim: '#7c869c',
  btn: '#1a2233', btnText: '#dbe4f7', btnHot: '#3b6df0'
};

/* ---------- 运行时状态 ---------- */
const dialogs = [];              // 现存弹窗（通常同时只有一个）
const dlgGeo = new THREE.PlaneGeometry(1, 1);   // 共享几何，按 mesh.scale 缩放到目标尺寸
let dlgHoverBtn = null;          // 当前准心/鼠标指向的 { dlg, idx }
let dwellProgress = 0;           // 视线停留进度 0..1
let dwellKey = '';               // 当前停留的按钮标识（序号:索引）
let dwellCooldown = 0;           // 触发后的剩余冷却，防止立刻重复触发
let dlgSeq = 0;                  // 弹窗序号（仅用于 dwellKey 标识）
const dlgMouseNdc = new THREE.Vector2(0, 0);    // 未锁指针时的鼠标位置（NDC）
const _dlgFwd    = new THREE.Vector3();
const _dlgEuler  = new THREE.Euler();
const _dlgQuat   = new THREE.Quaternion();
const _dlgTarget = new THREE.Vector3();
const _dlgAcc    = new THREE.Vector3();

/* =========================================================
   打开 / 关闭
   ========================================================= */
function openDialog(opts){
  /* canvas + 贴图 + 画板 */
  const canvas = document.createElement('canvas');
  canvas.width = DLG_CANVAS_W;
  canvas.height = DLG_CANVAS_H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  /* 不写深度：弹窗永远可见，同时不透明地挡住玩家视线 */
  mat.depthTest = false;
  const mesh = new THREE.Mesh(dlgGeo, mat);
  mesh.scale.set(DLG_WORLD_H * (DLG_CANVAS_W / DLG_CANVAS_H), DLG_WORLD_H, 1);
  mesh.renderOrder = 999;
  mesh.frustumCulled = false;
  mesh.layers.set(1);          /* UI 层：不参与全局拖影，文字保持锐利 */
  scene.add(mesh);

  /* 生成方向：当前准心方向叠加小幅随机偏移，之后固定在世界系。
     叠放：第 si 块面板按奇偶向两侧扇形展开、逐层后退，互不遮挡 */
  const si = dialogs.length;
  const side = si % 2 ? 1 : -1;
  const layer = (si / 2) | 0;
  const rad = DLG_RADIUS + DLG_STACK_STEP * si;
  _dlgFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _dlgEuler.set((Math.random() * 2 - 1) * DLG_SPAWN_PITCH +
                  (layer % 2 ? 1 : -1) * 0.18 * (layer + 1),
                (Math.random() * 2 - 1) * DLG_SPAWN_YAW +
                  side * (0.68 + 0.44 * layer), 0, 'YXZ');
  _dlgQuat.setFromEuler(_dlgEuler);
  _dlgFwd.applyQuaternion(_dlgQuat).normalize();

  const dlg = {
    mesh, canvas, ctx, tex,
    title: opts.title || '',
    text: opts.text || '',
    options: (opts.options || []).map(o => ({ label: o.label, cb: o.cb })),
    dir: _dlgFwd.clone(),          // 世界系固定方向
    rad,                          // 本面板的球面半径（叠放时逐层增大）
    center: camera,                // 球心 = 相机（追随玩家）
    pos: new THREE.Vector3(),      // 当前实际位置（弹簧驱动）
    vel: new THREE.Vector3(),
    buttons: [], textMaxH: 0,
    hover: -1, lean: 0, lastYaw: state.yaw, id: ++dlgSeq
  };
  /* 初始落位略近并给一点外抛速度，让弹窗"弹"到球面上 */
  _dlgTarget.copy(camera.position).addScaledVector(dlg.dir, rad);
  dlg.pos.copy(_dlgTarget).addScaledVector(dlg.dir, -0.28);
  dlg.vel.copy(dlg.dir).multiplyScalar(0.7);

  layoutDialog(dlg);
  drawDialog(dlg, -1);
  dialogs.push(dlg);
  return dlg;
}

function closeDialog(dlg){
  const i = dialogs.indexOf(dlg);
  if (i >= 0) dialogs.splice(i, 1);
  scene.remove(dlg.mesh);
  dlg.tex.dispose();
  dlg.mesh.material.dispose();
  /* 正在注视的面板被关掉时，顺带清掉停留进度 */
  if (dlgHoverBtn && dlgHoverBtn.dlg === dlg){
    dlgHoverBtn = null;
    dwellProgress = 0;
    dwellKey = '';
  }
}

/* 收场用：无条件收起全部弹窗（不触发按钮回调） */
function dismissDialogs(){
  while (dialogs.length) closeDialog(dialogs[0]);
}

function hasDialog(){
  return dialogs.length > 0;
}

/* 原地改写弹窗内容（对话的"回复态"：换正文、换按钮，不重开弹窗） */
function setDialogContent(dlg, opts){
  if (!dlg || dialogs.indexOf(dlg) < 0) return;
  if (typeof opts.title === 'string') dlg.title = opts.title;
  if (typeof opts.text === 'string')  dlg.text  = opts.text;
  if (opts.options) dlg.options = opts.options.map(o => ({ label: o.label, cb: o.cb }));
  dlg.hover = -1;
  layoutDialog(dlg);
  drawDialog(dlg, -1);
}

/* =========================================================
   按钮激活：弹窗唯一的消除途径
   ---------------------------------------------------------
   调用方（左键 / E / 数字键）只负责把事件送进来；
   这里只执行命中按钮的回调，由回调自行决定 closeDialog 关闭
   或 setDialogContent 改写弹窗 —— 例如"我知道了"按钮关闭，
   而对话选项按钮先把正文换成老师的回复再关闭。
   ========================================================= */
function activateDialogButton(){
  if (!dlgHoverBtn) return false;
  const { dlg, idx } = dlgHoverBtn;
  dlgHoverBtn = null;
  const opt = dlg.options[idx];
  if (opt && opt.cb) opt.cb(dlg);
  return true;
}

/* 数字键 1-9 直接选择第 n 个选项 */
function selectDialogOption(n){
  const dlg = dialogs[dialogs.length - 1];
  if (!dlg) return false;
  const opt = dlg.options[n];
  if (!opt) return false;
  if (opt.cb) opt.cb(dlg);
  return true;
}

/* =========================================================
   每帧更新：惯性追随 + 相切朝向 + 全局拾取 + 视线停留
   多面板并存时逐块更新物理，拾取对所有面板取最近命中。
   ========================================================= */
function updateDialogs(dt){
  if (!dialogs.length){
    dlgHoverBtn = null;
    dwellProgress = 0;
    dwellKey = '';
    return;
  }
  if (dwellCooldown > 0) dwellCooldown -= dt;

  /* 1. 每块面板：欠阻尼弹簧追踪各自球面目标点 + 相切朝向 + 转身拖尾 */
  const prevHover = dialogs.map(d => d.hover);
  for (const dlg of dialogs){
    dlg.hover = -1;

    _dlgTarget.copy(dlg.center.position).addScaledVector(dlg.dir, dlg.rad);
    _dlgAcc.copy(_dlgTarget).sub(dlg.pos).multiplyScalar(DLG_STIFFNESS)
           .addScaledVector(dlg.vel, -DLG_DAMPING);
    dlg.vel.addScaledVector(_dlgAcc, dt);
    dlg.pos.addScaledVector(dlg.vel, dt);
    dlg.mesh.position.copy(dlg.pos);

    /* 法线对准球心（用滞后的实际位置 → 朝向自带惯性） */
    dlg.mesh.lookAt(dlg.center.position);

    /* 转身惯性：视线快速转动时附加滚转角，像悬浮板被空气拖住 */
    let dyaw = state.yaw - dlg.lastYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    dlg.lastYaw = state.yaw;
    const rate = clamp(dyaw / Math.max(dt, 1e-3), -8, 8);
    dlg.lean = lerp(dlg.lean, clamp(rate * 0.045, -DLG_MAX_LEAN, DLG_MAX_LEAN),
                    1 - Math.exp(-dt * 7));
    dlg.mesh.rotateZ(-dlg.lean);
  }

  /* 2. 拾取：对所有面板射线，取最近命中那块上的按钮 */
  raycaster.far = DLG_RADIUS + DLG_STACK_STEP * dialogs.length + 0.5;
  if (pointerLocked) raycaster.setFromCamera(CENTER, camera);
  else raycaster.setFromCamera(dlgMouseNdc, camera);
  let best = null;
  for (const dlg of dialogs){
    const hits = raycaster.intersectObject(dlg.mesh, false);
    if (!hits.length || !hits[0].uv) continue;
    const px = hits[0].uv.x * DLG_CANVAS_W;
    const py = (1 - hits[0].uv.y) * DLG_CANVAS_H;
    const idx = hitDialogButton(dlg, px, py);
    if (idx < 0) continue;
    if (!best || hits[0].distance < best.dist) best = { dlg, idx, dist: hits[0].distance };
  }
  if (best) best.dlg.hover = best.idx;
  dlgHoverBtn = best ? { dlg: best.dlg, idx: best.idx } : null;
  /* 只重画悬停状态发生变化的面板 */
  dialogs.forEach((d, i) => {
    if (d.hover !== prevHover[i]) drawDialog(d, d.hover);
  });

  /* 3. 视线停留：对准则按钮即填充进度；未对准（或换目标）则快速倒退 */
  const key = best ? best.dlg.id + ':' + best.idx : '';
  if (key && key === dwellKey && dwellCooldown <= 0){
    dwellProgress += dt / DLG_DWELL_TIME;
    if (dwellProgress >= 1){
      /* 满环即触发；回调自行决定关闭面板或改写其内容 */
      dwellProgress = 0;
      dwellKey = '';
      dwellCooldown = DLG_DWELL_LOCK;
      const opt = best.dlg.options[best.idx];
      if (opt && opt.cb) opt.cb(best.dlg);
    }
  } else {
    dwellKey = key;
    dwellProgress = Math.max(0, dwellProgress - dt / DLG_DWELL_DECAY);
  }
}

/* 供准星读取的停留状态（进度环 / 交互态） */
function dialogDwell(){
  return { progress: dwellProgress, active: dlgHoverBtn !== null };
}

function hitDialogButton(dlg, px, py){
  for (let i = 0; i < dlg.buttons.length; i++){
    const b = dlg.buttons[i];
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return i;
  }
  return -1;
}

/* =========================================================
   Canvas 绘制
   ========================================================= */
function layoutDialog(dlg){
  const n = dlg.options.length;
  dlg.buttons = [];
  if (!n){
    dlg.textMaxH = DLG_CANVAS_H - 100 - 32;
    return;
  }
  const cols = Math.min(2, n);
  const rows = Math.ceil(n / cols);
  const pad = 28 * DLG_SCALE, gap = 14 * DLG_SCALE, bh = 66 * DLG_SCALE;
  const bw = (DLG_CANVAS_W - pad * 2 - gap * (cols - 1)) / cols;
  const totalH = rows * bh + (rows - 1) * gap;
  const top = DLG_CANVAS_H - pad - totalH;
  dlg.textMaxH = top - (104 + 12) * DLG_SCALE;   // 标题区 + 间隙
  for (let i = 0; i < n; i++){
    const c = i % cols, r = (i / cols) | 0;
    dlg.buttons.push({
      x: pad + c * (bw + gap),
      y: top + r * (bh + gap),
      w: bw, h: bh,
      /* 按钮标签带序号，与数字键 1-9 对应 */
      label: (i < 9 ? (i + 1) + '. ' : '') + dlg.options[i].label
    });
  }
}

function drawDialog(dlg, hoverIdx){
  const ctx = dlg.ctx, W = DLG_CANVAS_W, H = DLG_CANVAS_H;
  ctx.clearRect(0, 0, W, H);

  /* 面板底 + 圆角边框 + 左侧强调条 */
  roundRectPath(ctx, 6 * DLG_SCALE, 6 * DLG_SCALE,
                 W - 12 * DLG_SCALE, H - 12 * DLG_SCALE, 18 * DLG_SCALE);
  ctx.fillStyle = DLG_COL.bg;
  ctx.fill();
  ctx.lineWidth = 3 * DLG_SCALE;
  ctx.strokeStyle = DLG_COL.border;
  ctx.stroke();
  ctx.fillStyle = DLG_COL.accent;
  ctx.fillRect(16 * DLG_SCALE, 34 * DLG_SCALE, 5 * DLG_SCALE, H - 68 * DLG_SCALE);

  /* 标题 */
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (dlg.title){
    ctx.font = `600 ${37 * DLG_SCALE}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.fillStyle = DLG_COL.title;
    ctx.fillText(dlg.title, 40 * DLG_SCALE, 32 * DLG_SCALE);
  }

  /* 正文（CJK 感知换行，超高截断） */
  ctx.font = `${26 * DLG_SCALE}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.fillStyle = DLG_COL.text;
  const lines = wrapDialogText(ctx, dlg.text, W - 96 * DLG_SCALE);
  const maxLines = Math.max(1, Math.floor(dlg.textMaxH / (38 * DLG_SCALE)));
  for (let i = 0; i < Math.min(lines.length, maxLines); i++){
    ctx.fillText(lines[i], 40 * DLG_SCALE, (104 + i * 38) * DLG_SCALE);
  }
  if (lines.length > maxLines){
    ctx.fillStyle = DLG_COL.dim;
    ctx.fillText('……', 40 * DLG_SCALE, (104 + maxLines * 38) * DLG_SCALE);
  }

  /* 按钮：hover 高亮；点中即由 activateDialogButton 触发回调并消除弹窗 */
  dlg.buttons.forEach((b, i) => {
    const hot = i === hoverIdx;
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 12 * DLG_SCALE);
    ctx.fillStyle = hot ? DLG_COL.btnHot : DLG_COL.btn;
    ctx.fill();
    ctx.lineWidth = 2 * DLG_SCALE;
    ctx.strokeStyle = hot ? '#8fb0ff' : DLG_COL.border;
    ctx.stroke();
    ctx.font = (hot ? '600 ' : '') + `${25 * DLG_SCALE}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.fillStyle = hot ? '#ffffff' : DLG_COL.btnText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + DLG_SCALE);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  });

  dlg.tex.needsUpdate = true;
}

function roundRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 中英文混排换行：拉丁/数字按词切，CJK 按字切，尊重原文换行 */
function wrapDialogText(ctx, text, maxW){
  const out = [];
  for (const para of String(text).split('\n')){
    let line = '';
    const tokens = para.match(/[A-Za-z0-9_.'"()\[\]:;,-]+|\s+|[\s\S]/g) || [];
    for (const tk of tokens){
      if (tk === '\n'){ out.push(line); line = ''; continue; }
      if (!line && /^\s+$/.test(tk)) continue;
      const t = line + tk;
      if (line && ctx.measureText(t).width > maxW && tk.trim()){
        out.push(line.trimEnd());
        line = /^\s+$/.test(tk) ? '' : tk;
      } else {
        line = t;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
