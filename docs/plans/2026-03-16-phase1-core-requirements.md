# Image Annotator MCP Phase 1 需求文档

## 文档信息

- **项目**: image-annotator-mcp
- **文档类型**: Phase 1 核心能力需求文档
- **创建日期**: 2026-03-16
- **状态**: 已实现 / 可作为后续迭代基线
- **适用版本**: 1.x

---

## 1. 背景与目标

基于 `docs/analysis/图像标注工具优化需求报告.md` 的分析结果，项目在 Phase 1 聚焦于“核心链路加固”，目标不是引入视觉大模型，而是先把 MCP 工具的稳定性、可用性、可测试性和对 AI Agent 的友好度补齐。

本阶段的目标如下：

1. 降低 AI Agent 在工具调用中的参数错误率
2. 提升截图标注在高分屏、长图和复杂输出格式下的稳定性
3. 减少工具数量，降低模型工具选择成本
4. 建立可持续迭代的测试与验收基线
5. 为 Phase 2 的智能布局、语义理解等能力预留稳定底座

---

## 2. 适用范围

本需求文档覆盖以下模块：

- `server.js`
- `annotate.js`
- `annotate-errors.js`
- `config-loader.js`
- `annotate.test.js`
- `server.test.js`
- `package.json`

不覆盖以下内容：

- `preview/renderer.js`
- `config-ui/` 的功能扩展
- 视觉大模型 / OCR / SAM2 / 自动目标检测
- 文档生成以外的 GUI 交互改造

---

## 3. 用户与场景

### 3.1 目标用户

1. **AI Agent / MCP Client**
   - 通过结构化参数调用标注工具
   - 需要低歧义、低失败率、低重试成本

2. **技术文档编写者**
   - 需要对截图进行高亮、标注、步骤说明、脱敏输出

3. **自动化测试与 QA 工程师**
   - 需要在 Playwright 等截图链路中稳定生成说明图

### 3.2 典型场景

1. 传入浏览器 CSS 坐标，在 Retina/2x 截图上正确映射到物理像素
2. 对长图或窄长图自动采用更合理的字号与标注尺寸
3. 一次输出 PNG / WebP / AVIF / JPEG 等不同格式
4. 在原图四周扩展留白，避免密集标注遮挡主体内容
5. 对越界坐标自动纠正并返回可解释的 warning

---

## 4. 核心需求

### R1. 工具归一化

系统必须将 MCP 工具收敛为以下 4 个：

- `annotate_screenshot`
- `get_image_dimensions`
- `create_step_guide`
- `open_config_ui`

同时必须移除以下便捷工具：

- `highlight_area`
- `add_callout`
- `blur_area`

#### 验收标准

- ListTools 返回工具数量为 4
- 对已移除工具的调用返回结构化迁移提示
- `annotate_screenshot` 描述中包含 blur / highlight / callout 的等效示例

---

### R2. 输入 Schema 增强

系统必须增强工具的 `inputSchema`，让 AI Agent 能生成更稳定的参数：

- 坐标与尺寸参数包含 `minimum` / `maximum` 约束
- 新增以下参数描述：
  - `device_pixel_ratio`
  - `output_format`
  - `canvas_padding`
  - `quality`
- 描述文本必须面向模型消费，而不是只面向人类阅读

#### 验收标准

- `annotate_screenshot` 与 `create_step_guide` 的 schema 中包含上述约束和新参数
- 关键字段说明中明确 CSS 像素、高分屏、输出格式、自动偏移含义

---

### R3. 坐标边界保护

系统必须对所有标注坐标执行边界校验，并采用自动修正策略：

- 越界坐标自动 clamp 到合法范围
- 返回 warning 信息，说明哪个字段被从什么值调整到了什么值
- 不允许因为单个坐标越界直接导致整次工具调用失败

#### 验收标准

- 支持 `x/y/width/height/radius/from/to` 的边界修正
- 支持 `NaN/null/Infinity` 等异常输入的安全处理
- MCP 响应中包含 warning 文本

---

### R4. DPR / Retina 坐标缩放

系统必须支持 `device_pixel_ratio` 参数，用于将 CSS 逻辑坐标转换为截图物理像素：

- `x/y/width/height/radius/from/to` 参与 DPR 缩放
- `size/fontSize/strokeWidth` 不参与 DPR 缩放
- 缩放必须先于 clamp 执行

#### 验收标准

- `device_pixel_ratio: 2` 时，位置类坐标按 2 倍放大
- 缩放后的越界数据仍会被 clamp 并返回 warning
- `create_step_guide` 文档中保留当前固定偏移的已知限制说明

---

### R5. 响应式尺寸策略升级

系统必须将自动尺寸策略从“仅按宽度”升级为“宽度 + 长宽比联合判断”：

- 保留现有宽度分档逻辑
- 对极窄长图提升一个尺寸档位
- 对极宽图降低一个尺寸档位
- 保持对旧调用方式的向后兼容

#### 验收标准

- `500x5000` 这类长图不能继续被判成过小尺寸
- `1920x1080` 保持原有预期档位
- `getSizePreset(width)` 旧用法仍然可用

---

### R6. SVG 优化链路

系统必须在 SVG 叠加前增加安全的优化步骤：

- 使用 `svgo` 优化生成的 SVG
- 必须关闭 `cleanupIds`，防止 gradient / filter 引用失效
- 优化失败时必须回退到原始 SVG，而不是中断流程

#### 验收标准

- 优化后 SVG 尺寸小于优化前
- `url(#id)` 引用保持可用
- 非法输入不会导致工具崩溃

---

### R7. 输出格式控制

系统必须支持多种输出格式：

- `png`
- `jpeg`
- `webp`
- `avif`

同时需要满足：

- 根据 `output_format` 显式选择 sharp 输出方法
- 当 `output_path` 后缀与目标格式冲突时自动修正后缀
- AVIF 必须限制 `effort <= 1`
- JPEG 输出必须在响应中提示透明区域不会被保留

#### 验收标准

- WebP 输出真实可用
- `.png` 路径请求 `webp` 时，输出文件实际后缀为 `.webp`
- 默认未指定时仍兼容原有 PNG 行为

---

### R8. 画布扩展能力

系统必须支持 `canvas_padding`，在原图外扩展留白区域：

- 支持数值型统一 padding
- 支持 `{top,right,bottom,left}` 对象型 padding
- 标注坐标必须自动偏移到新画布坐标系
- 画布扩展应发生在合成前

#### 验收标准

- `100x100` 图像在 `padding=50` 下输出 `200x200`
- `padding=0` 时保持原行为不变
- 非均匀 padding 能正确扩展宽高

---

### R9. Alt Text 能力

系统必须为标注结果生成基于元数据的辅助描述文本：

- 输出中包含可读的 `Alt-text:` 文本
- 响应对象中附带 `alt_text` 字段
- 文本内容按标注类型聚合，并保留 label/callout 文本信息
- 空标注场景返回通用描述

#### 验收标准

- 混合标注集合能生成结构化说明
- 空标注时返回 “Image (WxH) with no annotations”

---

### R10. 测试与验收基线

系统必须建立可回归验证的测试体系：

- SVG snapshot 测试
- 输出格式测试
- DPR / clamp / padding / alt-text 单元测试
- 至少 1 个集成测试覆盖完整管线
- `annotate.js` 行覆盖率达到 80% 以上

#### 验收标准

- 全量测试通过
- 快照测试通过
- 集成测试通过
- `annotate.js` 覆盖率达标

---

## 5. 非功能需求

### 5.1 稳定性

- 工具调用不能因单个越界坐标崩溃
- SVG 优化失败不能影响最终输出
- 输出格式切换不能破坏原有 PNG 默认行为

### 5.2 可维护性

- 核心能力必须通过 Jest 测试覆盖
- 关键算法必须以可导出函数形式存在，便于单测

### 5.3 可扩展性

- 后续可继续扩展 OCR、自动脱敏、智能布局等能力
- 当前实现不得引入对视觉大模型的强依赖

### 5.4 Agent 友好性

- schema 约束必须降低模型参数幻觉概率
- 响应必须为模型提供错误纠正或 warning 反馈

---

## 6. 已知限制

以下限制在本阶段保留，作为 Phase 2 输入：

1. `create_step_guide` 的内置 label 偏移仍是固定像素，不完全 DPR 自适应
2. `preview/renderer.js` 未同步本阶段实现
3. 未引入 OCR、SAM2、自动目标识别等智能能力
4. 未实现智能避让、碰撞检测与自动布局
5. Alt text 基于标注元数据，不基于图像理解模型

---

## 7. 验收结果基线

当前实现已形成如下基线：

- MCP 工具收敛为 4 个
- 全量测试通过
- 快照测试通过
- `annotate.js` 覆盖率达到 80%+
- WebP 输出体积小于 PNG 的验证证据已生成
- DPR、Padding、Clamp、SVGO、Alt Text 均已落地

后续新需求应基于本文件继续扩展，而不是回退到分析报告中的原始假设。

---

## 8. 参考文档

- `docs/analysis/图像标注工具优化需求报告.md`
- `.sisyphus/plans/phase1-core-improvements.md`
- `docs/plans/REQUIREMENTS.md`
