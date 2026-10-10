/* =========================================================
   Three.js 渲染核心：渲染器、场景、相机、射线拾取器
   由 index.html 内联脚本第 845-847 行拆出。
   ---------------------------------------------------------
   scene / camera / renderer / clock 都是模块级 let：
   ESM 的导入绑定只读，所以「赋值」必须发生在本模块内部，
   外部只能通过 initGraphics() 触发一次装配。
   ========================================================= */
import * as THREE from 'three';
import { $ } from '../core/util.js';

export let scene, camera, renderer, clock;

export const raycaster = new THREE.Raycaster();

export const CENTER = new THREE.Vector2(0, 0);

/* DPR 上限 1.5：视觉差异极小，但填充率大幅下降。
   运行时由 src/core/perf.js 在 MIN 与 MAX 之间按帧率自适应。 */
export const MAX_PIXEL_RATIO = 1.5;
export const MIN_PIXEL_RATIO = 1.0;

export function initGraphics(){
  renderer = new THREE.WebGLRenderer({
    canvas: $('scene'),
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b11);
  scene.fog = new THREE.FogExp2(0x090b11, 0.038);

  camera = new THREE.PerspectiveCamera(
    74, window.innerWidth / window.innerHeight, 0.05, 120);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.65, -1.72);

  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x232833, 0.5));

  clock = new THREE.Clock();
  return { scene, camera, renderer };
}

/* 视口变化：更新相机投影与绘制缓冲 */
export function resizeViewport(){
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  /* 注意：不在这里重设 pixelRatio，DPR 的自适应归 src/core/perf.js 管 */
}
