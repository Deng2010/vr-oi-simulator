/* =========================================================
   pixelRatio 自适应策略（纯函数）
   ---------------------------------------------------------
   单独成模块的原因：把「决策」和「副作用」分开。
   决策逻辑无依赖、无副作用，可以直接被单元测试覆盖
   （tests/run.mjs 里有针对它的用例），
   而 src/core/perf.js 只负责把决策结果施加到 renderer 上。

   为什么带滞回：
     这个场景是填充率受限（大量小三角形），DPR 1.5 → 1.0 意味着
     像素数减少 55%，是弱机最有效的一档调节；
     但如果一到 45fps 就降、一到 46fps 就升，会在阈值附近反复震荡，
     每次切换都要 setSize（重建绘制缓冲），反而更卡。
     所以：降档要连续 2 个慢窗口，升档要连续 4 个快窗口。
   ========================================================= */

export const MIN_PIXEL_RATIO = 1.0;
export const MAX_PIXEL_RATIO = 1.5;
export const PIXEL_RATIO_STEP = 0.25;

export const LOW_FPS = 45;
export const HIGH_FPS = 58;

export const LOW_STREAK_TO_DROP = 2;
export const HIGH_STREAK_TO_RAISE = 4;

/**
 * 根据一个统计窗口的帧率，算出下一档 pixelRatio。
 * @param {{ratio:number, lowStreak:number, highStreak:number}} state
 * @param {number} windowFps 该窗口的平均帧率
 * @returns {{ratio:number, lowStreak:number, highStreak:number, changed:boolean,
 *            direction:'down'|'up'|'none'}}
 */
export function nextPixelRatio(state, windowFps){
  let { ratio, lowStreak, highStreak } = state;
  let direction = 'none';

  if (windowFps < LOW_FPS){
    lowStreak++;
    highStreak = 0;
    if (lowStreak >= LOW_STREAK_TO_DROP && ratio > MIN_PIXEL_RATIO){
      ratio = Math.max(MIN_PIXEL_RATIO, ratio - PIXEL_RATIO_STEP);
      lowStreak = 0;
      direction = 'down';
    }
  } else if (windowFps > HIGH_FPS && ratio < MAX_PIXEL_RATIO){
    highStreak++;
    lowStreak = 0;
    if (highStreak >= HIGH_STREAK_TO_RAISE){
      ratio = Math.min(MAX_PIXEL_RATIO, ratio + PIXEL_RATIO_STEP);
      highStreak = 0;
      direction = 'up';
    }
  } else {
    /* 45~58fps 的死区：维持现状，同时清掉连胜计数 */
    lowStreak = 0;
    highStreak = 0;
  }

  return { ratio, lowStreak, highStreak, changed: direction !== 'none', direction };
}

/** 初始状态：从最高画质起步 */
export function initialPixelRatioState(){
  return { ratio: MAX_PIXEL_RATIO, lowStreak: 0, highStreak: 0 };
}
