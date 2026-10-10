/* =========================================================
   全局游戏状态与比赛常量
   由 index.html 内联脚本第 705-726 行拆出。
   ========================================================= */
import * as THREE from 'three';

export const CONTEST_LEN = 4 * 3600;

export const state = {
  started: false, ended: false, frozen: false,
  view: 'world',
  elapsed: 0,
  yaw: 0, pitch: 0,
  pos: new THREE.Vector3(0, 1.65, -1.72),
  keys: {},
  code: {}, score: {}, curProb: '', totalScore: 0,
  problems: [],
  npcProbId: '',       // 本局所有 NPC 展示的题目 id
  bob: 0,
  warnCount: 0, wanderTimer: 0,
  teacherWarnActive: false, bathroomApproved: false,
  guardKills: 0, submitCount: {}, achievements: new Set(),
  startTime: 0,
  wanderCount: 0,              // 离开座位触发警告的次数
  wanderPenaltyApplied: false  // 是否已触发"时间锁定"惩罚
};

/* ---------- 性能：几何 / 材质缓存 ---------- */
