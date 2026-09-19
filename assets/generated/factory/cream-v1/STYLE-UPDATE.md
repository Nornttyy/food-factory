# 奶油手绘统一 · v0.12.0

- 生成方式：内置 `image_gen`，一次风格迁移编辑，未使用 CLI/API。
- 项目文件：`expansion-v2.png`，1536 × 1024 RGBA，原始 alpha 保留；旧版文件留作回退，不再由清单加载。
- 风格参考：`machines-v1.png` 左上角面粉料斗。编辑目标：`expansion-v1.png`。
- 替换：饼干、奶香包、草莓蛋糕、橙汁冰棒及对应四台机器；无玻璃高光，简化折痕和装饰，奶油 / 鼠尾草 / 桃粉 / 可可描边。
- 保留：原本协调的基础机器、食材、物流图集与菜单封面；机器与食品编号、玩法参数和存档不变。
- 同步：界面、地面、传送带与机器接头使用同组奶油色。轨道几何保持原有无缝连接。
- 加载页小面团是轻量 CSS 按钮，不依赖图集下载，无写实纹理。
- 验证：新图集 57.39% 像素完全透明；以 alpha ≥ 16 的主体边界外扩 4 像素重新标定 8 个裁切框，不改动 PNG。

## 最终提示词

```text
Use case: style-transfer
Asset type: transparent PNG sprite atlas for the existing food-factory game.
Input images: Image 1 is the STYLE REFERENCE only: the 3 by 3 machine atlas, especially its TOP LEFT flour hopper. Image 2 is the EDIT TARGET: the 4 by 2 expansion atlas.
Primary request: Redraw only the eight sprites from Image 2 in the same understated creamy hand-drawn style as Image 1's flour hopper. Keep the exact subjects, 4 columns by 2 rows ordering, approximate proportions and centers from Image 2. Do not copy Image 1's machines into the output.
Top row from left: a simple round scalloped butter cookie; a white steamed bun with just a few folds; a small strawberry cream cake slice; an orange icepop on a plain stick.
Bottom row: a small cookie oven with cookie pictogram; a round cream bun steamer with sage trim; a peach and cream cake decorating machine with nozzle and plate; a cream icepop freezer with sage trim and simple snowflake pictogram.
Style: warm muted cocoa outlines like the flour hopper (not black), gently irregular rounded silhouettes, large simple cream shapes, very restrained flat biscuit shadows, matte pastel colors. Light cream dominates. Muted sage and dusty peach accents. Simplify knobs and details. Shallow front/top view, no isometric tilt.
Output: 1536x1024 landscape PNG, 4 equal columns and 2 equal rows, each sprite fully isolated inside its own cell with at least 32px transparent gap. Genuine transparent alpha background, including ALL gaps between sprites; no colored backdrop, no fog, no shadow sheet, no checkerboard painted into image.
Constraints: preserve all eight identities and order; no new objects, words, labels, borders or watermark. NO realistic textures, NO paper grain, NO noise, NO gloss, NO specular highlights, NO glass reflections, NO metallic finish, NO 3D rendering, NO gradients. Keep edible colors soft and low-saturation; not fluorescent orange or bright pink. This is usable game art, not a poster.
```
