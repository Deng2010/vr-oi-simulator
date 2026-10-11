/* =========================================================
   3D 模型：课桌 + 显示器 + 键鼠 + 水杯 + 草稿纸 + 椅子
   由 index.html 内联脚本第 1167-1285 行拆出。
   ========================================================= */
import { scene } from '../render/gfx.js';
import { box, getBoxGeo, mat } from '../render/materials.js';
import { deskScreens, drawDeskScreen } from '../render/screen-textures.js';
import { getKeyboardMaterial } from '../render/static-textures.js';
import { drinkWater } from '../systems/interaction.js';
import { openCode } from '../ui/panels.js';
import { openPaper } from '../ui/paper.js';
import { interactables } from '../world/entities.js';
import { addObstacle } from '../world/obstacles.js';
import * as THREE from 'three';

export function buildDesk(x, z, withMonitor){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);

  const woodTop = 0x6b5137;
  box(1.9, 0.06, 0.95, woodTop, 0, 0.74, 0, g);
  for (const dx of [-0.88, 0.88])
    for (const dz of [-0.4, 0.4])
      box(0.06, 0.74, 0.06, 0x2b303b, dx, 0.37, dz, g);
  box(1.9, 0.4, 0.03, 0x50596a, 0, 0.55, -0.44, g);

  /* 桌子碰撞（桌腿范围） */
  addObstacle(x, z, 0.92, 0.45);

  if (withMonitor){
    box(0.46, 0.025, 0.22, 0x22262e, 0, 0.775, -0.28, g);
    box(0.07, 0.34, 0.07, 0x2e3440, 0, 0.95, -0.30, g);
    box(0.80, 0.48, 0.035, 0x15181f, 0, 1.26, -0.30, g);

    /* 屏幕贴图 */
    const sc = document.createElement('canvas');
    sc.width = 640; sc.height = 384;
    const sx = sc.getContext('2d');
    drawDeskScreen(sx, 640, 384);
    const tex = new THREE.CanvasTexture(sc);
    tex.anisotropy = 4;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 0.44),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    face.position.set(0, 1.26, -0.278);
    g.add(face);

    /* 记录以便后续刷新（切题 / 得分 / 读档时重新绘制） */
    deskScreens.push({ ctx: sx, tex: tex });

    /* 这里原先放了一块半透明的发光板（替代每台显示器一盏 PointLight）。
       它在屏幕前方 0.22m 处悬空，看起来像每台电脑前贴了一张透明板，
       玩家反馈很出戏，直接去掉：屏幕面本身是 MeshBasicMaterial（自发光），
       去掉后显示器亮度不变，只是少了一层蓝雾。 */

    /* 键盘 */
    /* 键盘贴图来自 assets/textures/keyboard.png（构建期烘焙）。
       原先每张桌子都新建 canvas、上传一次贴图、建一个材质，
       现在 6 张桌子共用同一张贴图 + 同一个材质实例。 */
    const kb = new THREE.Mesh(getBoxGeo(0.46, 0.022, 0.16), getKeyboardMaterial());
    kb.position.set(0, 0.775, 0.08);
    g.add(kb);

    box(0.065, 0.028, 0.105, 0x1e222a, 0.38, 0.778, 0.10, g, { roughness: 0.6 });

    /* 水杯 */
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.03, 0.10, 16),
      new THREE.MeshStandardMaterial({
        color: 0xdfe6f2, transparent: true, opacity: 0.55, roughness: 0.2
      })
    );
    cup.position.set(0.66, 0.82, -0.02);
    g.add(cup);
    cup.userData.interact = { label: '喝水', action: () => drinkWater() };
    interactables.push(cup);

    /* 草稿纸 */
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0xf2eee3, roughness: 0.95, side: THREE.DoubleSide
      })
    );
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.14;
    paper.position.set(-0.62, 0.772, 0.06);
    g.add(paper);
    paper.userData.interact = { label: '查看草稿纸', action: () => openPaper() };
    interactables.push(paper);

    /* 笔 */
    const pen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.15, 8),
      mat(0x2a2f3a, { roughness: 0.5 })
    );
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.3;
    pen.position.set(-0.62, 0.782, 0.20);
    g.add(pen);

    face.userData.interact = { label: '使用电脑', action: () => openCode() };
    interactables.push(face);
  }

  /* 椅子 */
  const chair = new THREE.Group();
  chair.position.set(0, 0, 0.92);
  g.add(chair);
  box(0.46, 0.05, 0.46, 0x2e3440, 0, 0.45, 0, chair);
  box(0.46, 0.52, 0.05, 0x2e3440, 0, 0.72, 0.21, chair);
  box(0.05, 0.45, 0.05, 0x242a34, 0, 0.22, 0, chair);

  return g;
}
