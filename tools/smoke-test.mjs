/* =========================================================
   端到端冒烟测试：真实浏览器 + 真实 WebGL + 真实构建产物
   ---------------------------------------------------------
   用法：
     node tools/smoke-test.mjs            # 测试 dist/（默认，需先 npm run build）
     node tools/smoke-test.mjs --dev      # 测试 vite dev 源码（需先起 npm run dev）

   为什么值得做：这次重构是「大搬运」，ESLint 只能证明名字解析得对，
   证明不了绑错模块、初始化顺序错、懒加载路径断掉。
   这里用无头 Chromium（SwiftShader 软渲染 WebGL）真跑一遍：
     初始化 → 开始比赛 → 低头看向显示器 → E 打开 IDE →
     题面懒加载 → 提交评测 → 评测结果 → 离开 IDE → Esc 设置面板 →
     交卷 → 赛后系统测试 → 揭榜（结局徽章 / 统计格子 / 事件回顾）。
   任何一步失败或控制台报错都会让脚本以非 0 退出。
   ========================================================= */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createProfile, sweepStaleProfiles } from './lib/chrome-profile.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 用 fileURLToPath 而不是 URL.pathname：后者在部分 Node 版本上
   会丢掉结尾斜杠，导致拼接出来的路径少一层分隔符。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USE_DEV = process.argv.includes('--dev');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* ---------- 静态服务器 ---------- */
function serveDir(dir){
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ---------- 浏览器 ---------- */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome'
].filter(Boolean);

/* Playwright / Puppeteer 的浏览器缓存目录：CI 用
   `npx playwright install chromium` 装浏览器，这里把它找出来，
   这样项目本身不必依赖 playwright 包。 */
function bundledBrowsers(){
  const out = [];
  const homes = [process.env.HOME, os.homedir()].filter(Boolean);
  const bases = [];
  for (const h of homes){
    bases.push(path.join(h, '.cache', 'ms-playwright'));
    bases.push(path.join(h, 'Library', 'Caches', 'ms-playwright'));
    bases.push(path.join(h, '.cache', 'puppeteer'));
  }
  const rels = [
    ['chrome-linux', 'chrome'],
    ['chrome-linux64', 'chrome'],
    ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS',
      'Google Chrome for Testing'],
    ['chrome-headless-shell-linux64', 'chrome-headless-shell']
  ];
  for (const base of bases){
    if (!existsSync(base)) continue;
    let entries = [];
    try { entries = readdirSync(base); } catch (e){ continue; }
    for (const dir of entries){
      for (const rel of rels) out.push(path.join(base, dir, ...rel));
    }
  }
  return out;
}

function findChrome(){
  const all = [...CHROME_CANDIDATES, ...bundledBrowsers()];
  for (const c of all) if (c && existsSync(c)) return c;
  throw new Error('找不到 Chromium/Chrome。可设置 CHROME_PATH，' +
    '或运行 npx playwright install chromium。\n已尝试：\n  ' + all.join('\n  '));
}

async function launchBrowser(){
  const exe = findChrome();
  const profile = createProfile(ROOT, 'smoke');
  const userDataDir = profile.dir;

  const child = spawn(exe, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    /* 无头环境没有 GPU：用 SwiftShader 软件实现 WebGL，
       这样 THREE.WebGLRenderer 能真的建出上下文、真的渲染。 */
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    /* 无头场景必须显式关掉后台节流：
       否则页面被判定为「不可见」后 requestAnimationFrame 会停发，
       主循环只跑一帧就冻住。 */
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--window-size=1280,800',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  profile.trackChild(child);      /* 信号清理时会先杀掉它，再删目录 */

  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });

  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 120 && !port; i++){
    await sleep(100);
    if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  }
  if (!port) throw new Error('浏览器启动失败：\n' + stderr);

  let target = null;
  for (let i = 0; i < 60 && !target; i++){
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch (e){ /* 还没就绪 */ }
    if (!target) await sleep(100);
  }
  if (!target) throw new Error('浏览器没有可用页面目标');

  return {
    wsUrl: target.webSocketDebuggerUrl,
    async close(){
      child.kill('SIGKILL');
      await sleep(200);
      profile.dispose();
    }
  };
}

/* ---------- 极简 CDP 会话 ---------- */
function connect(wsUrl){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const waiting = new Map();
    const events = [];

    ws.addEventListener('open', () => resolve({
      events,
      send(method, params){
        const id = nextId++;
        return new Promise((res, rej) => {
          waiting.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      close(){ try { ws.close(); } catch (e){ /* ignore */ } }
    }));
    ws.addEventListener('error', e => reject(new Error('CDP 连接失败: ' + (e.message || '?'))));
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && waiting.has(msg.id)){
        const { res, rej } = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (msg.error) rej(new Error(msg.method + ': ' + JSON.stringify(msg.error)));
        else res(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled'){
        const text = (msg.params.args || [])
          .map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
        events.push({ kind: 'console', type: msg.params.type, text });
      }
      if (msg.method === 'Runtime.exceptionThrown'){
        const d = msg.params.exceptionDetails;
        events.push({
          kind: 'exception',
          text: d.exception?.description || d.text || 'unknown exception'
        });
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error'){
        events.push({ kind: 'log', text: msg.params.entry.text + ' ' +
          (msg.params.entry.url || '') });
      }
      /* confirm() 弹窗必须有人接：无头环境里没有用户点「确定」，
         页面会一直卡在对话框上（交卷、重置代码都走 confirm）。
         这里统一按「确定」处理，于是「交卷 → 系统测试」可以端到端跑通。
         这个响应没人 await，落回上面的 waiting 分支时会被忽略。 */
      if (msg.method === 'Page.javascriptDialogOpening'){
        ws.send(JSON.stringify({
          id: nextId++, method: 'Page.handleJavaScriptDialog', params: { accept: true }
        }));
      }
    });
  });
}

/* ---------- 页面内测试脚本 ---------- */
function pageScript(opts = {}){
  const expectProbe = !!opts.expectProbe;
  const failures = [];
  const steps = [];
  const t = {
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    key(code, type){
      document.dispatchEvent(new KeyboardEvent(type, {
        code, bubbles: true, cancelable: true
      }));
    },
    async hold(code, ms){
      t.key(code, 'keydown');
      await t.sleep(ms);
      t.key(code, 'keyup');
    },
    el: sel => document.querySelector(sel),
    visible(sel){
      const e = t.el(sel);
      return !!e && !e.classList.contains('hidden');
    },
    text: sel => (t.el(sel)?.textContent || ''),
    click(sel){
      const e = t.el(sel);
      if (!e) throw new Error('找不到元素 ' + sel);
      e.click();
    },
    /* 轮询必须让出事件循环：
       页面里的主循环靠定时器推进，同步忙等会把整页锁死，
       导致「等什么都不会变」，所有断言必然超时。 */
    async waitFor(label, fn, timeout = 10000){
      const t0 = Date.now();
      while (Date.now() - t0 < timeout){
        let v = false;
        try { v = !!fn(); } catch (e){ /* 元素可能还没出现 */ }
        if (v) return true;
        await t.sleep(50);
      }
      throw new Error(`等待超时(${timeout}ms)：${label}`);
    }
  };

  const check = (name, ok, extra = '') => {
    steps.push({ name, ok: !!ok, extra: String(extra).slice(0, 300) });
    if (!ok) failures.push(name + (extra ? ' → ' + String(extra).slice(0, 300) : ''));
  };

  return (async () => {
    /* 1. 初始化：boot 遮罩消失说明 init() 跑完且没抛错 */
    const bootGone = await t.waitFor('boot 遮罩消失', () => !t.el('#boot'), 20000)
      .then(() => true).catch(() => false);
    check('init() 成功（#boot 已移除）', bootGone);

    const canvas = t.el('#scene');
    check('渲染画布已建立且尺寸非零',
      canvas && canvas.width > 0 && canvas.height > 0,
      canvas ? `${canvas.width}×${canvas.height}` : 'no canvas');

    /* 1.5 启动屏分页：四页互斥，默认停在「简介」。
       分页只是切 .hidden，没有别的守卫 —— 漏写或改名会让
       「设置」「展示墙」「关于」静默变成空白页，所以在这里钉死。 */
    const pageNames = ['intro', 'settings', 'wall', 'about'];
    const tabsOk = pageNames.every(n => t.el(`[data-start-tab="${n}"]`));
    const pagesOk = pageNames.every(n => t.el(`[data-start-page="${n}"]`));
    check('启动屏分页齐备（简介 / 设置 / 展示墙 / 关于）', tabsOk && pagesOk);
    check('启动屏默认只显示「简介」',
      t.visible('[data-start-page="intro"]') &&
      !t.visible('[data-start-page="settings"]') &&
      !t.visible('[data-start-page="wall"]') &&
      !t.visible('[data-start-page="about"]'));

    t.click('[data-start-tab="settings"]');
    const settingsShown = t.visible('[data-start-page="settings"]') &&
      t.visible('#turnSliderStart');
    t.click('[data-start-tab="about"]');
    const aboutShown = t.visible('[data-start-page="about"]') &&
      !t.visible('[data-start-page="settings"]');

    /* 展示墙：这一次浏览器 profile 是全新的，所以一条记录都没有。
       未解锁的条目必须**根本不进 DOM**（不是 CSS 藏着）——
       否则「把全部成就列一遍」这种剧透式实现也能蒙混过去。 */
    t.click('[data-start-tab="wall"]');
    await t.sleep(150);
    const wallShown = t.visible('[data-start-page="wall"]') &&
      t.visible('#wallAch') && t.visible('#wallEnd');
    const achBefore = t.el('#wallAch') ? t.el('#wallAch').querySelectorAll('.wall-item').length : 0;
    const endBefore = t.el('#wallEnd') ? t.el('#wallEnd').querySelectorAll('.wall-item').length : 0;
    check('展示墙分页能打开、开局前是空态（未达成的一条都不渲染）',
      wallShown && achBefore === 0 && endBefore === 0 &&
      /还没有解锁任何成就/.test(t.text('#wallAch')) &&
      /还没有开出任何结局/.test(t.text('#wallEnd')),
      `成就条目=${achBefore} 结局条目=${endBefore} ｜ ${t.text('#wallAch').slice(0, 60)}`);

    t.click('[data-start-tab="intro"]');
    check('选项卡能切换分页并切回「简介」',
      settingsShown && aboutShown && t.visible('#btnStart') &&
      !t.visible('[data-start-page="wall"]'),
      `设置页=${settingsShown} 关于页=${aboutShown}`);

    /* 2. 开始比赛 */
    t.click('#btnStart');
    await t.sleep(400);
    check('#start 隐藏 / #hud 显示', !t.visible('#start') && t.visible('#hud'));

    /* 主循环探针：计时器必须持续推进。
       只跑一帧就停是无头环境最常见的坑，单独报出来便于定位。 */
    const t0 = t.text('#hudTimer');
    let ticks = 0;
    for (let i = 0; i < 12; i++){
      await t.sleep(250);
      if (t.text('#hudTimer') !== t0){ ticks++; break; }
    }
    check('比赛计时在推进（主循环在跑）', ticks > 0,
      `${t0} → ${t.text('#hudTimer')}`);

    /* 2.5 性能采样：必须在「面朝前方、未低头」时读取。
       低头后大部分房间被视锥剔除，draw call 会假性变少，
       拿那个数字做对比会得出错误结论。 */
    await t.sleep(1500);
    const perfFront = typeof window.__VR_OI_PERF__ === 'function' ? window.__VR_OI_PERF__() : null;
    steps.push({
      name: '场景规模 / 性能采样',
      /* 探针只在 vite dev 下存在（import.meta.env.DEV 守卫，产物里会被摇掉），
         所以生产构建下这一项按「不适用」处理，而不是失败。 */
      ok: perfFront ? true : !expectProbe,
      extra: perfFront
        ? `网格 ${perfFront.meshesBeforeBatch} → ${perfFront.sceneMeshes}` +
          `（合批 ${perfFront.mergedGroups} 组，动态物体跳过 ${perfFront.skippedDynamic} 个）` +
          ` drawCalls=${perfFront.drawCalls} programs=${perfFront.programs}` +
          ` pixelRatio=${perfFront.pixelRatioSetting}` +
          ` frameMs=${perfFront.frameMs.toFixed(2)} fps=${perfFront.fps.toFixed(1)}`
        : '（生产构建，探针被摇掉 —— 符合预期）'
    });

    /* 2.6 场景完整性：人物 / 监考老师不能被静态合批吞掉。
       这是「人物 4 条腿」「老师模型冻在原地」这类 bug 的端到端判据：
       合批误吞后，动态根子树里的网格数会变成 0。 */
    const integ = perfFront && perfFront.integrity;
    if (expectProbe){
      check('场景里存在 6 个动态根（5 名选手 + 监考老师）',
        !!integ && integ.dynamicRoots === 6,
        integ ? `dynamicRoots=${integ.dynamicRoots}` : '探针不可用');
      check('每个动态根的模型网格都还在（未被合批吞掉）',
        !!integ && integ.rootMeshes.length > 0 &&
        integ.rootMeshes.every(n => n > 0),
        integ ? `各根网格数=${JSON.stringify(integ.rootMeshes)}` : '');
      check('人物网格数达到完整部件数量（≥ 11）',
        !!integ && integ.minMeshes >= 11,
        integ ? `minMeshes=${integ.minMeshes}` : '');

      /* ---- 玩家反馈的两个 bug，这里各对应一条断言 ---- */

      /* bug 1：每个人都同时露出坐姿 + 站姿两组腿（共 4 条）。
         判据：有人物腿组的动态根，必须恰好可见一组。 */
      const withLegs = (integ && integ.roots || []).filter(r => r.hasLegs);
      check('每个选手恰好可见一组腿（不再出现 4 条腿）',
        expectProbe && withLegs.length >= 5 &&
        withLegs.every(r => r.visibleLegGroups === 1),
        `含腿组的人物 ${withLegs.length} 个，可见腿组数=` +
        JSON.stringify(withLegs.map(r => r.visibleLegGroups)));
      check('坐姿腿 4 个盒子 / 站姿腿 2 个盒子都还在',
        withLegs.length > 0 &&
        withLegs.every(r => r.sitLegMeshes === 4 && r.standLegMeshes === 2),
        JSON.stringify(withLegs.map(r => [r.sitLegMeshes, r.standLegMeshes])));

      /* bug 2：监考老师的模型冻在原地，与实际坐标不符。
         判据：老师根节点必须有网格（模型还在它下面），
         并且它的位置会随时间变化（AI 在动，模型随之移动）。 */
      const teacherRoot = (integ && integ.roots || [])
        .find(r => r.name === 'teacher');
      check('监考老师模型仍在自己的根节点下（未被烘死）',
        !!teacherRoot && teacherRoot.meshes > 0,
        teacherRoot ? `网格 ${teacherRoot.meshes}` : '找不到 teacher 根节点');
      const teacherPosA = integ && integ.teacherPos;
      await t.sleep(1200);
      const after = window.__VR_OI_PERF__ ? window.__VR_OI_PERF__() : null;
      const teacherPosB = after && after.integrity && after.integrity.teacherPos;
      const moved = !!(teacherPosA && teacherPosB) &&
        (Math.abs(teacherPosA[0] - teacherPosB[0]) > 1e-4 ||
         Math.abs(teacherPosA[2] - teacherPosB[2]) > 1e-4);
      check('监考老师位置随时间变化（AI 巡逻 + 模型跟随）', moved,
        `t0=${JSON.stringify(teacherPosA)} t1=${JSON.stringify(teacherPosB)}`);
    }

    /* 3. 低头看显示器，准星应命中「使用电脑」
       注意：显示器只在某个俯仰角区间内被射线命中，
       长时间按住 ↓ 会一口气低过头。所以这里小步点按、每步检查一次，
       既确定性又不依赖帧率。 */
    let promptOk = false;
    let taps = 0;
    for (; taps < 40 && !promptOk; taps++){
      t.key('ArrowDown', 'keydown');
      await t.sleep(60);
      t.key('ArrowDown', 'keyup');
      await t.sleep(110);
      promptOk = t.visible('#prompt') && /电脑/.test(t.text('#prompt'));
    }
    check('准星射线命中显示器并提示可交互', promptOk,
      `低头 ${taps} 次，prompt="${t.text('#prompt')}"`);

    /* 3.5 准星：十字形结构 + 交互 45° 旋转。
       这些只是 DOM 与 class，单元测试碰不到；样式改坏了画面照样「正常」，
       所以在这里钉死结构，再用真实交互驱动一次状态迁移。
       「按住确认」的完整流程在第 4 步。 */
    const barsOk = ['.ch-t', '.ch-b', '.ch-l', '.ch-r'].every(s => t.el('#crosshair ' + s));
    check('准星是十字形（4 条线 + 中心点 + 进度环）',
      barsOk && !!t.el('#crosshair .ch-dot') && !!t.el('#crosshair .ch-ring-fill'));

    await t.sleep(150);
    const chEl = t.el('#crosshair');
    const chFill = t.el('#crosshair .ch-ring-fill');
    const chInteract = await t.waitFor('准星进入交互态',
      () => chEl && chEl.classList.contains('interact'), 2000)
      .then(() => true).catch(() => false);
    check('瞄到可交互物时准星进入交互态（45° 旋转）', chInteract,
      chEl ? `class="${chEl.className}"` : '找不到 #crosshair');

    /* 没蓄力时环必须是空的。判据取「dashoffset ≥ 真实路径长度」而不是某个写死的数：
       改准星尺寸时如果漏改 viewBox / r，弧长就会和真实路径对不上，
       于是没按任何键也常驻一小段弧 —— 这个 bug 只能靠这条断言钉住。 */
    const ringTotal = chFill && chFill.getTotalLength ? chFill.getTotalLength() : NaN;
    const dashRest = parseFloat((chFill && chFill.style.strokeDashoffset) || 'NaN');
    check('没蓄力时进度环是空的（环长与 dashoffset 对齐）',
      Number.isFinite(ringTotal) && dashRest >= ringTotal - 0.5,
      `dashoffset=${dashRest} 路径长=${ringTotal}`);

    /* 4. 按住 E 蓄力确认（VR 指针手感）：
       短按什么都不该发生；按住时进度环要走；中途松手要取消；
       只有走满一圈才真的打开 IDE（openCode → 题面懒加载）。
       环的进度只体现在 stroke-dashoffset 上，所以直接量它。 */
    const dash = () => parseFloat((chFill && chFill.style.strokeDashoffset) || 'NaN');

    t.key('KeyE', 'keydown');
    await t.sleep(120);
    t.key('KeyE', 'keyup');
    await t.sleep(500);
    check('短按 E 不触发交互（改成按住确认）', !t.visible('#codeUI'));

    t.key('KeyE', 'keydown');
    await t.sleep(150);
    const holdClass = !!chEl && chEl.classList.contains('hold');
    const dashMid = dash();
    t.key('KeyE', 'keyup');
    await t.sleep(450);
    check('按住时进度环在走（既不是 0 也没有走满）',
      holdClass && dashMid > 0 && dashMid < 75,
      `class="${chEl && chEl.className}" dashoffset=${dashMid}`);
    check('中途松手即取消：仍然不开 IDE', !t.visible('#codeUI'));

    t.key('KeyE', 'keydown');
    await t.sleep(700);
    const ideOpened = t.visible('#codeUI');
    check('按住 E 走满一圈后打开代码界面', ideOpened);
    t.key('KeyE', 'keyup');

    const paneLoaded = await t.waitFor('题面加载完成',
      () => !/题面载入中/.test(t.text('#problemPane')) &&
            /P\d+/.test(t.text('#problemPane')), 15000)
      .then(() => true).catch(() => false);
    check('题面懒加载完成（per-problem chunk 拉取成功）', paneLoaded,
      t.text('#problemPane').slice(0, 80));
    check('#problemPane 至少 400 字题面正文',
      t.text('#problemPane').length > 400,
      `${t.text('#problemPane').length} chars`);
    check('文件名按题号生成', /^P\d+\.cpp$/.test(t.text('#fileName')),
      t.text('#fileName'));
    check('编辑器已填入起手代码', /int main/.test(t.el('#codeArea')?.value || ''));
    check('题目列表渲染出 4 道题',
      t.el('#problemList')?.children.length === 4,
      t.el('#problemList')?.children.length);

    if (!ideOpened) return { steps, failures };   /* 后续步骤依赖 IDE，直接收尾 */

    /* 5. 写点代码再提交，验证评分器 + 计分 + 显示器贴图更新链路 */
    const area = t.el('#codeArea');
    area.value = 'int main(){int n;cin>>n;vector<int> a(n);for(int i=0;i<n;i++)cin>>a[i];' +
      'sort(a.begin(),a.end());long long ans=0;for(int i=0;i<n;i++)ans+=a[i];' +
      'cout<<ans<<endl;return 0;}';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await t.sleep(200);
    t.click('#btnSubmit');
    const judged = await t.waitFor('评测完成',
      () => !t.el('#btnSubmit').disabled && /评测结果/.test(t.text('#verdict')), 15000)
      .then(() => true).catch(() => false);
    check('提交后完成评测并渲染结果', judged, t.text('#verdict').slice(0, 80));
    /* 赛中跑的是预测试（10 点），界面上必须说清楚 ——
       否则玩家会把预测试分数当成最终成绩 */
    check('评测结果标注为预测试', /预测试/.test(t.text('#verdict')),
      t.text('#verdict').slice(0, 100));
    /* 评测得分必须传导到 HUD 总分（recalcScore → 主循环写 DOM） */
    const scored = Number(/(\d+)\s*分/.exec(t.text('#verdict'))?.[1] || 0);
    const hudKeyed = await t.waitFor('HUD 总分刷新',
      () => Number(/总分\s*(\d+)/.exec(t.text('#hudScore'))?.[1] || 0) === scored && scored > 0,
      4000).then(() => true).catch(() => false);
    check('HUD 总分已刷新为评测得分', hudKeyed,
      `评测 ${scored} 分，HUD "${t.text('#hudScore').slice(0, 40)}"`);

    /* 6. 离开 IDE（必须先确认真的打开过，否则这是假通过） */
    t.click('#btnLeave');
    await t.sleep(250);
    check('离开电脑回到世界视图', ideOpened && !t.visible('#codeUI'),
      ideOpened ? '' : 'IDE 此前未打开，本项不计为通过');

    /* 7. Esc 暂停菜单 */
    t.key('Escape', 'keydown');
    await t.sleep(250);
    check('Esc 打开设置面板', t.visible('#pauseMenu'));
    t.click('#btnResume');
    await t.sleep(200);
    check('返回考场按钮生效', !t.visible('#pauseMenu'));

    /* 8. 存档写读链路 */
    t.click('#btnSettings');
    await t.sleep(200);
    t.click('#btnSave');
    await t.sleep(300);
    const saved = Object.keys(localStorage).some(k => k.startsWith('oi_save'));
    check('手动保存写入 localStorage', saved, Object.keys(localStorage).join(','));

    /* 收尾回到世界视图：pause 视图会跳过渲染，
       留着遮罩会让后续截图拍到旧帧。 */
    t.click('#btnResume');
    await t.sleep(200);

    /* 9. 交卷 → 赛后系统测试（20 点）→ 揭榜
       这一段是「预测试 ≠ 最终成绩」的端到端判据：
       交卷时 confirm（CDP 侧统一按确定处理）→ 系统测试逐点揭晓 → 揭榜。
       截图阶段会重新 navigate 一次，所以把比赛打完不会污染后面的画面。 */
    t.click('#btnEnd');
    const sysShown = await t.waitFor('进入系统测试',
      () => t.visible('#sysTest') && t.text('#stLog').length > 0, 10000)
      .then(() => true).catch(() => false);
    check('交卷后进入系统测试', sysShown, t.text('#stLog').slice(0, 60));

    const cells = t.el('#stRuns') ? t.el('#stRuns').querySelectorAll('.st-case').length : 0;
    check('系统测试渲染出 4 题 × 20 个测试点', cells === 80, `格子数=${cells}`);

    /* 9.5 结局正文：全屏 / 分段 / 打字机。
       系统测试跑完之后先进正文播放器，**正文播完才揭榜** ——
       这一段同时是两条交互规则的端到端判据：
         · 打字中按任意键 → 本段立刻完整，动画停住；
         · 本段完整后按任意键 → 下一段（从第一个字重新打）。 */
    const storyShown = await t.waitFor('结局正文出现',
      () => t.visible('#endingStory') && t.text('#storyText').length > 0, 20000)
      .then(() => true).catch(() => false);
    check('系统测试跑完后先播结局正文（全屏）',
      storyShown, t.text('#storyText').slice(0, 40));

    const len1 = t.text('#storyText').length;
    await t.sleep(320);
    const len2 = t.text('#storyText').length;
    check('结局正文是逐字打出来的（打字机在跑）',
      storyShown && len2 > len1, `${len1} → ${len2} 字`);

    /* 打字中按一次：本段立刻完整；再等 400ms 不应继续变长（动画确实停了） */
    t.key('Space', 'keydown');
    await t.sleep(120);
    const lenFull = t.text('#storyText').length;
    await t.sleep(400);
    check('打字中按键：本段立刻显示完整并停笔',
      lenFull > len2 && t.text('#storyText').length === lenFull,
      `${len2} → ${lenFull}（400ms 后 ${t.text('#storyText').length}）`);

    /* 再按一次：进入下一段 —— 正文从短重新长起来，进度 +1 */
    t.key('Space', 'keydown');
    await t.sleep(100);
    const lenNext = t.text('#storyText').length;
    check('本段完整后再按一次才进入下一段',
      lenNext < lenFull && /^2 \/ \d+$/.test(t.text('#storyProgress')),
      `长度 ${lenNext} ｜ 进度 "${t.text('#storyProgress')}"`);

    /* 一路按到底 → 揭榜 */
    let presses = 0;
    while (!t.visible('#endResult') && presses++ < 100){
      t.key('Space', 'keydown');
      await t.sleep(60);
    }
    check('正文按完后正常揭榜',
      presses < 100 && t.visible('#endResult') && !t.visible('#endingStory'),
      `按键 ${presses} 次 ｜ 进度 "${t.text('#storyProgress')}"`);

    const finalScore = Number((t.text('#endScore') || '').trim());
    check('揭榜显示最终总分', Number.isFinite(finalScore) && finalScore >= 0,
      `#endScore="${t.text('#endScore')}"`);
    check('结算明细带上系统测试成绩与预测试对照',
      /系统测试/.test(t.text('#endDetail')) && /预测试/.test(t.text('#endDetail')),
      t.text('#endDetail').slice(0, 80));

    /* 10. 结局系统与统计系统（都是纯前端渲染，只能在真浏览器里验）
       揭榜的标题/副标题/徽章/统计格子/事件回顾全部来自
       data/endings/<id>.js + systems/stats.js 的快照。 */
    check('揭榜带结局徽章（结局系统生效）',
      (t.text('#endBadge') || '').length > 0, `#endBadge="${t.text('#endBadge')}"`);
    const statCells = t.el('#endStats') ? t.el('#endStats').children.length : 0;
    check('结算统计格子渲染出来（主线 4 项恒显示，最多 9 项）',
      statCells >= 4 && statCells <= 9, `格子数=${statCells}`);
    /* 非主线的数据为 0 时整格不渲染 —— 所以格子里绝不会出现
       「0警告次数」这种文本。这条不依赖本局跑出什么数据，换一局照样成立。 */
    const statsText = t.text('#endStats') || '';
    const zeroShown = ['警告次数', '击倒保安', '干扰同学', '偷用电脑', '触发事件']
      .filter(l => statsText.includes('0' + l));
    check('非主线统计为 0 时该格不显示（警告/保安/干扰/偷用电脑/事件）',
      zeroShown.length === 0, `${zeroShown.join('、')} ｜ ${statsText.slice(0, 100)}`);
    const evCount = t.el('#endEvents') ? t.el('#endEvents').children.length : 0;
    check('结算渲染本场事件回顾（事件流非空）', evCount > 0, `事件条数=${evCount}`);

    /* 11. 展示墙落库：揭榜的同时，结局与成就已经写进本机图鉴（oi_profile_v1）。
       这里点一下（隐藏的）展示墙选项卡，会触发 showStartPage → renderWall 重读。 */
    t.click('[data-start-tab="wall"]');
    const wallEndCount = t.el('#wallEnd') ? t.el('#wallEnd').querySelectorAll('.wall-item').length : 0;
    const wallAchCount = t.el('#wallAch') ? t.el('#wallAch').querySelectorAll('.wall-item').length : 0;
    check('揭榜后结局进入展示墙（跨场次持久化）',
      wallEndCount >= 1, `结局条目=${wallEndCount}`);
    check('揭榜后成就进入展示墙（安分守己 = 零警告完赛）',
      wallAchCount >= 1, `成就条目=${wallAchCount} ｜ ${t.text('#wallAch').slice(0, 60)}`);

    return { steps, failures };
  })();
}

/* ---------- 主流程 ---------- */
async function main(){
  /* CDP 走 WebSocket，而**全局 WebSocket 是 Node 22 才有的**
     （Node 20 里的 undici 并不暴露全局构造器）。
     这里提前拦一道：否则报出来的是一句「WebSocket is not defined」，
     和「脚本自己写错了」长得一模一样 —— CI 上真的这么错过一次
     （ci.yml 当时钉在 Node 20，而本地是 22，于是本地全绿、CI 全红）。 */
  if (typeof WebSocket === 'undefined'){
    throw new Error(`冒烟测试需要 Node ≥ 22（CDP 依赖全局 WebSocket），当前是 ${process.version}`);
  }

  /* 顺手清掉上次被强杀留下的浏览器 profile 目录（10~20 MB/个） */
  const swept = sweepStaleProfiles(ROOT);
  if (swept) console.log(`已清理 ${swept} 个残留的浏览器 profile 目录`);

  const distDir = path.join(ROOT, 'dist');
  if (!USE_DEV && !existsSync(path.join(distDir, 'index.html'))){
    throw new Error('dist/index.html 不存在，先运行 npm run build');
  }

  const server = USE_DEV ? null : await serveDir(distDir);
  const url = USE_DEV
    ? (process.env.DEV_URL || 'http://127.0.0.1:5173/')
    : `http://127.0.0.1:${server.address().port}/`;

  const browser = await launchBrowser();
  const cdp = await connect(browser.wsUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  /* 无头 Chromium 在本环境下不会调度帧（rAF 一次都不触发），
     主循环因此只会跑第一帧。这里注入一个 setTimeout 版的 rAF 垫片，
     让主循环真正转起来 —— 纯测试侧改动，产物代码不含任何测试分支。 */
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (() => {
        const raf = cb => setTimeout(() => cb(performance.now()), 16);
        window.requestAnimationFrame = raf;
        window.cancelAnimationFrame = id => clearTimeout(id);
      })();
    `
  });

  await cdp.send('Page.navigate', { url: url + '?smoke=1' });

  /* 让无头页面相信自己处于前台且被聚焦，
     否则 rAF 会因为「页面不可见」而停发，主循环冻在第一帧。 */
  try {
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  } catch (e){
    console.log('（焦点模拟不可用：' + e.message + '）');
  }

  /* 等页面 load */
  const t0 = Date.now();
  let loaded = false;
  while (Date.now() - t0 < 20000 && !loaded){
    await sleep(200);
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'document.readyState', returnByValue: true
    });
    loaded = r.result.value === 'complete';
  }

  const evalResult = await cdp.send('Runtime.evaluate', {
    expression: `(${pageScript.toString()})(${JSON.stringify({ expectProbe: USE_DEV })})`,
    returnByValue: true,
    awaitPromise: true,
    timeout: 90000
  });

  const report = evalResult.result.value;
  const pageErrors = cdp.events.filter(e =>
    e.kind === 'exception' ||
    (e.kind === 'console' && e.type === 'error') ||
    e.kind === 'log');

  /* 截图（可选）：SHOT_DIR=<目录> 时保存三张图，用于人工核对画面。
     这里**重新加载一次页面**再走一遍固定操作，好处是视角回到初始状态
     （yaw = pitch = 0），不受前面交互步骤（低头看显示器）的影响，
     每次得到的都是同一机位，可以直接和新旧版本比对。 */
  const shotDir = process.env.SHOT_DIR;
  if (shotDir){
    mkdirSync(shotDir, { recursive: true });
    const shoot = async (name) => {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(shotDir, name + '.png');
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log(`已保存截图：${file}`);
    };

    await cdp.send('Page.navigate', { url: url + '?shot=1' });
    for (let i = 0; i < 100; i++){
      await sleep(200);
      const r = await cdp.send('Runtime.evaluate', {
        expression: `document.readyState === 'complete' && !document.getElementById('boot')`,
        returnByValue: true
      });
      if (r.result.value === true) break;
    }
    /* 启动屏四个分页各来一张：分页只切 .hidden，断言证明得了「切过去了」，
       证明不了「没切歪」（元素重叠、溢出、留白失衡），那只能靠眼睛。
       展示墙这一张会带着刚才那一局解锁的成就与结局 —— 顺便人工核对卡片版式。 */
    for (const page of ['intro', 'settings', 'wall', 'about']){
      await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-start-tab="${page}"]').click()`,
        returnByValue: true
      });
      await sleep(300);
      await shoot('start-' + page);
    }

    await cdp.send('Runtime.evaluate', {
      expression: `document.getElementById('btnStart').click()`, returnByValue: true
    });
    await sleep(1500);
    await shoot('world');          /* 初始机位：正对自己的课桌 */

    /* 原地转身 180°，看向后排的选手与巡逻中的监考老师 */
    await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const key = (code, type) => document.dispatchEvent(
          new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
        key('ArrowLeft', 'keydown');
        await new Promise(r => setTimeout(r, 1500));
        key('ArrowLeft', 'keyup');
      })()`,
      returnByValue: true,
      awaitPromise: true
    });
    await sleep(1500);
    await shoot('npcs');

    await cdp.send('Runtime.evaluate', {
      expression: `document.getElementById('btnSettings').click()`, returnByValue: true
    });
    await sleep(500);
    await shoot('settings');
  }

  console.log(`\n目标：${url}${USE_DEV ? '  (vite dev 源码)' : '  (dist 构建产物)'}`);
  console.log('─'.repeat(64));
  for (const s of report.steps){
    console.log(`${s.ok ? '  ✓' : '  ✗'} ${s.name}${s.extra ? '   [' + s.extra + ']' : ''}`);
  }

  if (pageErrors.length){
    console.log('\n控制台错误：');
    for (const e of pageErrors.slice(0, 20)) console.log('  ! ' + e.text.split('\n')[0]);
  } else {
    console.log('\n控制台无错误。');
  }

  const failed = report.failures.length + pageErrors.length;
  await cdp.close();
  await browser.close();
  if (server) server.close();

  console.log('─'.repeat(64));
  if (failed){
    console.log(`冒烟测试失败：${report.failures.length} 项断言失败，${pageErrors.length} 条控制台错误\n`);
    process.exitCode = 1;
  } else {
    console.log(`冒烟测试通过：${report.steps.length} 项断言全部通过\n`);
  }
}

main().catch(e => {
  console.error('冒烟测试异常：' + e.message);
  process.exitCode = 1;
});
