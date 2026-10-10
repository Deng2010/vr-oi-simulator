/* =========================================================
   3D 模型：保安
   由 index.html 内联脚本第 1330-1416 行拆出。
   ========================================================= */
import { scene } from '../render/gfx.js';
import { box, getSphereGeo } from '../render/materials.js';
import * as THREE from 'three';

export function buildSecurityGuard(x, z){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);

  const skin = 0xd0a070;
  const uniform = 0x1c2a44;
  const pants = 0x141e30;

  /* ---------- 腿 ---------- */
  box(0.18, 0.17, 0.46, pants, -0.115, 0.52, 0.22, g);
  box(0.18, 0.17, 0.46, pants,  0.115, 0.52, 0.22, g);
  box(0.17, 0.46, 0.17, pants, -0.115, 0.24, 0.42, g);
  box(0.17, 0.46, 0.17, pants,  0.115, 0.24, 0.42, g);

  /* ---------- 制服 ---------- */
  box(0.50, 0.62, 0.29, uniform, 0, 1.10, 0.01, g);
  box(0.52, 0.035, 0.31, 0xffcc33, 0, 0.90, 0.01, g);
  box(0.52, 0.035, 0.31, 0xffcc33, 0, 1.28, 0.01, g);
  box(0.52, 0.045, 0.31, 0x0a1525, 0, 1.40, 0.01, g);
  box(0.52, 0.05, 0.31, 0x080808, 0, 0.80, 0.01, g);

  /* ---------- 手臂：独立几何 + 独立材质 ---------- */
  const armL = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.55, 0.14),
    new THREE.MeshStandardMaterial({ color: uniform, roughness: 0.88, metalness: 0.04 })
  );
  armL.position.set(-0.33, 1.12, 0.10);
  armL.rotation.x = -0.2;
  g.add(armL);

  const armR = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.55, 0.14),
    new THREE.MeshStandardMaterial({ color: uniform, roughness: 0.88, metalness: 0.04 })
  );
  armR.position.set(0.33, 1.12, 0.10);
  armR.rotation.x = -0.2;
  g.add(armR);

  /* ---------- 头 ---------- */
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75, metalness: 0.04 })
  );
  head.position.set(0, 1.58, 0.02);
  g.add(head);

  /* ---------- 帽子 ---------- */
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16),
    new THREE.MeshStandardMaterial({ color: 0x0a1525, roughness: 0.5, metalness: 0.04 })
  );
  cap.position.set(0, 1.76, 0.02);
  g.add(cap);

  /* ---------- 帽檐 ---------- */
  const brim = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.02, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x050c18, roughness: 0.5, metalness: 0.04 })
  );
  brim.position.set(0, 1.73, 0.13);
  g.add(brim);

  /* ---------- 徽章 ---------- */
  const badge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8),
    new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.3, metalness: 0.8 })
  );
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 1.76, 0.15);
  g.add(badge);

  /* ---------- 头顶警告灯 ---------- */
  const warnLight = new THREE.Mesh(
    getSphereGeo(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3333 })
  );
  warnLight.position.set(0, 1.84, 0.02);
  g.add(warnLight);

  return {
    group: g, armL, armR, head, warnLight,
    phase: Math.random() * Math.PI * 2
  };
}

/* ---------- 保安系统 ---------- */
