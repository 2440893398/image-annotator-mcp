# 图片标注 MCP 服务器 - 单元测试开发计划

## 文档信息

- **项目**: image-annotator-mcp
- **版本**: 1.0.0
- **创建日期**: 2026-03-14
- **状态**: 待开发
- **关联需求**: `docs/plans/2026-03-14-code-review-fixes.md` 技术债务 - 单元测试

---

## 目录

1. [概述](#概述)
2. [开发阶段](#开发阶段)
3. [任务拆分](#任务拆分)
4. [里程碑](#里程碑)
5. [风险与依赖](#风险与依赖)

---

## 概述

基于代码评审修复需求文档中的技术债务，为 `image-annotator-mcp` 项目添加完整的 Jest 单元测试覆盖。

**目标**:
- 核心函数测试覆盖率 > 85%
- 所有导出的函数都有对应的测试用例
- 确保重构和后续功能开发的安全性

---

## 开发阶段

### 阶段 1: 测试基础设施搭建

**预计时间**: 30 分钟

| 任务 | 描述 |
|------|------|
| T1.1 | 安装 Jest 依赖 (`npm install --save-dev jest`) |
| T1.2 | 创建 `tests/` 目录 |
| T1.3 | 配置 `jest.config.js` 或在 `package.json` 添加 jest 配置 |
| T1.4 | 创建测试工具函数 `tests/setup.js` (如需要) |
| T1.5 | 创建 `tests/__fixtures__/` 目录结构 |
| T1.6 | 验证测试环境 (`npm test` 验证空测试通过) |

### 阶段 2: 工具函数与常量测试

**预计时间**: 1 小时

| 任务 | 描述 |
|------|------|
| T2.1 | 测试 `escapeXml()` - XML 转义字符处理 |
| T2.2 | 测试 `getColor()` - 颜色名称转 HEX |
| T2.3 | 测试 `adjustColor()` - 颜色亮度调整 |
| T2.4 | 测试 `generateId()` - ID 生成器 |
| T2.5 | 测试 `createDropShadow()` - 阴影滤镜生成 |
| T2.6 | 测试 `COLORS` 常量 - 所有颜色都是有效 HEX |
| T2.7 | 测试 `THEMES` 常量 - 主题结构完整性 |

### 阶段 3: SVG 元素创建函数测试

**预计时间**: 2-3 小时

| 任务 | 描述 |
|------|------|
| T3.1 | 测试 `createMarker()` - 数字标记 (filled/outline/badge 样式) |
| T3.2 | 测试 `createArrow()` - 直线箭头 |
| T3.3 | 测试 `createCurvedArrow()` - 曲线箭头 |
| T3.4 | 测试 `createCallout()` - 文本标注框 (4种指针位置) |
| T3.5 | 测试 `createRect()` - 矩形 (填充/描边/虚线) |
| T3.6 | 测试 `createCircle()` - 圆形 |
| T3.7 | 测试 `createLabel()` - 文本标签 |
| T3.8 | 测试 `createHighlight()` - 高亮覆盖层 |
| T3.9 | 测试 `createBlur()` - 模糊效果 |
| T3.10 | 测试 `createConnector()` - 连接线 |
| T3.11 | 测试 `createIcon()` - 图标徽章 (5种类型) |

### 阶段 4: 核心函数测试

**预计时间**: 1-2 小时

| 任务 | 描述 |
|------|------|
| T4.1 | 测试 `buildSvg()` - 空注释数组 |
| T4.2 | 测试 `buildSvg()` - 单个注释 |
| T4.3 | 测试 `buildSvg()` - 多个注释组合 |
| T4.4 | 测试 `buildSvg()` - 主题应用 (4种主题) |
| T4.5 | 测试 `buildSvg()` - 主题合并逻辑 |
| T4.6 | 测试 `buildSvg()` - 未知类型警告 |
| T4.7 | 测试 `annotateImage()` - 文件不存在错误 |
| T4.8 | 测试 `annotateImage()` - 成功处理图片 |
| T4.9 | 测试 `annotateImage()` - 无注释处理 |

### 阶段 5: 集成与 CI 配置

**预计时间**: 30 分钟

| 任务 | 描述 |
|------|------|
| T5.1 | 配置 `npm test` 脚本 |
| T5.2 | 配置 `npm run test:coverage` 覆盖率报告 |
| T5.3 | 添加 GitHub Actions CI 配置 (可选) |
| T5.4 | 生成并检查覆盖率报告 |
| T5.5 | 修复未通过的测试用例 |

---

## 任务拆分

### Sprint 1: 基础设施 + 工具函数 (P0)

```
├── T1.1 安装 Jest
├── T1.2 创建目录结构
├── T1.3 Jest 配置
├── T2.1 escapeXml 测试
├── T2.2 getColor 测试
├── T2.3 adjustColor 测试
├── T2.4 generateId 测试
├── T2.5 createDropShadow 测试
├── T2.6 COLORS 测试
└── T2.7 THEMES 测试
```

### Sprint 2: SVG 元素函数 (P1)

```
├── T3.1 createMarker 测试
├── T3.2 createArrow 测试
├── T3.3 createCurvedArrow 测试
├── T3.4 createCallout 测试
├── T3.5 createRect 测试
├── T3.6 createCircle 测试
├── T3.7 createLabel 测试
├── T3.8 createHighlight 测试
├── T3.9 createBlur 测试
├── T3.10 createConnector 测试
└── T3.11 createIcon 测试
```

### Sprint 3: 核心函数 + 集成 (P2)

```
├── T4.1-T4.6 buildSvg 测试
├── T4.7-T4.9 annotateImage 测试
├── T5.1-T5.2 脚本配置
└── T5.3-T5.5 CI 与覆盖率
```

---

## 里程碑

| 里程碑 | 完成条件 | 预计时间 |
|--------|----------|----------|
| M1: 测试就绪 | Jest 配置完成，空测试通过 | 30 分钟 |
| M2: 工具函数测试完成 | 所有工具函数和常量测试通过 | 1 小时 |
| M3: SVG 元素测试完成 | 所有 11 个元素创建函数测试通过 | 2-3 小时 |
| M4: 核心函数测试完成 | buildSvg 和 annotateImage 测试通过 | 1-2 小时 |
| M5: 测试上线 | npm test 通过，生成覆盖率报告 | 30 分钟 |

**总预计时间**: 5-7 小时

---

## 风险与依赖

### 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| sharp 依赖需要实际图片文件 | 测试需要 I/O 操作 | 使用 mocks 或小测试图片 |
| SVG 输出格式变化 | 快照测试可能失败 | 使用正则匹配关键元素而非完整比较 |
| 并发 ID 生成 | 极端情况下 ID 可能冲突 | 测试唯一性而非顺序 |

### 依赖

- Node.js >= 18.0.0
- Jest ^29.0.0
- sharp (已存在)

### 测试策略

1. **单元测试**: 每个函数独立测试，使用 mocks 隔离依赖
2. **快照测试**: 对于 SVG 输出，使用正则表达式验证关键元素
3. **集成测试**: annotateImage 需要实际文件，使用临时目录
4. **覆盖率目标**: 
   - 语句覆盖 > 85%
   - 分支覆盖 > 70%
   - 函数覆盖 100%

---

## 验收标准

- [ ] `npm test` 运行成功，无失败用例
- [ ] 测试覆盖率报告生成
- [ ] 核心函数 (buildSvg, annotateImage) 覆盖率 100%
- [ ] 所有导出函数都有测试用例
- [ ] 测试文件结构符合规范

---

## 后续计划

完成单元测试后，可考虑:

1. **类型安全**: 添加 TypeScript 支持
2. **E2E 测试**: 使用 Playwright 进行端到端测试
3. **性能测试**: 大图片处理性能基准测试
