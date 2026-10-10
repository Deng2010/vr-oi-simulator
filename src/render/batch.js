/* =========================================================
   静态网格合批
   ---------------------------------------------------------
   重构前后场景里都是「上百个独立 Mesh」：一张课桌 ~20 个盒子、
   房间 ~35 个面、5 个人物各 ~15 个部件…… 每个 Mesh 一次 draw call，
   在弱机上是主要的 CPU 开销来源。

   这里在场景装配完成后做一次合批：
     · 只处理「静态」网格（不在动态物体下、不是可交互物、不透明）；
     · 按「材质实例」分桶 —— 材质本来就通过 render/materials.js 的
       缓存共享，所以桶的数量很少；
     · 把每个网格的 world 矩阵烘进几何体，再合成一个 BufferGeometry，
       于是同一材质的 N 个盒子变成 1 次 draw call。

   不做的事：人物 / 监考 / 保安（会移动）、水杯草稿纸显示器（可交互）、
   透明材质（排序敏感）、Line（GridHelper）、灯光。
   ========================================================= */
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';

const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

function isUnderAny(obj, roots, root){
  for (let p = obj; p && p !== root; p = p.parent){
    if (roots.has(p)) return true;
  }
  return false;
}

/**
 * 把 root 下的静态网格按材质合并。
 * @param {THREE.Object3D} root   场景根
 * @param {object}  [opts]
 * @param {THREE.Object3D[]} [opts.dynamicRoots=[]] 会移动的物体（人物 / 老师 / 保安）
 * @param {number}  [opts.minCount=2] 同一个桶至少几个网格才值得合并
 * @returns {{rows:Array<{material:string,meshes:number,vertices:number}>,
 *            sourceMeshes:number, mergedGroups:number, meshesAfter:number,
 *            meshesBefore:number}}
 */
export function mergeStaticMeshes(root, opts = {}){
  const minCount = opts.minCount ?? 2;
  /* 动态物体用「引用」而不是 userData 标记来识别：
     人物/老师的 userData 会被游戏逻辑整体覆盖（存档字段、AI 状态），
     如果依赖 userData.dynamic 就会在某次赋值后失效。 */
  const dynamic = new Set(opts.dynamicRoots || []);

  /* 先把整棵树的 world 矩阵更新到最新 */
  root.updateMatrixWorld(true);

  const buckets = new Map();       // material -> Mesh[]
  root.traverse(obj => {
    if (!obj.isMesh) return;
    if (obj.userData.noBatch || obj.userData.interact) return;
    if (isUnderAny(obj, dynamic, root)) return;
    const material = obj.material;
    if (!material || Array.isArray(material) || material.transparent) return;
    if (!obj.geometry || !obj.geometry.attributes.position) return;
    let list = buckets.get(material);
    if (!list){ list = []; buckets.set(material, list); }
    list.push(obj);
  });

  const report = [];
  for (const [material, meshes] of buckets){
    if (meshes.length < minCount) continue;

    const parts = [];
    for (const mesh of meshes){
      const geo = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      /* 只保留公共属性，否则 mergeBufferGeometries 会因为
         「属性集合不一致」直接返回 null */
      for (const name of Object.keys(geo.attributes)){
        if (!KEEP_ATTRIBUTES.has(name)) geo.deleteAttribute(name);
      }
      if (!geo.attributes.uv){
        /* 极少数几何体没有 uv：补一组零值，保证属性集合一致 */
        const n = geo.attributes.position.count;
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      geo.applyMatrix4(mesh.matrixWorld);
      parts.push(geo);
    }

    const merged = BufferGeometryUtils.mergeBufferGeometries(parts, false);
    if (!merged){
      for (const g of parts) g.dispose();
      continue;
    }

    const batched = new THREE.Mesh(merged, material);
    batched.name = 'batched:' + (material.name || material.type);
    batched.matrixAutoUpdate = false;
    batched.userData.batchedFrom = meshes.length;
    root.add(batched);

    for (const mesh of meshes){
      if (mesh.parent) mesh.parent.remove(mesh);
    }
    for (const g of parts) g.dispose();

    report.push({
      material: material.name || material.color?.getHexString?.() || material.type,
      meshes: meshes.length,
      vertices: merged.attributes.position.count
    });
  }

  /* 合批前 / 后的网格数量：这是判断合批效果最可靠的指标。
     不要拿 renderer.info.render.calls 在固定视角下比对 ——
     视锥剔除会让大部分静态物体在某个朝向下根本不参与统计。 */
  let meshesAfter = 0;
  root.traverse(o => { if (o.isMesh) meshesAfter++; });
  const sourceMeshes = report.reduce((a, r) => a + r.meshes, 0);
  const mergedGroups = report.length;

  return {
    rows: report,
    sourceMeshes,
    mergedGroups,
    meshesAfter,
    meshesBefore: meshesAfter + sourceMeshes - mergedGroups
  };
}
