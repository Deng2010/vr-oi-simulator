/* =========================================================
   结局：AK（四题全部 Accepted）
   ---------------------------------------------------------
   触发：系统测试（20 点）下四道题全部满分。
   注意判据是**系统测试**的 finalSolves，不是赛中预测试 ——
   预测试满分不等于 AC（见 ui/ending.js 的成就判定）。
   ========================================================= */

export default {
  id: 'ak',
  stage: 'final',
  priority: 70,
  badge: '结局 · AK',
  title: 'A K 全 场',
  tone: 'good',
  voidScore: false,
  achievements: ['full_score', 'first_ac'],
  condition: s => (s.problemCount || 0) > 0 && s.finalSolves >= s.problemCount,
  subtitle: s => `${s.problemCount} 道题，${s.problemCount} 个 Accepted。`,

  /* 分段正文：全屏播放，按键逐段推进（见 systems/story.js） */
  story: [
    '四道题的最后一组数据跑完，评测机安静了半秒。',
    '然后屏幕上并排亮起四个绿色的 Accepted，像四盏同时亮起的灯。',
    '隔壁的同学凑过来看了一眼，默默把自己的显示器往旁边挪了挪。',
    '你想起开考二十分钟时，你还在怀疑 T1 的题意有歧义。',
    '你没有卡常，没有打表，也没有用 #pragma —— 就是老老实实把四道题写完了。',
    '监考老师走过来，什么也没说，只是点了点头。他也是从那个年代过来的。',
    '你把草稿纸折好，起身离场。这一次，没有人拦你。'
  ]
};
