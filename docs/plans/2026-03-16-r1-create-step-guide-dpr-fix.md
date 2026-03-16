# R1: create_step_guide DPR 自适应修复

## 文档信息

- **项目**: image-annotator-mcp
- **需求编号**: R1
- **所属阶段**: Phase 2 / P0（遗留修复）
- **创建日期**: 2026-03-16
- **状态**: 待开发
- **估计工作量**: S（半天 ~ 1 天）

---

## 1. 问题描述

`create_step_guide` 工具在处理高分屏截图时存在排版错位问题。

具体场景：当调用方传入 `device_pixel_ratio: 2`，工具会把步骤坐标乘以 2 后正确映射到物理像素，但 `handleStepGuide` 中的几何偏移常量（label 偏移、箭头起止点距离）是硬编码的固定像素值，**不参与 DPR 缩放**。

```javascript
// server.js handleStepGuide 中当前的硬编码偏移
const labelX = step.x + 50;         // 固定 50px
const labelY = step.y;
annotations.push({
  type: 'arrow',
  from: [step.x + 28, step.y],      // 固定 28px
  to: [labelX - 5, labelY],
  ...
});
annotations.push({
  type: 'connector',
  from: [step.x, step.y + 30],      // 固定 30px
  to: [next.x, next.y - 30],
  ...
});
```

在 DPR=2 的情况下，marker 已经被缩放到正确位置，但 label 仍然只偏移了 50 CSS 像素而不是 100 物理像素，造成视觉上 label 紧贴或压盖在 marker 上。

---

## 2. 影响范围

- 文件：`server.js`，函数 `handleStepGuide`
- 工具：`create_step_guide`
- 不影响 `annotate_screenshot`（坐标完全由调用方控制）

---

## 3. 修复方案

### 方案 A：固定偏移跟随 DPR 缩放（推荐）

在 `handleStepGuide` 内，将所有几何偏移值乘以 `device_pixel_ratio`：

```javascript
async function handleStepGuide(args) {
  const { ..., device_pixel_ratio = 1 } = args;
  const dpr = device_pixel_ratio;

  steps.forEach((step, i) => {
    // 乘以 DPR
    const labelOffsetX = Math.round(50 * dpr);
    const markerRadius = Math.round(28 * dpr);
    const connectorOffset = Math.round(30 * dpr);

    const labelX = step.x + labelOffsetX;
    const labelY = step.y;

    annotations.push({
      type: 'arrow',
      from: [step.x + markerRadius, step.y],
      to: [labelX - Math.round(5 * dpr), labelY],
      ...
    });

    if (connect_steps && i < steps.length - 1) {
      annotations.push({
        type: 'connector',
        from: [step.x, step.y + connectorOffset],
        to: [next.x, next.y - connectorOffset],
        ...
      });
    }
  });
}
```

注意：`step.x / step.y` 此时已经是调用方传入的 CSS 坐标，后续会由 `annotateImage` 内部的 DPR 缩放逻辑统一乘以 DPR——因此 **`handleStepGuide` 中的偏移值需要手动乘以 DPR，而坐标本身不需要**。

### 方案 B：基于 SIZE_PRESETS 动态推算

从 `getSizePreset` 的 markerSize 推算合理偏移，不依赖固定常量：

```javascript
const { SIZE_PRESETS, getSizePreset } = require('./annotate');
const preset = SIZE_PRESETS[getSizePreset(imageWidth, imageHeight)];
const markerRadius = Math.round(preset.markerSize / 2);
const labelOffsetX = preset.markerSize + 20;
```

方案 B 更语义化，但需要先知道图片尺寸（需调用 `getImageDimensions`），增加一次 I/O。推荐在 Phase 2 后期优化，Phase 2 初期用方案 A 快速修复。

---

## 4. 需要修改的文件

| 文件 | 改动 |
|------|------|
| `server.js` | `handleStepGuide` 中的几何偏移常量乘以 `device_pixel_ratio` |
| `server.test.js` | 添加 DPR=2 时 step guide 坐标验证 |

---

## 5. 不需要修改的文件

- `annotate.js`（DPR 缩放逻辑不变）
- `annotate.test.js`（核心测试不受影响）
- `preview/renderer.js`（预览不涉及 DPR）

---

## 6. 验收标准

- [ ] DPR=2 时，`create_step_guide` 的 label 与 marker 的间距在输出图中视觉等比于 DPR=1
- [ ] DPR=1 或不传 DPR 时，行为与修复前完全一致
- [ ] `npm test` 全部通过
- [ ] `server.test.js` 新增测试：DPR=2 时 `handleStepGuide` 计算出的 label 坐标正确

---

## 7. 参考

- `docs/plans/2026-03-16-phase2-candidate-requirements.md` — R1
- Phase 1 已知限制 L1
