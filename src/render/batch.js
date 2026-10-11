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

/* 把「动态物体」的引用解析成真正的 Object3D。
   ------------------------------------------------------------------
   踩过的坑：buildPerson() / buildSecurityGuard() 返回的是**包装对象**
   （{ group, armL, armR, head, legsSit, legsStand }），不是 Object3D。
   如果把包装对象直接塞进 dynamicRoots，它永远不会出现在
   Object3D 的 parent 链上，于是动态物体被当成静态物体合批掉 ——
   表现就是「人物同时露出坐姿和站姿两组腿（4 条腿）」
   以及「监考老师的模型冻在原地，和它的真实坐标对不上」。

   所以这里两种形态都接受，并且**解析不出来就直接抛错**：
   宁可让构建/测试立刻失败，也不要静默地把会动的东西烘死。 */
function toObject3D(ref, index){
  if (!ref) return null;
  if (ref.isObject3D) return ref;
  if (ref.group && ref.group.isObject3D) return ref.group;
  throw new TypeError(
    `mergeStaticMeshes: dynamicRoots[${index}] 既不是 Object3D，` +
    '也没有可用的 .group —— 这类对象会被误合批，请修正调用方');
}

/* 判断某个网格是否属于「会动的东西」。
   两条独立判据，任意一条命中就跳过：
     1. 显式传入的 dynamicRoots（按引用匹配 Object3D）；
     2. 祖先链上打了 userData.dynamic 标记 ——
        标记打在 Group 上（person.js / guard.js 里），
        而游戏逻辑覆盖的是「包装对象」的 userData，两者互不干扰。 */
function isDynamic(obj, roots, root){
  for (let p = obj; p && p !== root; p = p.parent){
    if (roots.has(p)) return true;
    if (p.userData && p.userData.dynamic) return true;
  }
  return false;
}

/**
 * 把 root 下的静态网格按材质合并。
 * @param {THREE.Object3D} root   场景根
 * @param {object}  [opts]
 * @param {Array<THREE.Object3D|{group:THREE.Object3D}>} [opts.dynamicRoots=[]]
 *        会移动的物体（人物 / 老师 / 保安）。包装对象与 Object3D 都接受。
 * @param {number}  [opts.minCount=2] 同一个桶至少几个网格才值得合并
 * @returns {{rows:Array<{material:string,meshes:number,vertices:number}>,
 *            sourceMeshes:number, mergedGroups:number, meshesAfter:number,
 *            meshesBefore:number, skippedDynamic:number}}
 */
export function mergeStaticMeshes(root, opts = {}){
  const minCount = opts.minCount ?? 2;
  const dynamic = new Set(
    (opts.dynamicRoots || []).map(toObject3D).filter(Boolean));

  /* 先把整棵树的 world 矩阵更新到最新 */
  root.updateMatrixWorld(true);

  const buckets = new Map();       // material -> Mesh[]
  let skippedDynamic = 0;
  root.traverse(obj => {
    if (!obj.isMesh) return;
    if (obj.userData.noBatch || obj.userData.interact) return;
    if (isDynamic(obj, dynamic, root)){ skippedDynamic++; return; }
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
    meshesBefore: meshesAfter + sourceMeshes - mergedGroups,
    /* 因为「属于动态物体」而跳过的网格数。
       这个数字必须 > 0（场景里有人物），
       否则说明动态根没被识别出来 —— 就是上面那个坑。 */
    skippedDynamic
  };
}
