# 打码（Redaction）实施计划

## 文档信息

- **项目**: image-annotator-mcp
- **创建日期**: 2026-09-04
- **修订**: 2026-09-05 按评审意见修订（solid 改走 SVG 顶层矩形；magnifier 取样坐标系显式化；补 preview/config-UI 影响面；校验收紧；SVG+redact_patterns 升级为报错）
- **状态**: 阶段一、二已实施完成（2026-09-05，v1.1.0，277 测试全绿，含 25 条像素级打码测试与三组回退验红验证）；阶段三保持可选未实施
- **前置文档**: [R7 基于正则的隐私脱敏](./2026-03-16-r7-auto-redact.md)
- **估计工作量**: M（核心 2 ~ 3 天）+ S（可选增强 1 ~ 2 天）

---

## 1. 研究结论：当前 `blur` 完全不具备打码能力

### 1.1 实现原理错误

`src/annotate/render.js` 的 `createBlur`：

```js
defs:    `<filter id="${id}"><feGaussianBlur stdDeviation="${intensity}"/></filter>`,
element: `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#808080" filter="url(#${id})"/>`
```

高斯模糊作用于**这个灰色矩形自身**，而不是底下的图像。矩形被模糊后边缘变成半透明渐变，底图从渐变区直接透出。

关键在于过渡带宽度约 `3σ`（默认 `intensity=8` → 约 24px）。当打码框高度 ≤ 2×3σ 时，**整个矩形都是半透明的，没有任何一处实心**。

### 1.2 实测：典型场景下内容 100% 可读

源图为 16px 行高的高对比度条纹（模拟一行文字），打码框严丝合缝覆盖该行——这正是 `redact_patterns` 自动生成的框的尺寸：

| 打码框 | 区内 std | 像素范围 | 结论 |
|---|---|---|---|
| 高 16px，intensity=8（默认） | 57.4 | 50 ~ 203 | 内容清晰可辨 |
| 高 16px，intensity=2 | 22.6 | 75 ~ 180 | 内容可辨 |
| 高 30px 覆盖 16px 文字 | 11.4 | 105 ~ 148 | 内容可辨 |

**打码框内"暗/亮"判定与原图一致率：100.0%**（50% 才代表不可辨）。原始的 0/255 只是被压缩到 85/169，笔画形状完整保留。

### 1.3 可直接还原

用二进制条码编码字符串 `SECRET` 并打码，无需任何专门工具，仅从输出 PNG 逐像素取阈值：

```
原始编码内容    : SECRET
从"打码"图解出  : "SECRET"
比特还原率      : 100.0%
```

### 1.4 影响面

README、README.zh-CN、SKILL.md 均明确承诺 "Blur sensitive content" / "模糊敏感内容" / "Blurring sensitive information in screenshots"。`redact_patterns` 整个功能建立在这个 `blur` 之上。此外 `src/server/index.js:54` 的工具降级提示、`src/server/tools.js:15/24` 的快速参考仍在教调用方"用 blur 遮敏感信息"。

**用户会以为敏感信息被遮住了，实际上没有。** 这是本计划的首要修复目标。

---

## 2. 研究结论：遮挡方式的信息残留

对两张仅内容不同（条纹相位差 2px）的图施加同一遮挡，比较遮挡区的逐像素差异（MAE）。MAE > 0 意味着遮挡后仍能区分原内容，即存在信息泄漏。

| 方法 | 区内 std | 两图 MAE | 安全性 |
|---|---|---|---|
| **solid 实心填充** | **0.0** | **0.00** | ✓ 无残留 |
| pixelate 8px | 127.5 | 127.50 | ⚠ 可区分内容 |
| blur σ=12（真模糊） | 14.3 | 6.19 | ⚠ 可区分内容 |
| blur σ=30（真模糊） | 18.5 | 11.69 | ⚠ 可区分内容 |

**只有实心填充是不可逆的。**

- **像素化**保留块级平均值。对已知字符集的内容（数字、等宽文本），可以枚举所有候选并比对块值来还原——这正是 Depix 类攻击的原理。像素块越小泄漏越多，而块大到安全时视觉上已与实心填充无异。
- **真高斯模糊**是线性可逆卷积，理论上可反卷积；即使不做反卷积，σ=30 时 MAE 仍有 11.69。
- 提高 σ 并不单调变安全（σ=30 的 MAE 反而大于 σ=12，因边界效应），**不存在"调大参数就安全"的模糊**。

### 结论

- 打码（不可逆遮蔽）**只能用实心填充**。
- 像素化 / 模糊只能定位为**美观弱化**（visual de-emphasis），不能宣称保护隐私，且必须在 API 与文档中显式声明这一点。

---

## 3. 研究结论：架构层面的三个泄漏面

### 3.1 SVG 输出模式下打码无意义

`output_format: 'svg'` 产出的是**不含源图像的标注图层**。其中的打码元素只是一个矩形；用户把该 SVG 叠在原图上时，原图内容完好无损，删掉一个元素即可看到全部内容。

更严重的是 `redact_patterns` 场景：被匹配的 callout/label 的敏感文本以 `<text>` 字面存在于输出的 SVG 文件里——任何矩形都遮不住文件内容本身。

当前对这两种组合没有任何提示。

### 3.2 magnifier 会绕过打码

`magnifier` 从 `inputPath`（**原图**）取样放大（`src/annotate/runtime.js:212`）。无论打码以何种方式呈现在最终图上，magnifier 取到的都是未打码的原始像素。将 magnifier 的 target 指向打码区、anchor 放在别处，即可把被遮蔽的内容放大展示在打码框之外。

### 3.3 `redact_patterns` 的框未必覆盖敏感区

该功能匹配的是**标注自身的文本**，生成的框来自 `getBoundingBox(annotation)`——即标注（label/callout）的位置，而不是截图中敏感信息的实际位置。文档已声明"不做 OCR"，但没有说明"遮的是标注框、不是底图里的原文"。若 agent 用 callout 指向某处并在文本里复述了敏感值，被遮的是那个 callout，底图里的原值仍然可见。

**层序约束（评审新增）**：`applyRedactPatterns` 把生成的框追加在标注数组末尾（`runtime.js:67`），SVG 按顺序绘制，因此这个框必须画在被匹配标注**之上**才有意义。任何把打码移到标注层之下（如纯像素操作）的方案都会让含敏感文本的 callout 重新绘制在打码之上——文本原样可见。这是本次设计选型（4.1）的决定性约束。

### 3.4 元数据（已验证无问题）

带 EXIF 的源图经 `annotateImage` 处理后，输出的 `exif` / `icc` / `xmp` 均被剥离（sharp 默认行为，项目未调用 `withMetadata()`）。**此项无需修改**，但应加测试锁定，防止将来有人为了保留色彩配置而引入 `withMetadata()` 时把 EXIF 一起带回来。

---

## 4. 设计方案

### 4.1 核心决策：按模式选实现层

**solid（默认）走 SVG 顶层矩形；pixelate/blur 走像素操作。**

- **solid**：在 SVG 标注层的**最顶端**（最后绘制）画一个不透明矩形。栅格化压平后，该区域的最终像素就是填充色本身——`std === 0`、`MAE === 0`，与像素级替换**等价地不可逆**（composite 是覆盖不是混合）。同时它天然盖住区域内的一切：底图、更早绘制的标注（3.3 的层序约束）、以及 composite 顺序在 SVG 之下的 magnifier 补丁。实现上无需 extract、零额外编解码。
- **pixelate / blur**：SVG 无法对底图做滤镜（合成管线里 SVG 层拿不到 backdrop），必须走像素操作：从底图取出区域、处理、composite 回**标注层之下**。标注仍绘制在弱化区之上——"blur 一块区域再放 callout"是合理用法，这个层序是有意的。

**层序语义（必须写入文档与 schema 描述）**：

| 模式 | 相对底图 | 相对其他标注 | 相对 magnifier 补丁 |
|---|---|---|---|
| solid | 之上 | **之上**（盖住重叠标注） | 之上 |
| pixelate / blur | 作用于底图 | 之下（标注照常绘制在上） | 之下 |

管线（raster 输出）：

```
底图 → extend(padding)
  └─ ① pixelate/blur 像素弱化层（仅这两种模式需要）
      └─ ② magnifier 放大层（取样源见 4.5）
          └─ ③ SVG 标注层：普通标注 → solid redact 矩形 → redact label（见 4.8）
```

### 4.2 新增 `redact` 标注类型

```jsonc
{
  "type": "redact",
  "x": 100, "y": 100, "width": 200, "height": 24,
  "mode": "solid",        // solid（默认）| pixelate | blur
  "color": "#64748B",     // 仅 solid：填充色，默认 #64748B（slate），经 getColor 白名单
  "blockSize": 12,        // 仅 pixelate：≥1，默认 12
  "intensity": 12,        // 仅 blur：高斯 σ
  "label": "已隐去"        // 可选：在遮蔽块上叠加说明文字（经 escapeXml）
}
```

- `mode` 默认 `solid`，**默认即安全**。
- `pixelate` / `blur` 在工具描述和运行时警告中明确标注为"可逆，仅用于视觉弱化，不要用于敏感信息"，并说明层序差异（4.1 表格）。
- `label` 让打码块可自我说明（"已隐去"/"REDACTED"），绘制在 solid 矩形之上（4.8）。
- `blockSize` 加入 `render.js` 的 `NUMERIC_ANNOTATION_FIELDS`，并在 clamp 阶段夹取为 ≥1。
- **solid 矩形坐标取整并设置 `shape-rendering="crispEdges"`**：非整数坐标的抗锯齿边缘像素是"填充色 × 原图像素"的混合，会让 6.2 的 MAE === 0 断言失败，也构成边缘一排像素的微量泄漏。

### 4.3 `blur` 类型的处置

保留 `blur` 作为 `{type:'redact', mode:'blur'}` 的别名，改为**真正作用于底图像素**。理由：

- 现有调用方不会因类型名消失而中断。
- 修复后 `blur` 至少名副其实——真的在模糊图像内容，而不是画一个漏光的灰框。
- 但 `blur` 仍是可逆的，因此 `redact_patterns` 的默认产出改用 `solid`（见 4.4）。

`buildSvgParts` 中移除 `blur` 分支（不再作为 SVG 元素渲染），`createBlur` 保留导出仅供快照测试与向后兼容。

**破坏性变更（比原稿扩充）**：

1. `blur` 现在**必须提供 width/height**（ValidationError）。旧行为缺省时靠 `getBoundingBox` 默认 100×60，对一个遮蔽区域来说隐式尺寸是危险的。
2. `blur` 从"SVG 层元素（画在更早标注之上）"变为"底图像素操作（在所有标注之下）"。依赖旧 blur 盖自家标注的调用会受影响——该场景应改用 `redact`（solid）。
3. `output_format: 'svg'` 时 `blur`/`pixelate` 不再产生任何元素（无图可处理）；`solid` 仍产生顶层矩形。行为详见 4.6。

### 4.4 `redact_patterns` 改为默认 solid

```js
blurAnnotations.push({ type: 'redact', mode: 'solid', x, y, width, height, label: 'REDACTED', _generatedFor: index });
```

- 因为 solid 走 SVG 顶层（4.1/4.8），生成的矩形**保证画在被匹配标注之上**——3.3 的层序约束由绘制分区结构性满足，而不是依赖数组追加顺序。
- `_generatedFor` 是内部标记（不会被序列化进 SVG），供 `detectCollisions` 跳过"生成的 redact × 它所遮蔽的标注"这对必然重叠，消除警告噪音；用户手放的 redact 与其他标注重叠仍照常告警。
- **实施中由端到端测试逼出的额外修复**：`getBoundingBox` 按 0.5em/字符估算文本宽度，真实字形（数字 ~0.55em、'W' ~0.95em）更宽，渲染文本会溢出估算框——溢出的字形边缘就是内容泄漏（等长不同 PIN 的全图 MAE 实测 0.29 ≠ 0）。修复：生成框每边水平外扩 `35% + 12px`、垂直外扩 12px。已知限界：病态的全宽字形长串仍可能超出余量，guardrails 要求对打码输出做目视核查。
- `applyRedactPatterns` 改在 **DPR 缩放与 clamp 之后**运行（原计划未明确）：DPR 不缩放 fontSize，clamp 会移动标注，先算框再缩放/夹取会导致框与实际绘制位置错位；顺带修复了原实现在 DPR>1 下遮盖框错位的潜在 bug。生成框随后单独过一遍 clamp。
- 工具描述（`src/server/tools.js:92`）补上现在缺失的说明：**遮蔽的是标注自身的文本框，不是截图底图中的原始内容**。
- 同步更新 `src/server/index.js:54` 降级提示与 `tools.js:15/24` 快速参考中"用 blur 遮敏感信息"的示例文案。

### 4.5 修复 magnifier 绕过打码（含坐标系切换规范）

仅当 **redact 与 magnifier 同时存在**时：

1. 先把"padding 后底图 + 全部 redact 区域以像素方式落实"物化为中间 buffer。**solid 也要烙进中间图**——solid 的 SVG 矩形只盖自己那块区域，挡不住 anchor 在别处的 magnifier 把 target 区的原始像素放大展示（3.2）。solid 区域在最终图上会被"烙底 + SVG 顶层矩形"覆盖两次，同色幂等，无副作用。
2. magnifier 从该中间图取样，最终 composite 也以该中间图为底。

**坐标系切换（评审新增，必须显式实现，这里最容易做出带偏移的安全漏洞）**：

- 现行 magnifier 取样在**未加 padding 的原图空间**：`sourceX = tx - padding.left`（`runtime.js:183`），裁剪夹取用未扩展的 `width`/`height`（`runtime.js:201-202`）。
- 走中间图分支时，取样坐标改为 **padding 后空间**（不再减 `padding.left/top`），夹取改用 `extendedWidth`/`extendedHeight`。
- 为避免同一函数内两套坐标约定混写，把取样逻辑抽成 helper：`extractMagnifierPatch(source, { coordSpace, boundsWidth, boundsHeight, ... })`，两个分支各自传入自己那套完整参数，**每条路径只有一种约定**。

无 magnifier 时不建中间图：pixelate/blur 的弱化层直接从 `inputPath` 取（unpadded 坐标），composite 到 padded 坐标——与现行 magnifier 补丁同一模式，零额外编解码。

代价：仅 redact + magnifier 并存时多一次编解码，可接受。

### 4.6 SVG 输出模式的行为

`output_format: 'svg'` 时按来源与模式区分：

| 场景 | 行为 |
|---|---|
| 用户手放 redact（solid） | 产出顶层矩形元素（视觉上盖住），但在 `warnings` 与 `handleAnnotate` 文本输出中警告：SVG 可编辑，矩形可被移除，不构成打码；如需打码请用 png/jpeg/webp |
| 用户手放 redact/blur（pixelate/blur 模式） | 不产出元素 + 同上警告 |
| **`redact_patterns` 命中 + svg 输出** | **直接报错（InvalidParameterError）**。敏感文本以 `<text>` 字面存在于输出文件，矩形与警告都无法兑现该功能的承诺。（备选方案"剥离匹配标注的文本"未采用：静默改内容比失败更难察觉。） |

用户手放场景不报错——用户可能有意只要图层，但必须让 agent 与人都看到提示。

### 4.7 坐标系与严格校验

redact 区域与 magnifier 面对同一问题：`validAnnotations` 已经过 DPR 缩放与 padding 偏移。solid 矩形直接使用 `validAnnotations` 坐标（SVG 画布即 padding 后画布）；pixelate/blur 的像素提取按 4.5 的分支规则处理坐标。区域夹到画布范围内，宽高取整（sharp 的 `extract` 只接受非负整数）。

**校验收紧（评审新增）**——对一个安全功能，"静默少遮"必须是错误：

- `validateAnnotation` 增加规则：`redact` 与 `blur` 必须有数值型 `width`/`height`。
- 但 `validateAnnotations` 在 DPR 缩放与 clamp **之前**运行（`runtime.js:75`），挡不住"夹取后归零/被 DROP"。因此在 clamp 之后增加一道 post-clamp 检查：任何 redact/blur 标注若 width/height 缺失（被 `clampAnnotations` 的 DROP 语义删除，`runtime.js:572`）或 < 1，**抛 `InvalidParameterError`**，不沿用其他标注"删字段发警告"的宽容处理。
- `blockSize` 夹取 ≥1；`label` 经 `escapeXml`；`color` 经 `getColor` 白名单（已有机制）。

### 4.8 绘制顺序与 preview / config-UI（评审新增）

**`buildSvgParts` 分区输出**：普通标注 → solid redact 矩形 → redact label，三段按序拼接。solid 的"画在最上"由结构保证，不依赖调用方数组顺序。`data-annotation-index`（a11y 用）保留标注的原始 index，分区不影响它。

**preview 影响面**：`src/preview/renderer.js:54` 直接复用 `buildSvgParts`，config UI 与 examples 页靠它渲染（`renderer-single-source.test.js` 锁定单一来源）。若只移除 blur 分支而不加 redact 分支，预览里打码框将**完全不可见**（落入 `default:` WARN）。方案：

- `solid`：预览与成品同为顶层不透明矩形——天然忠实。
- `pixelate` / `blur`：成品中它们是像素操作，SVG 层不渲染；预览中渲染一个**占位样式**（半透明斜纹 + 虚线边框 + 模式名），仅当 `options.preview === true` 时产出（renderer.js 传入），避免占位物混进成品的 SVG 层。
- 同步更新 examples 页（`examples/preview/index.html`）的 blur 示例为 redact，并扩展 `renderer-single-source` 测试覆盖 preview 标志的分叉行为。

---

## 5. 实施步骤

### 阶段一：核心打码（必做）

| # | 任务 | 文件 |
|---|---|---|
| 1 | `buildSvgParts` 新增 `redact` 分支：solid 顶层分区（矩形坐标取整 + crispEdges）+ label + preview 占位（`options.preview`）；移除 `blur` SVG 分支，`blur` 映射为 `mode:'blur'` | `src/annotate/render.js` |
| 2 | `blockSize` 加入 `NUMERIC_ANNOTATION_FIELDS`；clamp 阶段夹取 ≥1 | `src/annotate/render.js`、`runtime.js` |
| 3 | `validateAnnotation` 增加 redact/blur 规则（必须有数值 width/height）；clamp 后对 redact/blur 做 post-clamp 严格检查（消失/归零 → `InvalidParameterError`） | `src/annotate/runtime.js` |
| 4 | 新增 `buildRedactionLayers(annotations, ...)`：pixelate/blur 像素弱化层（extract → 处理 → composite 到标注层之下） | `src/annotate/redact.js`（新建）、`runtime.js` |
| 5 | magnifier 取样重构：抽 `extractMagnifierPatch` helper；redact+magnifier 并存时物化"padded + 全模式烙底"中间图并切换到 padded 坐标 / extended 尺寸夹取 | `src/annotate/runtime.js` |
| 6 | `redact_patterns` 改产 `{type:'redact', mode:'solid', label:'REDACTED'}` + `_generatedFor` 标记（渲染前剥离）；`detectCollisions` 跳过生成对 | `src/annotate/runtime.js` |
| 7 | `getBoundingBox` / `getAnnotationAriaLabel` / `generateAltText` 支持 `redact` | `src/annotate/runtime.js` |
| 8 | MCP schema 增加 `redact` 类型与 `mode`/`blockSize`/`label` 字段，描述写明可逆性与层序差异；更新 `tools.js:15/24` 快速参考与 `index.js:54` 降级文案 | `src/server/tools.js`、`src/server/index.js` |
| 9 | SVG 输出：手放 redact → 警告（warnings + 文本输出）；`redact_patterns` 命中 → 报错 | `src/annotate/runtime.js`、`src/server/handlers.js` |
| 10 | preview renderer 与 examples 页更新；扩展 `renderer-single-source` 测试 | `src/preview/renderer.js`、`examples/preview/index.html`、`tests/preview/` |

### 阶段二：文档与防回归（必做）

| # | 任务 | 文件 |
|---|---|---|
| 11 | README / README.zh-CN / SKILL.md 更正 blur 的表述，新增 redact 章节、"可逆性"与层序说明 | 文档 |
| 12 | `guardrails.md` 增加"打码使用准则" | `skills/image-annotator/references/guardrails.md` |
| 13 | CHANGELOG：显著位置说明历史 blur 输出未被真正遮蔽，建议重新生成；列出 4.3 的三条破坏性变更 | CHANGELOG |
| 14 | CLI：更新 `--help` 与文档（redact 标注经 `--annotations` JSON 表达；`--redact-patterns` 已存在）。~~新增 `--redact` 参数~~（取消：与 `--annotations` 重复，无增量价值） | `src/annotate/cli.js` |

### 阶段三：可选增强

| # | 任务 | 备注 |
|---|---|---|
| 15 | `redact` 支持 `shape: 'rect' \| 'ellipse'` | 人脸遮蔽 |
| 16 | OCR 版 auto-redact | 见 R7 Phase 3，需 `tesseract.js`，独立评估 |
| 17 | ~~按背景自动选填充色 `color: "auto"`~~ | **已研究，结论为暂不实施**：只在彩色/渐变背景上是明确赢面，纯白/深色背景与固定色打平。参数、两个反直觉的坑与安全红线见[研究记录](../research/2026-09-05-auto-redact-color.md) |

---

## 6. 测试策略

### 6.1 关键：不能用 `extract().stats()` 验证

**sharp 的 `stats()` 统计的是输入图像，会忽略链式 `extract()`。** 本次研究中该陷阱导致一组读数完全失真（实心填充区域被报成 `min=33 max=255`，而逐像素扫描是 7800/7800 全为 33）。

所有打码测试必须走 `raw().toBuffer({resolveWithObject:true})` 后逐像素校验。**所有逐像素断言在 png 输出上进行**——jpeg 有损编码会让 std ≠ 0（无泄漏，源内容已在压平时被替换，但断言会误报）。

### 6.2 必须覆盖的用例

| 用例 | 断言 |
|---|---|
| solid 打码区域 | 区内**每一个**像素都等于填充色（`std === 0`），逐像素扫描 |
| solid 边界锐利 | 框内首行等于填充色；框外紧邻像素与原图一致（这条同时锁定 4.2 的坐标取整 + crispEdges） |
| **反还原测试** | 两张仅内容不同的图打码后逐像素 MAE === 0 |
| 小尺寸框（高 12/16/20px） | 同样 `std === 0`——这是当前实现失效最严重的尺寸 |
| **redact_patterns 端到端（评审新增，功能的原始承诺）** | 两次运行，callout 含**等长**不同敏感文本（等长保证布局一致），输出全图逐像素 MAE === 0 |
| **solid 层序（评审新增）** | 在 redact 区域内先放一个 label，最终位图中 label 不可见（区内 std === 0） |
| **pixelate/blur 层序（评审新增）** | 弱化区之上的 callout 正常可见 |
| pixelate / blur | 明确断言其 MAE > 0，并锁定"仅视觉弱化"的定位与运行时 warning |
| magnifier + redact（三种 mode） | magnifier 圆内不出现打码区的原始内容；solid 模式圆内为填充色 |
| **magnifier + redact + DPR + canvasPadding（评审新增）** | 走中间图路径时放大内容位置正确——针对 4.5 的坐标系切换 |
| SVG 输出 + 手放 redact | `warnings` 含对应警告；solid 有顶层矩形元素，pixelate/blur 无元素 |
| **SVG 输出 + redact_patterns 命中（评审新增）** | 抛 `InvalidParameterError` |
| DPR / canvasPadding 组合 | 打码区落在正确位置 |
| 越界 / 非整数区域 | 夹取后仍 ≥1px 则正常打码；**缺失/归零/被 DROP 一律抛 `InvalidParameterError`**（不允许静默少遮） |
| preview 分叉 | `options.preview` 下 pixelate/blur 渲染占位；无该标志不渲染；solid 两侧一致 |
| detectCollisions 降噪 | 生成的 redact × 被遮标注不告警；手放 redact × 其他标注照常告警 |
| 元数据 | 输出的 exif/icc/xmp 均为空（防止将来引入 `withMetadata()` 时回归） |

### 6.3 验证纪律

沿用本轮评审的做法：每条修复写完后**回退该修复、确认对应测试变红、再恢复**。打码是安全功能，一个"看起来通过实际没断言到位"的测试比没有测试更危险。

---

## 7. 风险与决策点

| 风险 | 影响 | 应对 |
|---|---|---|
| **既有输出的信任问题** | 用过 `blur`/`redact_patterns` 的历史截图都未被真正遮蔽 | 在 README 与 CHANGELOG 用显著位置说明，建议用户重新生成 |
| `blur` 语义变更（三条破坏性变更，见 4.3） | width/height 必填；层序从"盖早期标注"变为"标注之下"；SVG 输出无元素 | 视为 bug 修复；快照测试更新；发 minor 版本并在 CHANGELOG 逐条标注 |
| 层序语义分裂（solid 盖标注 vs pixelate/blur 不盖） | 调用方困惑 | 4.1 表格写入 schema 描述与文档；两条层序测试锁定 |
| 性能 | solid 零额外编解码；pixelate/blur 每区一次 extract/合成（与 magnifier 同量级，实测 80ms）；仅 redact+magnifier 并存多一次中间图编解码 | 标注数通常 < 20，可接受 |
| agent 误用 pixelate/blur | 以为已保护隐私 | schema 描述 + 运行时 warning 双重提示；默认 solid |
| solid 边缘抗锯齿泄漏 | 非整数坐标时边缘一排像素混入原图 | 坐标取整 + crispEdges；MAE === 0 与边界锐利测试兜底 |

### 决策记录（2026-09-05 评审已定）

1. **`blur` 保留为 `mode:'blur'` 别名**，但收紧校验（width/height 必填）；`redact_patterns` 默认改 solid。
2. **`mode:'pixelate'|'blur'` 每次都产生 warning**——安全功能的默认应当聒噪。
3. **SVG + redact 分级处理**：用户手放 → 警告（可能有意只要图层）；`redact_patterns` 命中 → 报错（敏感文本字面在文件里，警告不足）。
4. **solid 的实现层**：SVG 顶层矩形而非像素操作——压平后同等不可逆，天然满足 3.3 的层序约束，实现更简；像素操作仅保留给 pixelate/blur 与 magnifier 中间图。

---

## 8. 附：本计划所依据的实测脚本

研究过程中的验证脚本均为临时文件，未入库。核心测量方式记录于此以便复现：

- **内容可辨性**：对两张仅内容不同的图施加同一遮挡，逐像素求 MAE；MAE === 0 才算不可逆。
- **遮蔽完整性**：遮蔽区逐像素求 std；solid 必须为 0.0。
- **还原演示**：二进制条码编码字符串 → 打码 → 直接阈值取样解码，验证比特还原率。

这三种测量应固化进 `tests/annotate/redact.test.js`。
