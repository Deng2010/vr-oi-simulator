'use strict';
/* =========================================================
   reticle —— 3D 准星（挂在相机下，默认与屏幕平行）
   ---------------------------------------------------------
   - 十字由两根正交细条组成，作为相机的子节点放在正前方固定距离，
     不加旋转时天然与屏幕平行（"+"）；
   - 指向可交互内容（场景物体 E/F、弹窗按钮 dwell）时旋转 45° 变"×"，
     旋转用帧率无关的指数平滑，做到准确的跟手动画；
   - 若指向的是"攻击"行为且处于交互范围内：整体放大 1.5× 并渐变成红色；
   - 外圈圆环用 shader 按极坐标画弧，展示弹窗按钮的视线停留进度；
   - 可见性沿用 DOM #crosshair 的显示状态（各面板继续用 classList 控制），
     该 DOM 元素本身已不再绘制任何像素。
   ========================================================= */

const RETICLE_DIST   = 0.5;     // 准星到相机的距离（米）
const RETICLE_LEN    = 0.030;   // 十字单臂长度
const RETICLE_TH     = 0.0026;  // 十字臂粗细
const RETICLE_RING_R = 0.055;   // 进度圆环半径

const RETICLE_WHITE  = new THREE.Color(0xffffff);
const RETICLE_RED    = new THREE.Color(0xff5f6d);

let reticle = null;             // 准星 Group
const retBars = [];             // 两根臂
let retRing = null;             // 进度圆环
let retRingU = null;            // 圆环 shader uniforms
let retAngle = 0;               // 当前旋转角（0 → -45°）
let retScale = 1;               // 当前缩放（1 → 1.5）
let retMix = 0;                 // 当前红化程度（0 白 → 1 红）
const _retCol = new THREE.Color();

function initReticle(){
  const g = new THREE.Group();
  g.position.set(0, 0, -RETICLE_DIST);
  g.renderOrder = 1000;

  /* 两根正交细条 = 屏幕平面内的十字 */
  const mkBar = (w, h) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.001),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.92,
        depthTest: false, depthWrite: false
      })
    );
    m.renderOrder = 1000;
    return m;
  };
  const hBar = mkBar(RETICLE_LEN, RETICLE_TH);
  const vBar = mkBar(RETICLE_TH, RETICLE_LEN);
  retBars.push(hBar, vBar);
  g.add(hBar); g.add(vBar);

  /* 进度圆环：极坐标 shader，uProgress 0..1，从顶部顺时针填充 */
  retRingU = { uProgress: { value: 0 } };
  retRing = new THREE.Mesh(
    new THREE.PlaneGeometry(RETICLE_RING_R * 2, RETICLE_RING_R * 2),
    new THREE.ShaderMaterial({
      uniforms: retRingU,
      transparent: true, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform float uProgress;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float a = atan(p.y, p.x);
          float ang = fract((a + 1.5707963) / 6.2831853);
          float ring = step(0.78, r) * step(r, 0.96);
          float fill = step(ang, uProgress);
          float alpha = ring * (0.20 + 0.80 * fill);
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(mix(vec3(0.36, 0.55, 1.0), vec3(1.0), fill), alpha);
        }`
    })
  );
  retRing.renderOrder = 1000;
  retRing.visible = false;
  g.add(retRing);

  camera.add(g);
  scene.add(camera);      // 相机的子节点要被渲染，需先把相机挂进场景
  reticle = g;
}

function updateReticle(dt){
  if (!reticle) return;
  reticle.visible = !crosshair.classList.contains('hidden');

  const dwell = dialogDwell();          // 弹窗按钮的视线停留状态
  const attacking = !!actionSpace;      // 攻击行为且在交互范围内
  const interactive = attacking || !!actionE || !!actionF || dwell.active;

  /* 旋转：0 → -45°（"+" 变 "×"），指数平滑保证丝滑 */
  const targetAngle = interactive ? -Math.PI / 4 : 0;
  retAngle += (targetAngle - retAngle) * (1 - Math.exp(-dt * 14));
  for (const b of retBars) b.rotation.z = retAngle;

  /* 攻击态：放大 1.5× */
  const targetScale = attacking ? 1.5 : 1;
  retScale += (targetScale - retScale) * (1 - Math.exp(-dt * 12));
  reticle.scale.setScalar(retScale);

  /* 攻击态：渐变成红色 */
  const targetMix = attacking ? 1 : 0;
  retMix += (targetMix - retMix) * (1 - Math.exp(-dt * 10));
  _retCol.copy(RETICLE_WHITE).lerp(RETICLE_RED, retMix);
  for (const b of retBars) b.material.color.copy(_retCol);

  /* 停留进度环 */
  retRing.visible = dwell.progress > 0.002;
  if (retRing.visible) retRingU.uProgress.value = dwell.progress;
}
