# R3: 标注碰撞检测与智能排版

## 文档信息

- **项目**: image-annotator-mcp
- **需求编号**: R3（含 R3.1 碰撞检测 + R3.2 自动重排）
- **所属阶段**: Phase 2 / P1（R3.1）/ P3（R3.2）
- **创建日期**: 2026-03-16
- **状态**: 待开发
- **估计工作量**: M（R3.1）/ L（R3.2，可选）

---

## 1. 问题描述

当多个标注密集分布时，callout / label 的文字气泡容易相互重叠或压盖底层 UI 元素。AI Agent 在参数生成阶段无法感知最终渲染后的空间占用，只能凭估计给出坐标，导致复杂标注场景下输出质量不稳定。

---

## 2. 范围

**R3.1（必做）**：碰撞检测 + Warning 反馈。检测并上报重叠，由 Agent 自行决策是否调整坐标。

**R3.2（可选）**：自动排版重排。检测到碰撞后，系统自动将重叠元素推向空白区域。R3.2 依赖 R3.1 先完成。

---

## 3. R3.1：碰撞检测与 Warning 反馈

### 3.1.1 实现思路

在 `annotate.js` 的 `annotateImage()` 流程中，坐标 clamp 完成后、`buildSvg()` 调用前，插入碰撞检测步骤：

```
metadata → DPR 缩放 → clamp → 碰撞检测 → buildSvg → SVGO → sharp composite
```

### 3.1.2 包围盒计算

为每种 annotation 类型实现 `getBoundingBox(annotation, sizePreset)` 函数，返回 `{x, y, width, height}`：

| 类型 | 包围盒定义 |
|------|-----------|
| `marker` | 以 (x, y) 为圆心，`markerSize / 2` 为半径的矩形 |
| `callout` | 估算文字行数和宽度，矩形包围盒 |
| `label` | 估算文字宽度，矩形包围盒 |
| `rect` | 直接使用 (x, y, width, height) |
| `highlight` | 直接使用 (x, y, width, height) |
| `blur` | 直接使用 (x, y, width, height) |
| `circle` | 以 (x, y) 为圆心，radius 为半径的矩形 |
| `arrow` / `curved-arrow` / `connector` | 以 from/to 端点为角的矩形（不参与碰撞） |
| `icon` | 以 (x, y) 为中心，固定 size 的矩形 |

### 3.1.3 碰撞检测逻辑

AABB 相交检测：

```javascript
function boxesOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function detectCollisions(annotations, sizePreset) {
  const collisions = [];
  const boxes = annotations.map((ann, i) => ({ index: i, box: getBoundingBox(ann, sizePreset) }));

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (!boxes[i].box || !boxes[j].box) continue;
      if (boxesOverlap(boxes[i].box, boxes[j].box)) {
        collisions.push({
          type: 'overlap',
          annotations: [i, j],
          details: `Annotation #${i + 1} (${annotations[i].type}) overlaps with #${j + 1} (${annotations[j].type})`
        });
      }
    }
  }

  return collisions;
}
```

### 3.1.4 集成到 annotateImage()

```javascript
const collisionWarnings = detectCollisions(validAnnotations, sizePreset);
// 合并到 warnings 数组
const allWarnings = [...clampWarnings, ...collisionWarnings];
```

### 3.1.5 MCP 响应中展示碰撞信息

在 `handleAnnotate` 的响应文本中追加碰撞 warning 行：

```
⚠ Overlap: Annotation #2 (callout) overlaps with #3 (label). Consider adjusting coordinates.
```

---

## 4. R3.2：自动排版重排（可选）

### 4.1 触发条件

仅当参数 `auto_layout: true` 时激活，默认关闭（防止破坏现有精确标注的坐标）。

### 4.2 重排策略

简化版排斥向量迭代（非弹簧物理模拟）：

1. 对检测到碰撞的标注对，计算重叠面积中心
2. 将两个标注各自沿反方向推移最小距离以消除重叠
3. 重复检测，最多迭代 20 次
4. 超出迭代限制时停止，保留最终状态并 warning 提示"未能完全消除重叠"

### 4.3 限制

- 重排范围不超过画布边界（包含 canvas_padding 后的扩展边界）
- arrow/connector/curved-arrow 不参与重排（避免箭头指向错误）
- 重排后的坐标变化记录在 warning 中，供调用方审核

---

## 5. 需要修改的文件

| 文件 | 改动 |
|------|------|
| `annotate.js` | 新增 `getBoundingBox()`、`detectCollisions()`，集成到 `annotateImage()` |
| `server.js` | `handleAnnotate` 响应中展示碰撞 warning |
| `annotate.test.js` | 碰撞检测单元测试 |
| `annotate-errors.js` | 可选：新增 `CollisionWarning` 类 |

---

## 6. 验收标准

**R3.1**

- [ ] 两个包围盒重叠的标注产生 `overlap` warning
- [ ] 无重叠的标注不产生误报
- [ ] warning 包含两个标注的索引和描述
- [ ] 碰撞检测不影响最终渲染输出（只是 warning，不修改坐标）
- [ ] `npm test` 全部通过

**R3.2（可选）**

- [ ] `auto_layout: true` 时，重叠标注坐标被自动调整
- [ ] 默认不开启时，行为与 R3.1 完全一致
- [ ] 重排坐标变化记录在 warning 中

---

## 7. 参考

- `docs/plans/2026-03-16-phase2-candidate-requirements.md` — R3
- Phase 1 已知限制 L3
