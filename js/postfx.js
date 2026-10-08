'use strict';
/* =========================================================
   postfx —— 全局动态模糊（拖影）+ UI 层独立渲染
   ---------------------------------------------------------
   用 three r128 examples 的 EffectComposer + AfterimagePass 做全局
   拖影：damp 从 POST_DAMP_MIN 随紧张值平滑升到 POST_DAMP_MAX。
   - UI 层（layer 1：3D 准星、3D 弹窗）不参与拖影：composer 渲染
     世界后，再单独渲染该层，保证文字与准星始终锐利；
   - examples 脚本来自 CDN；加载失败或构造出错时 postOK=false，
     renderFrame 自动回退为直接渲染，其余氛围效果不受影响。
   ========================================================= */

const POST_DAMP_MIN = 0.26;    // 初始：有一点拖影但很弱
const POST_DAMP_MAX = 0.80;    // 紧张值拉满时的拖影长度

let composer = null, afterimage = null, postOK = false;

function initPostFX(){
  if (!(THREE.EffectComposer && THREE.RenderPass && THREE.AfterimagePass)) return false;
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    afterimage = new THREE.AfterimagePass(POST_DAMP_MIN);
    if (afterimage.uniforms && afterimage.uniforms.damp){
      afterimage.uniforms.damp.value = POST_DAMP_MIN;
    }
    composer.addPass(afterimage);
    postOK = true;
  } catch(e){
    composer = null;
    afterimage = null;
    postOK = false;
  }
  return postOK;
}

/* 紧张值 → 拖影强度 */
function setPostDamp(t){
  if (!postOK || !afterimage || !afterimage.uniforms || !afterimage.uniforms.damp) return;
  afterimage.uniforms.damp.value = lerp(POST_DAMP_MIN, POST_DAMP_MAX, clamp(t, 0, 1));
}

/* 每帧渲染入口：优先走 composer（带拖影），失败则直接渲染。
   注意两个坑：
   1) 相机 layers 默认只含 layer 0，而准星/弹窗在 layer 1——
      任何渲染路径都必须保证 layer 1 被渲染，否则它们直接消失；
   2) three 对 Color 背景会 forceClear，即使 autoClear=false 也会清屏，
      所以 UI 覆盖 pass 之前必须临时摘掉 scene.background。 */
function renderFrame(dt){
  if (!postOK || !composer){
    camera.layers.enable(1);
    try { renderer.render(scene, camera); }
    finally { camera.layers.disable(1); }
    return;
  }

  const bg = scene.background;
  try {
    /* 世界层进拖影缓冲，UI 层先关掉 */
    camera.layers.disable(1);
    composer.render(dt);
  } catch(e){
    /* 后处理出错：永久回退为直接渲染，避免每帧都抛 */
    postOK = false;
    composer = null;
    afterimage = null;
    camera.layers.enable(1);
    renderer.render(scene, camera);
    return;
  }

  /* UI 层单独画一遍：摘掉背景防止冲掉世界，再清深度只渲染 layer 1 */
  scene.background = null;
  camera.layers.enable(1);
  camera.layers.disable(0);
  renderer.autoClear = false;
  try {
    renderer.clearDepth();
    renderer.render(scene, camera);
  } finally {
    renderer.autoClear = true;
    camera.layers.enable(0);
    scene.background = bg;
  }
}

function resizePostFX(){
  if (postOK && composer) composer.setSize(innerWidth, innerHeight);
}
