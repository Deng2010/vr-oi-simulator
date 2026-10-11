/* =========================================================
   场景组装：把房间、桌椅、人物、保安摆进世界
   由 index.html 内联脚本第 1471-1500 行拆出。
   ========================================================= */
import { buildDesk } from '../models/desk.js';
import { buildPerson } from '../models/person.js';
import { buildRoom } from '../models/room.js';
import { setSceneStats } from '../core/perf.js';
import { mergeStaticMeshes } from '../render/batch.js';
import { scene } from '../render/gfx.js';
import { npcs, setTeacher } from './entities.js';

export function buildWorld(){
  buildRoom();
  buildDesk(0, -3, true);

  const seats = [
    { x: -4.5, z: -3.0, color: 0x3b5ba5 },
    { x:  4.5, z: -3.0, color: 0x8a4a6b },
    { x: -4.5, z:  2.5, color: 0x4a7a5a },
    { x:  0.0, z:  2.5, color: 0x7a6a3a },
    { x:  4.5, z:  2.5, color: 0x5a4a8a }
  ];
  const NPC_NAMES = ['小明', '小红', '小刚', '小强', '小丽'];
  seats.forEach((s, i) => {
      buildDesk(s.x, s.z, true);
      const p = buildPerson(s.x, s.z + 0.92, s.color, Math.PI);
      p.group.name = 'npc:' + NPC_NAMES[i];
      p.userData = {
        id: i, name: NPC_NAMES[i],
        seatX: s.x, seatZ: s.z + 0.92,
        state: 'seated', anger: 0, baseRot: Math.PI, timer: 0
      };
      npcs.push(p);
  });

  const tch = buildPerson(2.4, 0, 0x2f3a4d, 0, 'stand');
  tch.group.name = 'teacher';
  tch.userData = { mode: 'patrol' };
  setTeacher(tch);

  /* ---------- 静态合批 ----------
     世界搭完后，把「不会动、不可交互、不透明」的网格按材质合并：
     一张课桌 ~20 个盒子、房间 ~35 个面、黑板/挂钟/门窗等，
     合批后同材质的 N 个网格只剩 1 次 draw call。

     会动的东西必须排除：buildPerson() 返回的是包装对象
     （{ group, armL, armR, legsSit, legsStand }），不是 Object3D，
     所以这里取 `.group` 传进去。人物模型内部也打了
     g.userData.dynamic 标记作为第二道保险。 */
  const dynamicRoots = npcs.map(n => n.group);
  if (tch) dynamicRoots.push(tch.group);
  const batch = mergeStaticMeshes(scene, { dynamicRoots });

  /* 场景规模写进 perf 统计，供运行时探针 / 性能回归使用 */
  setSceneStats({
    sceneMeshes: batch.meshesAfter,
    meshesBeforeBatch: batch.meshesBefore,
    mergedGroups: batch.mergedGroups,
    skippedDynamic: batch.skippedDynamic
  });

  if (import.meta.env.DEV && batch.skippedDynamic === 0){
    console.warn('[batch] 没有任何网格被识别为动态物体，' +
      '人物 / 监考老师很可能被误合批了 —— 检查 dynamicRoots');
  }
}
