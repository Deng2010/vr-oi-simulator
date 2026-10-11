/* =========================================================
   无头浏览器 profile 目录 + 子进程的生命周期管理
   ---------------------------------------------------------
   tools/smoke-test.mjs 与 tools/bake-assets.mjs 都会在仓库根目录下建一个
   `.chrome-<tag>-<pid>` 作为 Chromium 的 --user-data-dir（不用系统临时目录，
   因为受限沙箱里 /tmp 未必可写）。

   这个目录有 10~20 MB，而且 Chromium 会拉起一堆 helper 子进程（几百 MB 内存），
   所以「清理」必须同时做两件事，顺序还不能反：
     1. 先 SIGKILL 浏览器进程 —— 否则它会继续读写这个目录；
     2. 再删目录 —— 子进程刚被杀时文件句柄还没回收，
        删目录可能 ENOTEMPTY，所以要重试。
   只做第 2 步的话，目录删不掉、Chromium 还留在后台。

   三种终止路径都要覆盖：
     · 正常结束 / 抛异常            → dispose()
     · Ctrl-C / kill（SIGINT/TERM） → 信号处理器里同步收尾
     · 被 SIGKILL（连信号都收不到） → 下次启动时扫掉过期残留
   ========================================================= */
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const PREFIX = '.chrome-';
const STALE_MS = 30 * 60 * 1000;

/* 同步睡眠：信号处理器里不能 await，而「等子进程退出」是必要的 */
function sleepSync(ms){
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

/** 清掉上次被强杀留下的 profile 目录，返回删除数量 */
export function sweepStaleProfiles(root){
  let removed = 0;
  let entries;
  try {
    entries = readdirSync(root);
  } catch (e){
    return 0;
  }
  for (const name of entries){
    if (!name.startsWith(PREFIX)) continue;
    const dir = path.join(root, name);
    try {
      /* 30 分钟阈值：正常一次冒烟/烘焙只要几十秒，
         更久必然是上次没清掉的，删掉不会误伤并发运行的实例。 */
      if (Date.now() - statSync(dir).mtimeMs < STALE_MS) continue;
      rmSync(dir, { recursive: true, force: true });
      removed++;
    } catch (e){
      /* 忽略：可能是并发实例正在使用 */
    }
  }
  return removed;
}

/**
 * 建一个专属的浏览器 profile 目录，并注册退出清理。
 * @param {string} root 仓库根目录
 * @param {string} tag  'smoke' | 'bake'
 * @returns {{dir:string, trackChild:(c:any)=>void, dispose:()=>boolean}}
 */
export function createProfile(root, tag){
  const dir = path.join(root, `${PREFIX}${tag}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const children = new Set();
  let disposed = false;

  const killChildren = () => {
    for (const c of children){
      try { c.kill('SIGKILL'); } catch (e){ /* 已经退出了 */ }
    }
    children.clear();
  };

  const removeDir = (attempts = 5) => {
    for (let i = 0; i < attempts; i++){
      try {
        rmSync(dir, { recursive: true, force: true });
        return true;
      } catch (e){
        sleepSync(120);          /* 等内核回收文件句柄后再试 */
      }
    }
    return false;
  };

  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    killChildren();
    return removeDir();
  };

  /** 登记浏览器子进程：dispose / 收到信号时会先把它杀掉 */
  const trackChild = child => {
    if (!child) return;
    children.add(child);
    if (typeof child.once === 'function'){
      child.once('exit', () => children.delete(child));
    }
  };

  process.once('exit', () => {
    if (disposed) return;
    disposed = true;
    killChildren();
    removeDir(2);
  });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']){
    process.once(sig, () => {
      disposed = true;
      killChildren();
      sleepSync(250);            /* 让 Chromium 有时间退出，否则目录删不干净 */
      removeDir(3);
      process.exit(130);
    });
  }

  return { dir, trackChild, dispose };
}
