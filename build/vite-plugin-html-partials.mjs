/* =========================================================
   Vite 插件：index.html 的 HTML 局部模板内联
   ---------------------------------------------------------
   语法：  <!--#include src/ui/partials/xxx.html -->
   把界面按覆盖层拆成 src/ui/partials/*.html，各自包含属于自己的
   标记；构建时（以及 dev 时）原样拼回 index.html，因此：
     · 产物仍是单文件入口，没有额外请求；
     · 改动某个面板只需动一个小文件；
     · 顺序由 index.html 里的 include 顺序显式决定，可读可 review。
   ========================================================= */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INCLUDE_RE = /^([ \t]*)<!--#include\s+(\S+?)\s*-->[ \t]*$/gm;
const PARTIAL_DIR = 'src/ui/partials/';

export function htmlPartials(root = process.cwd()){
  const render = html => html.replace(INCLUDE_RE, (_m, indent, file) => {
    const abs = resolve(root, file);
    let body;
    try {
      body = readFileSync(abs, 'utf8');
    } catch (e){
      throw new Error(`[html-partials] 无法读取局部模板 ${file}: ${e.message}`);
    }
    body = body.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    return body.split('\n').map(l => (l ? indent + l : l)).join('\n');
  });

  return {
    name: 'vr-oi:html-partials',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler: render
    },
    configureServer(server){
      const dir = resolve(root, PARTIAL_DIR);
      server.watcher.add(dir);
      server.watcher.on('all', (_event, file) => {
        if (resolve(file).startsWith(dir)){
          server.ws.send({ type: 'full-reload' });
        }
      });
    }
  };
}
