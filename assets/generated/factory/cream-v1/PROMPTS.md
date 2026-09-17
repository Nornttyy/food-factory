# 奶油色食品工厂素材提示词

生成方式：内置图片生成功能（不是 CLI/API 回退）。

用途：项目原型 PNG 图集。提示词要求规则网格，但实际输出有位置偏差，已按可见部件边界在 manifest.json 中逐个标注裁切框，不能直接等分。保留源 PNG alpha，不手绘替代素材。
三张图集分别生成；文字标签与交互提示由游戏代码绘制，不烘焙进图片。

## machines

```text
Use case: stylized-concept. Asset type: production-ready 2D raster sprite atlas for a cozy food automation game, not a screenshot or concept scene. Art direction: extremely simple flat cartoon illustration, cream colored, clear rounded silhouettes, large untextured opaque color shapes, restrained warm cocoa outline, maximum one small flat shadow shape per object, no gradients. Palette: creamy ivory #FFF2D9, biscuit beige #E7CEA7, muted peach #E4B69F, pale sage #B9C7AD, cocoa #846A57. SMALL simple shapes designed to remain legible at 64px. Absolutely NO realistic material textures, NO grain/noise, NO brushed metal, NO wood grain, NO realistic food detail, NO 3D rendering, NO glossy plastic, NO soft ambient occlusion, NO complex lighting. No anime characters, no humans, no text, no labels, no letters, no logos, no UI, no numbers, no border around the canvas.
Primary request: a single square 3 by 3 evenly spaced machine sprite atlas, exactly NINE separate food-factory machines in a strict row-major order. Transparent background with REAL alpha, not a checkerboard painted into the image. Uniform equal square cells, wide empty transparent gutters; no machine may touch another cell. Each machine centered, same visual size, occupies at most 68 percent of its cell width and height. Whole silhouette visible.
View: consistent 2D overhead game-symbol view, vertical sides vertical, horizontal sides horizontal, a little front panel visible, NO diagonal isometric bases. These are cartoon game machines, not realistic kitchen appliances. Simple boxy cream bodies, peach/sage accent panels, one obvious action feature, no tiny knobs. No built-in conveyor strips; conveyors are separate assets.
Exact nine cells from left to right, top to bottom:
row1: [a square FLOUR SUPPLY HOPPER with a broad hopper bowl holding one simple cream mound, one flour-sack pictogram only] [a DOUGH MIXER with a large round mixing bowl and one broad curved mixing arm over a simple dough lump] [a BREAD OVEN with a big rounded rectangular peach door and a tiny loaf symbol on it]
row2: [a DOUGH RING FORMING MACHINE with one visible round ring mold and a large press head] [a DONUT FRYER with a broad shallow pale-yellow rectangular vat and two simple ring donuts, no bubbles] [an ICING MACHINE with a peach icing reservoir and a broad short nozzle above a donut]
row3: [a FRUIT WASHING MACHINE with a simple sage basin and two orange fruits plus a single blue drop pictogram] [a JUICE PRESS with one short press piston above an orange cup and a tiny orange pictogram] [a PACKING MACHINE with a rounded arch over one simple closed biscuit-colored carton, no letters].
Do NOT create an entire factory scene. This is an ordered reusable machine sprite atlas.
```

## foods

```text
Use case: stylized-concept. Asset type: production-ready 2D raster sprite atlas for a cozy food automation game, not a screenshot or concept scene. Art direction: extremely simple flat cartoon illustration, cream colored, clear rounded silhouettes, large untextured opaque color shapes, restrained warm cocoa outline, maximum one small flat shadow shape per object, no gradients. Palette: creamy ivory #FFF2D9, biscuit beige #E7CEA7, muted peach #E4B69F, pale sage #B9C7AD, cocoa #846A57. SMALL simple shapes designed to remain legible at 64px. Absolutely NO realistic material textures, NO grain/noise, NO brushed metal, NO wood grain, NO realistic food detail, NO 3D rendering, NO glossy plastic, NO soft ambient occlusion, NO complex lighting. No anime characters, no humans, no text, no labels, no letters, no logos, no UI, no numbers, no border around the canvas.
Primary request: one square 4 by 4 evenly spaced ingredient and food inventory sprite atlas with exactly SIXTEEN separate icons. Real transparent alpha background; no drawn checkerboard. Uniform equal square cells with 25 percent transparent padding; no object extends outside its cell. Each icon alone, centered, consistent chunky shape, NO cast shadows outside icon. View: simple flat illustrated object, not photo.
Exact row-major order:
row1: [small unmarked flour sack with flour mound] [single pale blue water droplet outlined in muted blue] [three simple ivory sugar cubes] [one orange fruit with one sage leaf]
row2: [round raw dough ball, a single crease] [plain raw dough ring, center hole transparent] [small squat milk bottle with sage cap, solid ivory liquid, no text] [flat chocolate bar divided into four big squares]
row3: [small golden bread loaf with exactly two broad top slashes] [plain golden ring donut] [pink frosted ring donut with only three simple sprinkle strokes] [chocolate frosted ring donut, no sprinkles]
row4: [short rounded bottle of orange juice with sage cap and a tiny orange pictogram, no letters] [one small strawberry, only three seed dots] [one simple whipped cream swirl] [closed peach takeaway pastry box with a tiny heart-shaped closure, no writing].
All foods and packaging drawn very simply, with no crumb texture, no pores, no liquid refractions, no translucency within painted object, no highlights that look realistic. This is a uniform game inventory atlas, not a food illustration spread.
```

## logistics

```text
Use case: stylized-concept. Asset type: production-ready 2D raster sprite atlas for a cozy food automation game, not a screenshot or concept scene. Art direction: extremely simple flat cartoon illustration, cream colored, clear rounded silhouettes, large untextured opaque color shapes, restrained warm cocoa outline, maximum one small flat shadow shape per object, no gradients. Palette: creamy ivory #FFF2D9, biscuit beige #E7CEA7, muted peach #E4B69F, pale sage #B9C7AD, cocoa #846A57. SMALL simple shapes designed to remain legible at 64px. Absolutely NO realistic material textures, NO grain/noise, NO brushed metal, NO wood grain, NO realistic food detail, NO 3D rendering, NO glossy plastic, NO soft ambient occlusion, NO complex lighting. No anime characters, no humans, no text, no labels, no letters, no logos, no UI, no numbers, no border around the canvas.
Primary request: a single square 3 by 3 evenly spaced logistics / tile sprite atlas, exactly NINE separate icons in strict row-major order. Real alpha background, absolutely no painted checkerboard. Equal square cells, clear transparent gutters, each object centered and fills 72 percent of cell. NO text. This sheet is STRICT ORTHOGRAPHIC TOP DOWN: axis-aligned SQUARE shapes, not diamonds, no isometric perspective. Conveyor modules must all share identical width, squared ends, clear belt with sparse broad ribs and cream rails. Edge connectors on midpoints; NO food placed on belts. Avoid complicated small gears.
Exact cells:
row1: [a straight horizontal left-to-right conveyor module, cocoa moving belt and cream upper/lower rails, one peach right arrow] [a 90-degree elbow conveyor module connecting left edge to bottom edge, rails following the turn] [a T-shaped splitter conveyor connecting left edge input to right and bottom outputs, two simple directional peach arrows]
row2: [a T-shaped merger conveyor connecting left and top inputs to right output, peach arrow] [a square short-buffer storage crate with a sage rim and cream interior, view from above, no wood grain] [a compact cream warehouse intake platform with a peach awning stripe and one carton pictogram, top-down silhouette]
row3: [one PERFECT SQUARE floor tile, solid very light warm cream #FFF2D9 and only a very subtle beige outline, absolutely no pattern or texture] [one PERFECT SQUARE alternate floor tile, solid pale biscuit #F1DFC0 and only a very subtle beige outline, absolutely no pattern or texture] [one compact rounded sage dispatch counter / order collection station with a little cream clipboard pictogram and a carton, no letters].
The floor tiles are entirely opaque solid square artworks surrounded by transparent gutters. They must not be perspective diamonds. Keep all objects easy to extract and arrange on a square grid. No ground shadow.
```
