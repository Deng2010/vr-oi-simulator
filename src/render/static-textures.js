/* =========================================================
   烘焙贴图加载：assets/textures/*.webp
   ---------------------------------------------------------
   这些 WebP 由 `npm run bake:assets` 从
   src/render/texture-painters.js 生成并提交到仓库；
   通过 import 引入 → Vite 会做内容哈希 + 长缓存。
   相比运行时逐张 Canvas2D 绘制 + 上传：
     · 6 张课桌的键盘贴图从 6 次绘制/6 次上传变成 1 张共享贴图；
     · 绘制逻辑（含字体度量）从首帧前移到构建期。
   ========================================================= */
import * as THREE from 'three';

import boardUrl from '../../assets/textures/board.webp';
import doorSignUrl from '../../assets/textures/door-sign.webp';
import keyboardUrl from '../../assets/textures/keyboard.webp';

const loader = new THREE.TextureLoader();
const cache = new Map();

function load(url, anisotropy){
  let tex = cache.get(url);
  if (!tex){
    tex = loader.load(url);
    tex.anisotropy = anisotropy;
    cache.set(url, tex);
  }
  return tex;
}

/* 黑板贴图：原实现 anisotropy = 4 */
export function getBoardTexture(){ return load(boardUrl, 4); }

export function getDoorSignTexture(){ return load(doorSignUrl, 1); }

export function getKeyboardTexture(){ return load(keyboardUrl, 1); }

/* 键盘材质同样共享：6 张课桌原本各自 new 一个 MeshStandardMaterial，
   现在共用一个实例 —— 少 5 个材质、少 5 次着色器 uniform 上传。 */
let keyboardMaterial = null;

export function getKeyboardMaterial(){
  if (!keyboardMaterial){
    keyboardMaterial = new THREE.MeshStandardMaterial({
      map: getKeyboardTexture(),
      roughness: 0.75
    });
  }
  return keyboardMaterial;
}
