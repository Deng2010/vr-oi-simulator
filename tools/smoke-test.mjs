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
     题面懒加载 → 提交评测 → 评测结果 → 离开 IDE → Esc 设置面板。
   任何一步失败或控制台报错都会让脚本以非 0 退出。
   ========================================================= */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
  const userDataDir = path.join(ROOT, `.chrome-smoke-${process.pid}`);
  mkdirSync(userDataDir, { recursive: true });

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
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch (e){ /* ignore */ }
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
        ? `网格 ${perfFront.meshesBeforeBatch} → ${perfFront.sceneMeshes}（合批 ${perfFront.mergedGroups} 组）` +
          ` drawCalls=${perfFront.drawCalls} programs=${perfFront.programs}` +
          ` pixelRatio=${perfFront.pixelRatioSetting}` +
          ` frameMs=${perfFront.frameMs.toFixed(2)} fps=${perfFront.fps.toFixed(1)}`
        : '（生产构建，探针被摇掉 —— 符合预期）'
    });

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

    /* 4. E 打开 IDE（走 doInteract → openCode → 题面懒加载） */
    t.key('KeyE', 'keydown');
    await t.sleep(300);
    const ideOpened = t.visible('#codeUI');
    check('E 键打开代码界面', ideOpened);

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

    return { steps, failures };
  })();
}

/* ---------- 主流程 ---------- */
async function main(){
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

  /* 截图（可选）：SHOT_DIR=<目录> 时保存世界视图与设置面板，
     用于人工比对重构前后的画面是否一致。 */
  const shotDir = process.env.SHOT_DIR;
  if (shotDir){
    mkdirSync(shotDir, { recursive: true });
    const shoot = async (name) => {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(shotDir, name + '.png');
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log(`已保存截图：${file}`);
    };
    await sleep(1200);                       /* 让世界视图稳定渲染几帧 */
    await shoot('world');
    await cdp.send('Runtime.evaluate', {
      expression: `document.getElementById('btnSettings').click()`, returnByValue: true
    });
    await sleep(500);
    await shoot('settings');
  }
  const pageErrors = cdp.events.filter(e =>
    e.kind === 'exception' ||
    (e.kind === 'console' && e.type === 'error') ||
    e.kind === 'log');

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
