import js from '@eslint/js';
import globals from 'globals';

/* 分层配置：
   src/ 只给浏览器全局变量，这样 no-undef 能真正抓出
   「重构时忘了 import / 抄错了名字」这类问题；
   tools/ 与 tests/ 运行在 Node 下，单独放宽。 */
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.npm-cache/**',
      'src/data/problems/P*.md'
    ]
  },

  /* ---------- 浏览器端源码 ---------- */
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        /* 由 vite.config.js 的 define 在构建期替换成字符串字面量 */
        __APP_VERSION__: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_'
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-var': 'error',
      'prefer-const': 'off',
      /* 原代码在字符串里用了全角/不换行空格做排版（如 HUD 里的 "总分 … / 400"），
         以及在正则里用 \x00 当占位分隔符，都是有意的，放开这两条。 */
      'no-irregular-whitespace': ['error', {
        skipStrings: true,
        skipTemplates: true,
        skipRegExps: true,
        skipComments: true
      }],
      'no-control-regex': 'off'
    }
  },

  /* ---------- 构建期脚本与测试（Node） ---------- */
  {
    files: ['build/**/*.mjs', 'tools/**/*.mjs', 'tests/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },

  /* ---------- 冒烟测试里「跑在浏览器里」的那段脚本 ----------
     tools/smoke-test.mjs 的 pageScript() 会被序列化后注入页面执行，
     所以它虽然在 Node 文件里，用的却是浏览器 API。 */
  {
    files: ['tools/smoke-test.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  }
];
