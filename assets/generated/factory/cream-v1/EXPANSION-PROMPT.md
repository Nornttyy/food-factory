# 食物扩展素材

- 使用内置图片生成功能，一次生成 4 列 × 2 行图集；没有使用 API / CLI 后备模式。
- 文件：`expansion-v1.png`，1536 × 1024 RGBA，保留生成器原始透明通道。
- 上排：奶油饼干、奶香包、草莓蛋糕、橙汁冰棒。
- 下排：曲奇烤炉、小蒸笼、蛋糕工台、冰棒冷柜。
- 每个 sprite 的独立裁切框记录在 `manifest.json`；帧坐标包含少量透明余量。
- 画风：奶油色、圆润简洁卡通，不使用写实纹理。

## 最终提示词

```text
Use case: stylized-concept
Asset type: transparent PNG sprite atlas for a cream pastel cartoon food factory game.
Primary request: Create ONE new atlas containing EXACTLY eight isolated sprites, arranged in a precise evenly spaced 4-column by 2-row grid on a genuinely transparent background. Landscape canvas, preferably 1536x1024. All empty space must have zero alpha. No visible grid lines.
Style: Match this visual style: warm cocoa-brown rounded outlines, flat cream and pastel fills, simple tidy cel shading, gentle small highlights, thick readable silhouettes, friendly squat chunky forms. The foods resemble clean hand-drawn mobile-game icons. Machines have cream bodies and muted sage, peach, or pastel pink details, shown front-on with only a shallow three-quarter view of their tops. Matte flat illustration, not 3D or photorealistic.
Top row, left to right, exactly one sprite per cell:
1. One golden round butter cookie with a few simple dotted indentations.
2. One plump ivory steamed bun with a small pinched top and simple folds.
3. One small triangular strawberry cream cake slice with cream layers, pale pink filling, and one strawberry on top.
4. One orange popsicle on a simple wooden stick.
Bottom row, left to right, exactly one matching machine per cell:
1. One compact butter-cookie oven, rounded cream body and tan front panel bearing a small simple cookie emblem.
2. One rounded sage-and-cream bun steamer with a simple closed domed lid.
3. One pastel-pink-and-cream cake finishing machine/counter with a tiny cake emblem on its front.
4. One mint-and-cream popsicle freezer with a simple snowflake emblem.
Composition: Keep all eight subjects fully visible and centered in their own equal-sized cells. Generous transparent gutters around every item for independent rectangular cropping. Foods slightly smaller than machines; machines squat and compact with large readable parts. No item overlaps or crosses into a neighboring cell. Keep every sprite away from outer canvas edges. There is no floor, tile, shared baseline, shadow rectangle, card, panel, or backdrop.
Constraints: no extra sprites, no text, no numbers, no letters, no labels, no watermark, no realistic texture, no grain, no checkerboard painted into the image. Transparent outside each isolated silhouette. Clean flat colors and simple cel shading only. Preserve alpha.
```

