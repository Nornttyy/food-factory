# 回转寿司正式素材

- 工具：内置 image_gen；一张透明 PNG，未通过脚本绘制或修图。
- 使用文件：`sushi-v1.png`，1254 × 1254，RGBA，16 个独立对象。
- 原始输出：`/Users/norn/.codex/generated_images/01a0a50e-734f-7141-810c-937c0b72074e/exec-90a3ca32-fbbc-4089-b664-fb7978030cf9.png`。
- 裁切框保存于 `manifest.json`，只在运行时读取子区域，保留生成的透明通道。收银机与水池跨名义行界，使用人工核对的实际边界，避免切断或混入相邻物件。
- 猫咪沿用已有头／身体／左右手分件；机械轨道沿用程序绘制的动态连接结构，不用概念图充当可交互场景。

## 最终生成提示词

```text
Use case: stylized-concept
Asset type: production-ready transparent PNG sprite atlas for a cozy top-down 2D cat conveyor-belt sushi restaurant game.
Create ONE square 4-column by 4-row atlas containing exactly 16 separate game sprites. All cells equally sized. Each object fully inside its cell with at least 12% transparent padding; no touching or crossing cell boundaries. No grid lines or labels. Genuine transparent background, including between all sprites, not a painted checkerboard.
View: consistent overhead three-quarter, top-down game view, not isometric. All objects viewed from above, showing a little front edge. Simple puffy shapes, smooth hand-drawn cocoa outlines, cream matte flat fills, only one or two soft flat shades. The art must remain readable when tiny.
Exact cell order, left to right, top to bottom:
Row 1: (1) one salmon nigiri sushi with peach salmon topping over white rice, (2) one egg tamago nigiri, yellow egg with one dark sage seaweed band over white rice, (3) one round cucumber maki sushi roll, white rice and green cucumber core with dark sage nori outside, (4) one shrimp nigiri with curled peach shrimp over white rice.
Row 2: (1) one small neat oval mound of cooked cream-white sushi rice, (2) one peach salmon slice without rice, (3) one rounded rectangular yellow tamago slice without rice, (4) one flat square sage-green nori seaweed sheet without rice.
Row 3: (1) squat cream-and-sage electric rice cooker with lid and a tiny cocoa button, (2) rounded cream sushi preparation counter with a pale tan rolling mat on top, no legs visible, (3) small cream ingredient cold case seen from above with three inset compartments holding salmon, egg and cucumber, no glass reflections, (4) small cream cash register with sage screen and large rounded keys, no text.
Row 4: (1) a round peach-cushioned sushi bar stool viewed mostly from above, no visible legs, (2) a small stack of three empty cream oval plates, (3) a closed rounded cream ingredient supply box with a sage lid and a tiny fish emblem but no letters, (4) a small freestanding cream bowl sink viewed from above with a sage faucet, no water or reflections.
Palette: warm cream #fff2d9, biscuit #e7cea7, muted peach #e4b69f, sage #b9c7ad, warm cocoa outline #846a57. Small pale egg-yellow accents. Playful squishy silhouette, no realistic textures, no woodgrain, no paper grain, no noise, no 3D, no photorealism, no glossy realistic material, no complex details, no gradients, no shadows outside the silhouette. No cats or people in this asset sheet. No text, no numerals, no logos, no watermark. Transparent PNG, exactly 16 cutout sprites, one complete atlas.
```

