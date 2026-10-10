/* =========================================================
   静态贴图绘制（纯 Canvas2D）
   ---------------------------------------------------------
   本模块是这些贴图的唯一真源，但「不参与运行时代码」——
   运行时用的是 tools/bake-assets.mjs 在构建期烘焙出来的
   assets/textures/*.png，没有任何 src 模块 import 这里，
   因此 Rollup 会把它整块摇掉，不进产物。

   为什么要烘焙：
     · Canvas2D 绘制 + GPU 上传发生在首帧之前，烘焙后变成
       一次普通的图片解码，首屏更快且可被浏览器缓存复用；
     · 贴图内容与运行数据无关（黑板守则 / 出口指示牌 / 键盘），
       完全可以静态化。
   注意：显示器画面与草稿纸依赖实时数据与用户输入，
   仍留在 src/render/screen-textures.js 与 src/ui/paper.js 中运行时绘制。
   ========================================================= */

export function paintBoard(cx){
  cx.fillStyle = '#f2f4f0'; cx.fillRect(0, 0, 1024, 320);
  cx.textAlign = 'left';
  cx.fillStyle = '#c0392b'; cx.font = 'bold 54px "Microsoft YaHei", sans-serif';
  cx.fillText('NOI 2026  竞赛守则', 60, 90);
  cx.fillStyle = '#2c3e50'; cx.font = '30px "Microsoft YaHei", sans-serif';
  cx.fillText('1. 禁止随意走动、禁止交头接耳、禁止干扰他人', 60, 160);
  cx.fillText('2. 如需去洗手间请举手示意监考老师', 60, 205);
  cx.fillText('3. 尊重监考老师，禁止任何形式的暴力行为', 60, 250);
}

export function paintDoorSign(cx){
  cx.fillStyle = '#1f6b4a'; cx.fillRect(0, 0, 256, 96);
  cx.fillStyle = '#fff'; cx.font = 'bold 46px "Microsoft YaHei", sans-serif';
  cx.textAlign = 'center'; cx.fillText('出 口', 128, 64);
}

export function paintKeyboard(cx){
  cx.fillStyle = '#1c2028'; cx.fillRect(0, 0, 512, 180);
  cx.fillStyle = '#2c323e';
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 16; c++){
      const w = (r === 5 && c > 3 && c < 9) ? 40 : 26;
      cx.fillRect(10 + c * 31, 12 + r * 27, w, 21);
    }
}

/* 烘焙清单：资产名 / 画布尺寸 / 绘制函数。
   tools/bake-assets.mjs 直接消费它，新增贴图只需在这里加一行。 */
export const STATIC_TEXTURES = [
  { name: 'board',     width: 1024, height: 320, paint: paintBoard },
  { name: 'door-sign', width: 256,  height: 96,  paint: paintDoorSign },
  { name: 'keyboard',  width: 512,  height: 180, paint: paintKeyboard }
];
