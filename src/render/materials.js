/* =========================================================
   几何体与材质缓存（性能关键路径，避免重复分配）
   由 index.html 内联脚本第 727-759 行拆出。
   ========================================================= */
import * as THREE from 'three';

export const geoCache = new Map();

export const matCache = new Map();

export function getBoxGeo(w, h, d){
  const k = `${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g){ g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}

export function getSphereGeo(r, sw, sh){
  const k = `s${r}|${sw}|${sh}`;
  let g = geoCache.get(k);
  if (!g){ g = new THREE.SphereGeometry(r, sw, sh); geoCache.set(k, g); }
  return g;
}

export function mat(color, opts){
  const k = color + '|' + JSON.stringify(opts || {});
  let m = matCache.get(k);
  if (!m){
    m = new THREE.MeshStandardMaterial(Object.assign(
      { color, roughness: 0.88, metalness: 0.04 }, opts || {}));
    matCache.set(k, m);
  }
  return m;
}

export function box(w, h, d, color, x, y, z, parent, opts){
  const m = new THREE.Mesh(getBoxGeo(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* ---------- 碰撞障碍 ---------- */
