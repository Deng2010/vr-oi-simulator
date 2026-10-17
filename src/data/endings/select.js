/* =========================================================
   结局判定（纯函数，无副作用、不碰 DOM）
   ---------------------------------------------------------
   为什么和 index.js 分开：
     和 data/problems/selection.js 一个套路 —— 「收哪些结局」是数据，
     「挑哪一个」是逻辑；逻辑放在这里才能被 tests/run.mjs 直接单测，
     不必把整个注册表（以及它的每个结局文件）拖进测试的 import 图。

   两个阶段：
     · stage='immediate'：违纪/被抓这类**当场作废**的结局，在交卷时
       用赛中快照判定，判定命中就不跑系统测试（现实里成绩被取消的
       选手不会进评测队列）。
     · stage='final'：跑完系统测试后，用带最终分数的快照判定。
   ========================================================= */
import { ENDINGS } from './index.js';

export const ENDING_STAGES = ['immediate', 'final'];

/**
 * 取出某阶段的结局，按 priority 降序；同优先级保持文件里的声明顺序
 * （显式带下标比较，不依赖 Array#sort 的稳定性）。
 * @param {'immediate'|'final'} stage
 */
export function sortedEndings(stage){
  return ENDINGS
    .map((ending, index) => ({ ending, index }))
    .filter(x => (x.ending.stage || 'final') === stage)
    .sort((a, b) => ((b.ending.priority || 0) - (a.ending.priority || 0)) || (a.index - b.index))
    .map(x => x.ending);
}

/**
 * 在某个阶段里挑出唯一结局：第一个 condition 命中的。
 * 不写 condition 的结局视为恒真 —— 那就是该阶段的兜底。
 * @param {object} snapshot 统计快照（见 systems/stats.js）
 * @param {'immediate'|'final'} [stage]
 * @returns {object|null} 没命中任何结局时为 null
 *   （final 有兜底所以不会是 null；immediate 返回 null 表示「没有违规」）
 */
export function resolveEnding(snapshot, stage = 'final'){
  for (const ending of sortedEndings(stage)){
    if (!ending.condition || ending.condition(snapshot)) return ending;
  }
  return null;
}

/** 结局文案允许写成字符串或 (snapshot) => string，这里统一取值。 */
export function endingText(value, snapshot){
  if (typeof value === 'function') return String(value(snapshot) || '');
  return value == null ? '' : String(value);
}

/**
 * 配置自检。返回问题清单（空数组 = 没问题）。
 * @param {object[]} [list] 默认检查整个注册表
 */
export function validateEndings(list = ENDINGS){
  const problems = [];
  const seen = new Set();

  list.forEach((e, i) => {
    if (!e || typeof e !== 'object'){ problems.push(`#${i} 不是对象`); return; }
    const where = e.id || `#${i}`;
    if (!e.id) problems.push(`#${i} 缺 id`);
    else if (seen.has(e.id)) problems.push(`id 重复：${e.id}`);
    seen.add(e.id);

    const stage = e.stage || 'final';
    if (!ENDING_STAGES.includes(stage)) problems.push(`${where} 的 stage 非法：${e.stage}`);
    /* 每个结局都必须在结算界面上占一个位置：标题、徽章、语气缺一不可 */
    if (!e.title) problems.push(`${where} 缺 title`);
    if (!e.badge) problems.push(`${where} 缺 badge`);
    if (!e.tone) problems.push(`${where} 缺 tone`);
    if (typeof e.priority !== 'number') problems.push(`${where} 缺 priority`);
    /* 正文分段：不给的话玩家会卡在一个空的全屏屏幕上 */
    if (!e.story){
      problems.push(`${where} 缺 story（结局正文分段）`);
    } else if (typeof e.story !== 'function' && !Array.isArray(e.story)){
      problems.push(`${where} 的 story 必须是分段数组或函数`);
    }
    if (e.condition !== undefined && typeof e.condition !== 'function'){
      problems.push(`${where} 的 condition 不是函数`);
    }
    /* 不跑系统测试的结局必须把分数作废，否则界面上会显示一个
       「作废但仍有分数」的矛盾结果 */
    if (stage === 'immediate' && e.voidScore !== true){
      problems.push(`${where} 是 immediate 结局却没有 voidScore`);
    }
  });

  /* 兜底与「不许无条件命中」：
     · final 阶段必须**恰好一个**兜底（不写 condition 的那个），
       否则快照一旦不匹配，结算界面就什么都不显示 —— 比显示错结局还糟；
     · immediate 阶段的结局必须**每一个都有 condition**，
       否则一局比赛开局就会被判违纪。 */
  for (const stage of ENDING_STAGES){
    const stageList = list.filter(e => e && (e.stage || 'final') === stage);
    const unconditional = stageList.filter(e => !e.condition);
    if (stage === 'final'){
      if (unconditional.length !== 1){
        problems.push(`final 阶段必须恰好有一个兜底结局（现在 ${unconditional.length} 个）`);
      }
    } else if (unconditional.length){
      problems.push(`immediate 阶段的结局必须有 condition：` +
        unconditional.map(e => e.id || '(无名)').join('、'));
    }
  }
  return problems;
}
