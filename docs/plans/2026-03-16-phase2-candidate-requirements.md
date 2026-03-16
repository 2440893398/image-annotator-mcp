# Image Annotator MCP Phase 2 候选需求文档

## 文档信息

- **项目**: image-annotator-mcp
- **文档类型**: Phase 2 候选需求文档（规划输入）
- **创建日期**: 2026-03-16
- **状态**: 候选 / 待评审与拆解
- **前置文档**: `docs/plans/2026-03-16-phase1-core-requirements.md`

---

## 1. 背景与定位

Phase 1 完成了核心链路的加固，系统已具备稳定的标注管线、坐标保护、DPR 缩放、格式输出和测试基线。

Phase 2 的定位是在此基础上向上升维，解决以下三个方向的问题：

1. **排版层**：标注密集时的智能避让、外置画板
2. **字体层**：跨平台字体一致性，消除系统字体差异
3. **工具层**：`preview/renderer.js` 与主实现同步、`create_step_guide` DPR 精度提升

本文档是候选需求集，每项需求附有技术可行性评级，供立项时取舍排序。

---

## 2. Phase 1 遗留限制（Phase 2 输入）

以下是 Phase 1 明确标记为"已知限制"的项目：

| 编号 | 遗留限制描述 | Phase 2 对应需求 |
|------|-------------|----------------|
| L1 | `create_step_guide` label 偏移固定像素，不随 DPR 自适应 | R1 |
| L2 | `preview/renderer.js` 未同步 Phase 1 实现（响应式、SVGO、格式等） | R2 |
| L3 | 未实现碰撞检测与智能布局 | R3 |
| L4 | Alt text 基于元数据，不基于图像理解 | R5 |
| L5 | 字体依赖系统字库，跨平台不完全一致 | R4 |

---

## 3. 核心候选需求

### R1. `create_step_guide` DPR 自适应修复

**背景**

`create_step_guide` 目前通过 `device_pixel_ratio` 缩放源坐标，但 handler 中的 label 偏移（`+50px`、`+28px`）和连接箭头距离是硬编码固定值，不参与 DPR 缩放，导致 2x 截图下 label 位置与 marker 实际距离偏差明显。

**需求描述**

- 将 `handleStepGuide` 中所有几何偏移值改为相对值（基于 marker 大小或 DPR 自动计算）
- 方案一：直接使用 `SIZE_PRESETS[sizePreset].markerSize` 推算间距
- 方案二：在 DPR 缩放阶段同时缩放固定偏移常量

**技术可行性**：✅ 高，纯逻辑改造，无外部依赖

**验收标准**

- DPR=2 时，`create_step_guide` 的 label 与 marker 间距与 DPR=1 视觉等比
- 向后兼容：DPR 未指定时行为不变

---

### R2. `preview/renderer.js` 与主实现同步

**背景**

`preview/renderer.js` 是 `annotate.js` 渲染逻辑的约 406 行拷贝，用于前端实时预览。Phase 1 对 `annotate.js` 做了大量改动（响应式算法、SVGO、新 annotation 路径），但预览层未同步，导致预览与实际输出存在渲染差异。

**需求描述**

方案一（重构）：将两者共同的渲染逻辑提取为独立的 `annotate-core.js`，`annotate.js` 和 `preview/renderer.js` 均从中引用，消除重复代码。

方案二（同步）：不重构，仅人工将 Phase 1 的以下改动补入 `preview/renderer.js`：
- 响应式尺寸算法（宽高比判断）
- `getSizePreset(width, height)` 签名更新
- SVGO 相关处理（可选，预览不需要 SVGO）

推荐方案一，但方案二工作量更小，可作为快速修复。

**技术可行性**：⚠️ 方案一中等（需重构），方案二低风险

**验收标准**

- 预览与实际输出在标注类型、颜色、尺寸上视觉一致
- 对同一参数集合，预览渲染结果与后端输出渲染结果 snapshot 对比通过

---

### R3. 标注碰撞检测与智能排版

**背景**

多个标注气泡（callout/label）同时存在时，容易在画面上互相重叠，遮挡底层 UI 元素。AI Agent 无法感知渲染后的空间占用，在密集标注场景下尤其严重。

**需求描述**

分两个子能力实施：

#### R3.1 碰撞检测与 Warning 反馈

在 `buildSvg()` 之前（坐标已确定后），对所有标注的包围盒进行两两碰撞检测，对发生重叠的标注对生成 warning 并返回给调用方，帮助 AI Agent 感知排版问题后自行调整。

- 每种标注类型维护一个 `getBoundingBox(annotation, sizePreset)` 辅助函数
- 碰撞检测逻辑使用 AABB（Axis-Aligned Bounding Box）相交判断
- 返回的 warning 格式：`{ type: 'overlap', annotations: [i, j], overlap: {x, y, w, h} }`

**技术可行性**：✅ 高，纯几何计算，无外部依赖

#### R3.2 自动排版重排（可选，工作量较大）

当 R3.1 检测到碰撞后，自动对 label/callout 进行最小位移重排，将重叠标注推向最近的空白区域：

- 基于简单的排斥向量迭代（非弹簧物理模拟，以降低复杂度）
- 限制重排范围：不允许标注被推出画布边界
- 重排次数上限，超出限制保留最终状态并 warning

**技术可行性**：⚠️ 中，算法设计需要迭代调试

**验收标准（R3.1）**

- 两个重叠标注产生 overlap warning
- 不重叠的标注不产生误报
- warning 包含两个标注的索引和重叠区域

---

### R4. 字体跨平台一致性（Text-to-Path）

**背景**

当前字体系统依赖系统字库回退（如 `Inter, -apple-system, sans-serif`），在 Windows / macOS / Linux 渲染后的字号、字偶距存在差异，导致标注文本宽度计算与实际渲染不符，影响 callout / label 包围盒尺寸。

**需求描述**

采用"字体打包 + 文本转路径（Text-to-Path）"方案：

1. 在 `assets/fonts/` 内置以下开源字体（协议友好）：
   - `Inter-Regular.woff2`（Latin，约 150KB）
   - `JetBrainsMono-Regular.woff2`（代码/bug 报告，约 200KB）

2. 使用 `opentype.js` 在构建 SVG 时将 `<text>` 标签替换为 `<path d="..." />`：
   - CJK 字符暂保留 `<text>` 标签，使用 `Noto Sans CJK` 系统回退（CJK 字体文件过大，不打包）
   - Latin 字符全部转路径

3. 转路径后 callout / label 的宽度计算改为从 glyph 路径直接获取，不再依赖估算系数

**技术可行性**：⚠️ 中，需引入 `opentype.js`（新依赖），初次实现工作量中等

**注意事项**

- SVG 体积会因 path 数据增加而膨胀；SVGO 已在管线中，可缓解
- 需要更新 `preview/renderer.js`（R2 同步完成后）
- CJK 字体不打包，CJK 场景仍有轻微跨平台差异，但比现在可控

**验收标准**

- 相同 Latin 文字在 Windows / macOS / Linux 三平台上 snapshot 对比一致
- `<text>` 标签在 SVG 输出中消失，替换为 `<path>`
- callout 包围盒尺寸更接近实际渲染宽度

---

### R5. SVG 无障碍语义注入（A11y）

**背景**

当前系统输出的 SVG 是无语义的像素叠加层，屏幕阅读器（JAWS / NVDA）无法解读其中的标注含义。Phase 1 实现的 alt_text 仅存在于 MCP 响应字段中，不嵌入 SVG 本身。

**需求描述**

当输出包含 SVG 文本（如嵌入 HTML 的 inline SVG 使用场景）时，为 SVG 注入 ARIA 语义：

1. 在根 `<svg>` 上添加 `role="img"` 和 `aria-labelledby`
2. 在 `<defs>` 内生成 `<title>` 和 `<desc>` 标签，内容来自 `generateAltText()` 的结果
3. 对每个有意义的标注组 `<g>` 添加 `aria-label`，描述该标注的类型和位置

**注意**：此能力对 PNG / WebP / AVIF 光栅化输出无意义，仅当用户选择 SVG 输出格式或 inline SVG 场景时有价值。

**技术可行性**：✅ 高，纯字符串操作，无新依赖

**前提条件**：需要先支持 SVG 格式直接输出（当前系统不支持，需先扩展 `output_format` 枚举加入 `svg`）

**验收标准**

- SVG 输出包含 `role="img"`
- 屏幕阅读器可读出 `<title>` 描述
- 每个 callout/label `<g>` 元素包含 `aria-label`

---

### R6. 简化版截图标注自动跟随（reannotate）

**背景**

UI 迭代后，已有标注配置的坐标会"飘移"到错误位置，需要人工重新标注。分析报告中提出了基于计算机视觉特征匹配的自动修复方案（SIFT 等），但其在 Node.js 生态中缺乏成熟实现。

**简化方案**

提供一个 `reannotate_screenshot` 工具，接收：

- 旧标注配置（来自上次调用的 annotations 参数）
- 新截图路径

由工具返回结构化的"建议重标注"信息，包含：
- 哪些标注坐标与新截图的内容不一致（通过 Playwright 重新获取元素位置对比）
- 供 AI Agent 审核并重新调用 `annotate_screenshot`

此方案不做自动特征匹配，而是将坐标重验证交给外部（Playwright / AI Agent），工具只负责把旧配置和新图串联起来让 Agent 判断。

**技术可行性**：✅ 高（简化版），⚠️ 中（完整视觉特征匹配版）

**验收标准**

- 工具能接收旧标注配置并返回结构化的重标注建议
- 不引入 OpenCV / SIFT 等 C++ 原生依赖

---

### R7. 基于正则的隐私脱敏（auto_redact）

**背景**

截图中可能包含邮箱、API Key、信用卡号等敏感信息。分析报告建议引入 OCR（`tesseract.js`）进行全屏文字识别，再结合正则规则自动模糊。

**简化方案（无 OCR）**

提供 `redact_patterns` 参数，用户传入自定义正则表达式数组，系统通过已有的文字坐标信息（callout/label 文本区域）进行文本匹配，对匹配区域自动叠加模糊标注。

此方案不依赖 OCR，仅对 annotate 过程中已知的文本坐标生效，不能检测截图中已有的敏感文字。

**完整方案（含 OCR）**

引入 `tesseract.js` 进行全屏 OCR，扫描截图中的文字，用正则规则匹配后自动生成 blur 标注叠加。

**技术可行性**：✅ 高（简化版）/ ⚠️ 中（OCR 版，首次加载约 15 秒）

**验收标准（简化版）**

- `redact_patterns: ['\d{4}-\d{4}-\d{4}-\d{4}']` 能自动 blur 匹配文本的坐标区域
- 不依赖 OCR

---

## 4. 技术可行性汇总

| 需求 | 描述 | 可行性 | 推荐优先级 | 估计工作量 |
|------|------|--------|-----------|----------|
| R1 | create_step_guide DPR 修复 | ✅ 高 | P0（Phase 1 遗留修复） | S |
| R2 | preview/renderer.js 同步 | ⚠️ 中（方案二低风险） | P1 | M（方案二） / L（方案一） |
| R3.1 | 碰撞检测 + Warning | ✅ 高 | P1 | M |
| R4 | Text-to-Path（Latin） | ⚠️ 中 | P2 | L |
| R5 | SVG A11y 语义注入 | ✅ 高（需先加 SVG 输出格式） | P2 | S（依赖 SVG output） |
| R3.2 | 自动排版重排 | ⚠️ 中 | P3 | L |
| R6 | 简化版 reannotate | ✅ 高 | P2 | M |
| R7 | 隐私脱敏（正则版） | ✅ 高 | P2 | S |

---

## 5. 不纳入 Phase 2 的候选项

以下来自分析报告的需求在 Phase 2 不推荐实施，保留为远期候选：

| 项目 | 原因 |
|------|------|
| SAM 2 视觉分割 | Node.js ONNX 生态不成熟，推理延迟高，架构复杂度剧增 |
| 完整视觉特征匹配（SIFT）截图修复 | 需要 OpenCV 原生依赖，Node.js 生态无成熟实现 |
| VLM 驱动 Alt Text | 需要外部 API / 本地大模型，成本与延迟不确定 |
| 自然语言目标检测（"高亮所有输入框"） | 需要 YOLO/DETR 等视觉检测模型 |
| CJK Text-to-Path | 字体文件体积过大（~16MB），包体积不可接受 |

---

## 6. 前置条件与依赖关系

```
R1（DPR 修复）— 独立，可立即开始

R2（preview 同步）— 独立，但 R4（Text-to-Path）完成后需再次同步

R3.1（碰撞检测）— 独立，需要先为每个 annotation 类型实现 getBoundingBox()

R3.2（自动重排）— 依赖 R3.1 完成

R4（Text-to-Path）— 独立，引入 opentype.js；完成后 R2 需再次同步 preview

R5（SVG A11y）— 依赖先扩展 output_format 支持 svg 类型

R6（reannotate）— 独立

R7（隐私脱敏）— 独立
```

---

## 7. 参考文档

- `docs/plans/2026-03-16-phase1-core-requirements.md`
- `docs/analysis/图像标注工具优化需求报告.md`（第五章、第六章、第七章）
- `.sisyphus/plans/phase1-core-improvements.md`
