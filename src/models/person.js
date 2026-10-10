/* =========================================================
   3D 模型：人物（选手 / 监考老师），支持坐姿与站姿
   由 index.html 内联脚本第 1287-1328 行拆出。
   ========================================================= */
import { scene } from '../render/gfx.js';
import { box, getSphereGeo, mat } from '../render/materials.js';
import * as THREE from 'three';

export function buildPerson(x, z, shirtColor, rotY, startPose){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  scene.add(g);

  const skin = 0xd8a878, pants = 0x2a3140;

  // 坐姿腿组
  const legsSit = new THREE.Group();
  box(0.17, 0.17, 0.44, pants, -0.115, 0.52, 0.22, legsSit);
  box(0.17, 0.17, 0.44, pants,  0.115, 0.52, 0.22, legsSit);
  box(0.16, 0.44, 0.16, pants, -0.115, 0.24, 0.42, legsSit);
  box(0.16, 0.44, 0.16, pants,  0.115, 0.24, 0.42, legsSit);
  g.add(legsSit);

  // 站姿腿组（垂直向下）
  const legsStand = new THREE.Group();
  box(0.17, 0.9, 0.17, pants, -0.115, 0.45, 0, legsStand);
  box(0.17, 0.9, 0.17, pants,  0.115, 0.45, 0, legsStand);
  g.add(legsStand);

  if (startPose === 'stand') legsSit.visible = false;
  else legsStand.visible = false;

  box(0.44, 0.58, 0.27, shirtColor, 0, 1.09, 0.01, g);
  const armL = box(0.115, 0.42, 0.115, shirtColor, -0.29, 1.06, 0.13, g);
  const armR = box(0.115, 0.42, 0.115, shirtColor,  0.29, 1.06, 0.13, g);

  const head = new THREE.Mesh(getSphereGeo(0.135, 16, 12), mat(skin, { roughness: 0.75 }));
  head.position.set(0, 1.52, 0.02);
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.142, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat(0x18181c, { roughness: 1 })
  );
  hair.position.set(0, 1.535, 0.02);
  g.add(hair);

  return { group: g, armL, armR, head, legsSit, legsStand,
           phase: Math.random() * Math.PI * 2 };
}
