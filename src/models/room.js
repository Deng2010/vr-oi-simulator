/* =========================================================
   3D 模型：考场房间（地面、墙面、吊灯、黑板、挂钟、门窗、饮水机）
   由 index.html 内联脚本第 968-1106 行拆出。
   ========================================================= */
import { scene } from '../render/gfx.js';
import { box, getBoxGeo, mat } from '../render/materials.js';
import { getBoardTexture, getDoorSignTexture } from '../render/static-textures.js';
import { addObstacle } from '../world/obstacles.js';
import * as THREE from 'three';

export const ROOM_W = 16, ROOM_D = 14, ROOM_H = 3.4;

export function buildRoom(){
  const W = ROOM_W, D = ROOM_D, H = ROOM_H;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    mat(0x22262e, { roughness: 0.96 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(W, 16, 0x2e3442, 0x2a2f3b);
  gridHelper.position.y = 0.005;
  scene.add(gridHelper);

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    mat(0x171b23, { roughness: 1 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  scene.add(ceil);

  const wallMat = mat(0x2b313d, { roughness: 0.92 });
  const mkWall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  };
  mkWall(W, H,  0, H/2, -D/2, 0);
  mkWall(W, H,  0, H/2,  D/2, Math.PI);
  mkWall(D, H, -W/2, H/2, 0, Math.PI/2);
  mkWall(D, H,  W/2, H/2, 0, -Math.PI/2);

  /* 墙面障碍 */
  addObstacle(-W/2 - 0.5, 0, 0.5, D/2 + 1);
  addObstacle( W/2 + 0.5, 0, 0.5, D/2 + 1);
  addObstacle(0, -D/2 - 0.5, W/2 + 1, 0.5);
  addObstacle(0,  D/2 + 0.5, W/2 + 1, 0.5);

  /* 吊灯（只保留 3 个 PointLight，显示器不再单独挂灯） */
  for (let i = -1; i <= 1; i++){
    const lamp = new THREE.Mesh(
      getBoxGeo(3.4, 0.06, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xfff4dc })
    );
    lamp.position.set(i * 4.6, H - 0.08, 0);
    scene.add(lamp);
    const pl = new THREE.PointLight(0xfff0d8, 0.42, 22, 2);
    pl.position.set(i * 4.6, H - 0.4, 0);
    scene.add(pl);
  }

  /* 黑板 */
  box(6, 2.0, 0.06, 0xf2f4f0, 0, 1.85, -D/2 + 0.05, scene,
    { roughness: 0.35, emissive: 0x1a1c1e, emissiveIntensity: 0.4 });
  box(6.16, 2.16, 0.03, 0x3a4150, 0, 1.85, -D/2 + 0.03, scene);

  /* 黑板贴图来自 assets/textures/board.png，
     内容由 src/render/texture-painters.js 在构建期烘焙。
     运行时不再有 Canvas2D 绘制与额外的 GPU 上传。 */
  const boardTex = getBoardTexture();
  const boardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(5.96, 1.96),
    new THREE.MeshBasicMaterial({ map: boardTex })
  );
  boardFace.position.set(0, 1.85, -D/2 + 0.085);
  scene.add(boardFace);

  /* 挂钟 */
  const clockBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.07, 32),
    mat(0xe8ecf2, { roughness: 0.4 })
  );
  clockBody.rotation.x = Math.PI / 2;
  clockBody.position.set(6.2, 2.6, -D/2 + 0.08);
  scene.add(clockBody);
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.29, 32),
    new THREE.MeshBasicMaterial({ color: 0xfbfcfe })
  );
  clockFace.position.set(6.2, 2.6, -D/2 + 0.13);
  scene.add(clockFace);
  const hh = box(0.022, 0.15, 0.01, 0x1a1a1a, 6.2, 2.65, -D/2 + 0.14, scene);
  const mm = box(0.018, 0.23, 0.01, 0x333333, 6.2, 2.71, -D/2 + 0.145, scene);
  hh.rotation.z = 0.6; mm.rotation.z = -1.1;

  /* 门 */
  box(0.07, 2.15, 0.95, 0x4a3a2e, W/2 - 0.04, 1.075, 0, scene, { roughness: 0.7 });
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10),
    mat(0xc9b037, { metalness: 0.85, roughness: 0.28 })
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(W/2 - 0.12, 1.05, -0.32);
  scene.add(handle);

  /* 出口指示牌：assets/textures/door-sign.png（构建期烘焙） */
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.19),
    new THREE.MeshBasicMaterial({ map: getDoorSignTexture() })
  );
  sign.position.set(W/2 - 0.09, 2.42, 0);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);

  /* 窗 */
  box(0.06, 1.6, 3.0, 0x3a4150, -W/2 + 0.04, 1.9, 0, scene);
  const winGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.42),
    new THREE.MeshBasicMaterial({ color: 0x6d8fb8 })
  );
  winGlass.position.set(-W/2 + 0.09, 1.9, 0);
  winGlass.rotation.y = Math.PI / 2;
  scene.add(winGlass);

  /* 饮水机 */
  const cooler = new THREE.Group();
  cooler.position.set(-6.6, 0, 5.6);
  scene.add(cooler);
  box(0.36, 1.0, 0.36, 0xdfe4ec, 0, 0.5, 0, cooler, { roughness: 0.5 });
  box(0.3, 0.36, 0.3, 0x8fd0f0, 0, 1.18, 0, cooler,
    { transparent: true, opacity: 0.75, roughness: 0.15 });
  box(0.4, 0.04, 0.4, 0x9aa4b4, 0, 1.0, 0, cooler);
  addObstacle(-6.6, 5.6, 0.25, 0.25);
}
