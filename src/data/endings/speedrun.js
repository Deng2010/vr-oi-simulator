/* =========================================================
   结局：闪电交卷（神速）
   ---------------------------------------------------------
   触发：提前交卷（不是时间到）、虚拟用时 1 小时以内、且拿到 200 分以上。
   三个条件缺一不可：既要快，也不能是「不会做所以早交」。
   ========================================================= */

/* 快与好各自的阈值，导出给 npm test 当判据 */
export const SPEEDRUN_MAX_SECONDS = 3600;
export const SPEEDRUN_MIN_SCORE = 200;

export default {
  id: 'speedrun',
  stage: 'final',
  priority: 45,
  badge: '结局 · 神速',
  title: '闪 电 交 卷',
  tone: 'fun',
  voidScore: false,
  achievements: ['speedrun'],
  condition: s => s.manualSubmit === true
    && (s.elapsed || 0) <= SPEEDRUN_MAX_SECONDS
    && (s.finalScore || 0) >= SPEEDRUN_MIN_SCORE,
  subtitle: s => `用时 ${Math.floor((s.elapsed || 0) / 60)} 分钟，得分 ${s.finalScore}。`,

  story: s => [
    `用时 ${Math.floor((s.elapsed || 0) / 60)} 分钟，得分 ${s.finalScore}。你按下交卷的时候，隔壁还在对着第三题发呆。`,
    '监考老师愣了一下：「……你确定不再看看了？还有三个多小时。」',
    '你确定。你不是不想看，你只是清楚：再坐三个小时，这道题的思路也不会自己长出来。',
    '有人抱着「再卡卡常就过了」的念头坐到最后一秒；你那 200 分是暴力拿的，暴力的上限你心里有数。',
    '走廊里空荡荡的，你听见自己的脚步声，比开考时轻快得多。'
  ]
};
