# R6: 简化版截图标注自动跟随（reannotate_screenshot）

## 文档信息

- **项目**: image-annotator-mcp
- **需求编号**: R6
- **所属阶段**: Phase 2 / P2
- **创建日期**: 2026-03-16
- **状态**: 待开发
- **估计工作量**: M（3 ~ 5 天）

---

## 1. 问题描述

UI 版本迭代后，已有的标注配置（坐标、标注描述）会因界面变化而"飘移"到错误位置，例如：

- 某按钮从页面右上角移到左侧导航栏
- 某表单向下移动了 100px
- 某功能入口完全消失

在这种情况下，原有的 `annotations` 坐标已经失效，需要重新标注。当前工作流需要调用方（AI Agent）完全重新推理坐标，成本高且容易出错。

**目标**：提供 `reannotate_screenshot` 工具，帮助 AI Agent 快速定位哪些标注需要更新，降低重标注成本。

---

## 2. 方案边界说明

分析报告原始方案（基于 SIFT / 稠密特征匹配的自动坐标迁移）在 Node.js 生态中缺乏成熟实现，本需求采用**简化方案**：

- 工具**不做**自动特征匹配和坐标迁移
- 工具**只做**结构化的"新旧截图对比 + 建议"，将最终坐标更新决策交给 AI Agent
- 坐标验证依赖外部工具（如 Playwright），工具本身不内嵌 DOM 探测

---

## 3. 工具定义

### 3.1 工具名

`reannotate_screenshot`

### 3.2 输入参数

```json
{
  "old_screenshot_path": "旧版截图路径（已有标注的原图）",
  "new_screenshot_path": "新版截图路径（未标注的新图）",
  "annotations": "原有标注配置数组（与 annotate_screenshot 格式相同）",
  "output_path": "可选，输出路径（不提供则只返回分析结果，不生成图片）"
}
```

### 3.3 处理流程

```
1. 读取新旧两张图的尺寸
2. 比较尺寸差异（分辨率是否变化）
3. 对每个 annotation 进行基础可用性判断：
   - 坐标是否仍在新图范围内（clamp 检查）
   - 坐标是否极度越界（超出 10% 以上）
4. 返回结构化建议
5. 若提供 output_path 且调用方确认坐标：
   - 将原始坐标直接在新图上渲染（无修改）
   - 返回输出路径
```

### 3.4 返回结果

```json
{
  "size_changed": false,
  "old_size": { "width": 1920, "height": 1080 },
  "new_size": { "width": 1920, "height": 1080 },
  "annotations_status": [
    {
      "index": 0,
      "type": "marker",
      "status": "ok",
      "note": "Coordinate (100, 200) is within new image bounds."
    },
    {
      "index": 1,
      "type": "callout",
      "status": "warning",
      "note": "Coordinate (1850, 50) is near the boundary of the new image. Verify the target element is still in this position."
    },
    {
      "index": 2,
      "type": "arrow",
      "status": "out_of_bounds",
      "note": "Arrow endpoint to[0]=2100 exceeds new image width 1920. This annotation likely needs repositioning."
    }
  ],
  "recommendation": "2 annotations may need repositioning. Use get_image_dimensions and Playwright to verify element positions in the new screenshot before re-annotating."
}
```

### 3.5 Status 枚举

| Status | 含义 |
|--------|------|
| `ok` | 坐标在新图范围内，大概率可用 |
| `warning` | 坐标有效但接近边界，建议确认 |
| `out_of_bounds` | 坐标完全越界，需要重新定位 |

---

## 4. 设计原则

- **不修改坐标**：工具不自动调整任何坐标，只提供分析结果
- **透明建议**：所有 warning 和 out_of_bounds 都附带人类可读的说明
- **可选渲染**：`output_path` 是可选的，调用方可以先看分析结果再决定是否渲染

---

## 5. 需要修改的文件

| 文件 | 改动 |
|------|------|
| `server.js` | 新增 `reannotate_screenshot` 工具定义和 `handleReannotate` 函数 |
| `server.test.js` | 新增工具调用测试 |

---

## 6. 验收标准

- [ ] `reannotate_screenshot` 出现在 ListTools（工具数量变为 5）
- [ ] 返回每个 annotation 的 status（ok / warning / out_of_bounds）
- [ ] 返回 recommendation 建议文本
- [ ] 不自动修改任何坐标
- [ ] 仅提供 `output_path` 且所有 annotation 状态为 ok 时，输出图片
- [ ] `npm test` 全部通过

---

## 7. 后续扩展（Phase 3 候选）

当 Node.js 生态中出现成熟的视觉特征匹配库时，可以在 R6 基础上扩展：

- 对旧图和新图进行特征点提取（SIFT / ORB）
- 计算变换矩阵，自动建议新坐标
- 调用方可以选择接受建议坐标或手动修改

---

## 8. 参考

- `docs/plans/2026-03-16-phase2-candidate-requirements.md` — R6
- 分析报告第五章：文档维护顽疾与视觉溯源
