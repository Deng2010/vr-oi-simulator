import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { htmlPartials } from './build/vite-plugin-html-partials.mjs';

/* 版本号来自 package.json；发布流水线会用 APP_VERSION 覆盖成 tag 对应的版本。
   release.yml 里已经强制「Release 的 tag 必须等于 package.json 版本」，
   所以两者在发布路径上一定一致；nightly.yml 注入的是
   「版本号 + -nightly.<日期>.<短 SHA>」，package.json 原样不动。 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const APP_VERSION = process.env.APP_VERSION || pkg.version;

/* base 用相对路径 './'：
   GitHub Pages 是项目站点（/vr-oi-simulator/），相对路径既能用于
   子路径部署，也能直接用 file:// 之外的任意静态服务器打开，无需改配置。 */
export default defineConfig({
  base: './',
  /* 静态资源统一放在仓库根的 assets/ 下，由 import 走打包器处理
     （内容哈希 + 长缓存），因此关闭 Vite 的 public/ 目录约定。 */
  publicDir: false,
  plugins: [htmlPartials()],

  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },

  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    /* 单页应用：CSS 合并成一个文件，避免多份 <link> 串行往返 */
    cssCodeSplit: false,
    cssMinify: true,
    minify: 'esbuild',
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        /* three 单独成 chunk：版本升级时不会让应用代码的缓存失效 */
        manualChunks: { three: ['three'] },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true }
});
