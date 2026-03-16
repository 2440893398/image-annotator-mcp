# R2: preview/renderer.js 与主实现同步

## 文档信息

- **项目**: image-annotator-mcp
- **需求编号**: R2
- **所属阶段**: Phase 2 / P1
- **创建日期**: 2026-03-16
- **状态**: 待开发
- **估计工作量**: M（3 ~ 5 天）

---

## 1. 问题描述

`preview/renderer.js` 是 `annotate.js` 渲染逻辑的约 406 行拷贝，用于配置 UI 的实时预览（浏览器端运行）。

Phase 1 对 `annotate.js` 进行了以下改动，但 `preview/renderer.js` 均未同步：

| Phase 1 改动 | annotate.js | preview/renderer.js |
|-------------|-------------|---------------------|
| 响应式尺寸升级（宽高比算法） | ✅ 已更新 | ❌ 未同步 |
| `getSizePreset(width, height)` 新签名 | ✅ 已更新 | ❌ 未同步 |
| 11 种 annotation 类型 snapshot 基线 | ✅ 已建立 | ❌ 无对应 |
| SVGO 优化（不适用于预览） | ✅ 管线中 | — 不需要 |
| `generateAltText()` | ✅ 已实现 | — 不需要 |

当用户在配置 UI 的预览页面看到的渲染效果，与 `annotate_screenshot` 实际输出的效果存在差异，降低配置体验的可信度。

---

## 2. 适用范围

- 文件：`preview/renderer.js`
- 影响：配置 UI 预览页面的渲染输出
- 不影响：MCP 工具调用路径、测试套件

---

## 3. 修复方案

### 方案 A：共享核心逻辑（推荐，长期）

将两者共有的渲染函数提取为 `annotate-core.js`（或 `render-core.js`），在 Node.js 和浏览器两端均可引用。

```
annotate-core.js
├── buildSvg()
├── getSizePreset()
├── SIZE_PRESETS
├── COLORS / THEMES / THEME_FONTS
├── create*() 渲染函数（createMarker, createArrow 等）
└── generateId()（注入式）

annotate.js
├── require('./annotate-core')
├── annotateImage()         ← Node.js 专用（sharp、文件 I/O）
├── clampAnnotations()
├── optimizeSvg()
└── generateAltText()

preview/renderer.js
├── require('./annotate-core') 或 import 同等 bundle
└── 浏览器端专用逻辑（DOM 渲染、实时更新）
```

优势：完全消除重复代码，后续改动只需改一处。

挑战：需要确认 `preview/renderer.js` 的浏览器运行环境是否支持 Node.js `require`（如果是 bundle 构建，需要调整构建配置）。

### 方案 B：人工同步（快速修复，短期）

不做重构，仅将 Phase 1 相关改动手工补入 `preview/renderer.js`：

1. 将 `getSizePreset(imageWidth)` 改为 `getSizePreset(imageWidth, imageHeight)`
2. 在函数体内加入宽高比判断逻辑（同 `annotate.js`）
3. 验证所有 `create*()` 函数的渲染结果与 `annotate.js` 的 snapshot 一致

方案 B 工作量约为 1 天，可作为过渡；方案 A 作为后续重构目标。

---

## 4. 验收标准

**方案 B（最低要求）**

- [ ] `preview/renderer.js` 中的 `getSizePreset` 使用宽高比算法
- [ ] 预览页对 500×5000 长图使用更大的尺寸档位
- [ ] 对同一参数集合，预览渲染的标注类型、颜色与 `annotate.js` snapshot 视觉一致

**方案 A（追加要求）**

- [ ] `annotate-core.js` 导出所有渲染相关函数
- [ ] `annotate.js` 和 `preview/renderer.js` 均从 `annotate-core.js` 导入
- [ ] `buildSvg` 的单元测试只需在 `annotate-core` 级别维护一份
- [ ] `npm test` 全部通过

---

## 5. 注意事项

- `SVGO` 只在 Node.js 后端需要，不应引入 `preview/renderer.js`
- `generateAltText` 仅供 MCP 响应，预览不需要
- 修复完成后若后续实施 R4（Text-to-Path），需再次同步 `preview/renderer.js`

---

## 6. 参考

- `docs/plans/2026-03-16-phase2-candidate-requirements.md` — R2
- Phase 1 已知限制 L2
- `preview/renderer.js` — 当前约 406 行
