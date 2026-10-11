/* =========================================================
   烘焙静态贴图 → assets/textures/*.webp
   ---------------------------------------------------------
   用法：  npm run bake:assets
   可选：  CHROME_PATH=/path/to/chrome npm run bake:assets
           FORMAT=png QUALITY=0.85 npm run bake:assets

   为什么默认 WebP：黑板贴图是「大面积纯色 + 抗锯齿文字」，
   PNG 无调色板时约 59 KB，WebP q0.85 只要二十 KB 左右，
   而目标是 WebGL 场景 —— 能跑 WebGL 的浏览器必定支持 WebP。

   流程：
     1. 用 esbuild 把 src/render/texture-painters.js 打成一个 IIFE，
        这样绘制代码只有一份，烘焙与开发不会漂移；
     2. 启动无头 Chromium（Canvas2D 不需要 GPU），通过 CDP 执行它，
        把每张贴图 toDataURL() 出来；
     3. base64 解码写成 PNG。

   只依赖 esbuild + 系统里已装的 Chromium，不引入 Puppeteer/Playwright。
   ========================================================= */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { createProfile, sweepStaleProfiles } from './lib/chrome-profile.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 用 fileURLToPath 而不是 URL.pathname：后者在部分 Node 版本上
   会丢掉结尾斜杠，导致拼接出来的路径少一层分隔符。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets/textures');

const FORMAT = process.env.FORMAT || 'webp';
const QUALITY = Number(process.env.QUALITY || 0.85);
const MIME = FORMAT === 'png' ? 'image/png' : 'image/webp';
const MIME_RE = new RegExp('^data:' + MIME + ';base64,');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome(){
  for (const c of CHROME_CANDIDATES){
    if (existsSync(c)) return c;
  }
  throw new Error(
    '找不到 Chromium/Chrome。请设置 CHROME_PATH 环境变量指向浏览器可执行文件。\n' +
    '已尝试：\n  ' + CHROME_CANDIDATES.join('\n  '));
}

/* 把绘制模块打成浏览器可直接 eval 的单文件 */
async function bundlePainters(){
  const toDataUrl = FORMAT === 'png'
    ? "c.toDataURL('image/png')"
    : `c.toDataURL('image/webp', ${QUALITY})`;
  const result = await build({
    stdin: {
      contents: `
        import { STATIC_TEXTURES } from './src/render/texture-painters.js';
        window.__bakeAll = () => STATIC_TEXTURES.map(t => {
          const c = document.createElement('canvas');
          c.width = t.width;
          c.height = t.height;
          const cx = c.getContext('2d');
          t.paint(cx);
          return { name: t.name, width: t.width, height: t.height, dataUrl: ${toDataUrl} };
        });`,
      resolveDir: ROOT,
      sourcefile: 'bake-entry.js',
      loader: 'js'
    },
    bundle: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    logLevel: 'warning'
  });
  return result.outputFiles[0].text;
}

/* 极简 CDP 客户端：只需要 Runtime.evaluate */
async function withBrowser(fn){
  const exe = findChrome();
  /* profile 放在仓库内（已 gitignore）：受限沙箱环境下 /tmp 未必可写。
     用 createProfile 保证正常退出 / 抛错 / 被 Ctrl-C 都会删掉。 */
  const profile = createProfile(ROOT, 'bake');
  const userDataDir = profile.dir;

  const child = spawn(exe, [
    '--headless=new',
    /* 无头 Chromium 在容器 / 受限沙箱里自带的 setuid sandbox 起不来，
       而这里只跑 Canvas2D，不需要隔离，因此关掉它。 */
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  profile.trackChild(child);      /* 信号清理时会先杀掉它，再删目录 */

  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });

  try {
    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 100 && port === null; i++){
      await sleep(100);
      if (existsSync(portFile)){
        port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      }
    }
    if (!port) throw new Error('无头浏览器启动失败（未生成 DevToolsActivePort）\n' + stderr);

    let targets = null;
    for (let i = 0; i < 50 && !targets; i++){
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await res.json();
        targets = list.find(t => t.type === 'page');
      } catch (e){ /* 还没就绪，继续等 */ }
      if (!targets) await sleep(100);
    }
    if (!targets) throw new Error('无头浏览器没有可用的页面目标');

    return await fn({ wsUrl: targets.webSocketDebuggerUrl });
  } finally {
    child.kill('SIGKILL');
    await sleep(150);
    profile.dispose();
  }
}

function evaluate(wsUrl, expression){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e){ /* ignore */ }
      reject(new Error('CDP 求值超时'));
    }, 30000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true }
      }));
    });
    ws.addEventListener('message', ev => {
      clearTimeout(timer);
      const msg = JSON.parse(ev.data);
      if (msg.id !== 1) return;
      ws.close();
      if (msg.result && msg.result.exceptionDetails){
        reject(new Error('绘制脚本抛错: ' +
          (msg.result.exceptionDetails.exception?.description ||
           msg.result.exceptionDetails.text)));
      } else if (msg.error){
        reject(new Error('CDP 错误: ' + JSON.stringify(msg.error)));
      } else {
        resolve(msg.result.result.value);
      }
    });
    ws.addEventListener('error', e => {
      clearTimeout(timer);
      reject(new Error('CDP 连接失败: ' + (e.message || 'unknown')));
    });
  });
}

async function main(){
  const swept = sweepStaleProfiles(ROOT);
  if (swept) console.log(`已清理 ${swept} 个残留的浏览器 profile 目录`);

  const bundle = await bundlePainters();
  mkdirSync(OUT_DIR, { recursive: true });

  /* 结果用 JSON 字符串过桥：returnByValue 对大体积 data URL 更稳 */
  const raw = await withBrowser(({ wsUrl }) =>
    evaluate(wsUrl, `${bundle}\nJSON.stringify(window.__bakeAll())`));
  const textures = JSON.parse(raw);

  for (const t of textures){
    const b64 = t.dataUrl.replace(MIME_RE, '');
    const file = path.join(OUT_DIR, `${t.name}.${FORMAT}`);
    writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`✓ ${path.relative(ROOT, file)}  ${t.width}×${t.height}  ` +
                `${(Buffer.from(b64, 'base64').length / 1024).toFixed(1)} KB`);
  }
  console.log(`\n共烘焙 ${textures.length} 张贴图到 assets/textures/`);
}

main().catch(e => {
  console.error('烘焙失败：' + e.message);
  process.exitCode = 1;
});
