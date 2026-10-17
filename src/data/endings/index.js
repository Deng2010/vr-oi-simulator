/* =========================================================
   结局注册表
   ---------------------------------------------------------
   每个结局一个文件（src/data/endings/<id>.js），这里**显式** import。
   为什么不用 import.meta.glob（题库那边用了）：
     glob 只在 Vite 里能跑，而 tests/run.mjs 会直接 import 本模块来
     校验配置 —— 用了 glob，Node 里连解析都过不去。
     结局只有十来个、体积极小，没有懒加载的必要。

   加一个结局 = 新建一个文件 + 在下面加一行（npm test 会检查
   文件数与注册数是否对得上，忘了加行会红）。
   ========================================================= */
import ak from './ak.js';
import banned from './banned.js';
import blank from './blank.js';
import brawler from './brawler.js';
import caught from './caught.js';
import cheat from './cheat.js';
import disqualified from './disqualified.js';
import finished from './finished.js';
import speedrun from './speedrun.js';
import timeup from './timeup.js';
import zero from './zero.js';

/* 声明顺序不影响判定：select.js 按 priority 降序挑第一个命中的。
   这里按「违纪 → 答题 → 常规收场」分组，纯粹为了好读。 */
export const ENDINGS = [
  banned, caught, cheat, disqualified,
  ak, blank, zero, speedrun, brawler,
  timeup, finished
];
