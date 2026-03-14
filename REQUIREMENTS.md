# 图片标注 MCP 服务器 - 修复需求文档

## 文档信息

- **项目**: image-annotator-mcp
- **版本**: 1.0.0
- **创建日期**: 2026-03-14
- **状态**: 待开发

---

## 目录

1. [概述](#概述)
2. [严重问题 (P0)](#严重问题-p0)
3. [中等问题 (P1)](#中等问题-p1)
4. [轻微问题 (P2)](#轻微问题-p2)
5. [验收标准](#验收标准)

---

## 概述

本文档列出了代码评审中发现的所有问题，并根据严重程度分配了优先级。每个问题都包含问题描述、影响范围和修复建议。

---

## 严重问题 (P0)

### 问题 1: 路径处理跨平台兼容性

**文件**: `server.js`, `README.md`, `README.zh-CN.md`

**问题描述**: 
- README 中的 MCP 配置示例使用 Windows 硬编码路径（如 `D:\IdeaProjects\image-annotator-mcp\server.js`）
- 不同操作系统的路径格式不同，配置无法跨平台使用

**影响范围**: 
- Linux/macOS 用户无法直接使用 README 中的配置
- 用户体验差，需要手动修改路径

**修复建议**:

1. 在 `README.md` 和 `README.zh-CN.md` 中添加跨平台配置示例：
   ```json
   {
     "mcpServers": {
       "image-annotator": {
         "command": "npx",
         "args": ["-y", "image-annotator-mcp"]
       }
     }
   }
   ```

2. 使用 npx 方式作为主要推荐方式（已经是最佳实践）

3. 如果需要本地开发，添加环境变量或相对路径说明

---

### 问题 2: CLI 参数解析脆弱

**文件**: `annotate.js` (第 736-756 行)

**问题描述**:
- 当前使用简单的 `indexOf` 解析参数，无法处理带空格的参数值
- 无法正确处理以下情况：
  - `--annotations '[{"text": "hello world"}]'`
  - `--annotations '[...]' --theme tutorial`（annotations 后紧跟其他 flag）

**影响范围**:
- 包含空格的文本annotation无法通过CLI正确传递
- 参数顺序敏感，容易出错

**修复建议**:

1. 添加 `minimist` 依赖（轻量级，~1KB）:
   ```bash
   npm install minimist
   ```

2. 重构 CLI 参数解析:
   ```javascript
   const args = require('minimist')(process.argv.slice(2));
   
   // 使用方式变为:
   // node annotate.js input.png output.png --annotations='[{"type":"marker","x":100}]' --theme=tutorial
   // 或
   // node annotate.js input.png output.png --annotations '[{"type":"marker","x":100}]' --theme tutorial
   ```

3. 添加参数验证和错误提示

---

### 问题 3: 错误处理不完善

**文件**: `annotate.js`, `server.js`

**问题描述**:
- 所有错误都使用通用的 `throw new Error()`
- 调用方无法区分错误类型，难以精确处理

**影响范围**:
- MCP 客户端无法根据错误类型做不同处理
- 调试困难

**修复建议**:

1. 创建自定义错误类:
   ```javascript
   // annotate-errors.js
   class AnnotationError extends Error {
     constructor(message, code = 'ANNOTATION_ERROR') {
       super(message);
       this.code = code;
     }
   }
   
   class FileNotFoundError extends AnnotationError {
     constructor(filePath) {
       super(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
       this.filePath = filePath;
     }
   }
   
   class InvalidParameterError extends AnnotationError {
     constructor(message, param) {
       super(message, 'INVALID_PARAMETER');
       this.param = param;
     }
   }
   
   class ImageProcessingError extends AnnotationError {
     constructor(message, originalError) {
       super(message, 'IMAGE_PROCESSING_ERROR');
       this.originalError = originalError;
     }
   }
   
   module.exports = {
     AnnotationError,
     FileNotFoundError,
     InvalidParameterError,
     ImageProcessingError
   };
   ```

2. 在 `server.js` 中根据错误类型返回不同的响应格式:
   ```javascript
   catch (error) {
     if (error instanceof FileNotFoundError) {
       return { content: [...], isError: true, errorCode: error.code };
     }
     // ...
   }
   ```

---

## 中等问题 (P1)

### 问题 4: 全局状态 ID 计数器

**文件**: `annotate.js` (第 103-106 行)

**问题描述**:
```javascript
let idCounter = 0;
function generateId(prefix = 'ann') {
  return `${prefix}-${++idCounter}`;
}
```
- `idCounter` 是模块级全局变量
- `buildSvg` 函数中重置计数器，但并发调用时可能导致 ID 冲突

**影响范围**:
- 理论上存在 ID 冲突风险（实际概率较低）

**修复建议**:

1. 使用 UUID 替代自增 ID:
   ```javascript
   const crypto = require('crypto');
   
   function generateId(prefix = 'ann') {
     const randomPart = crypto.randomBytes(4).toString('hex');
     return `${prefix}-${randomPart}`;
   }
   ```

2. 或使用时间戳+随机数:
   ```javascript
   function generateId(prefix = 'ann') {
     const timestamp = Date.now().toString(36);
     const random = Math.random().toString(36).substring(2, 6);
     return `${prefix}-${timestamp}-${random}`;
   }
   ```

---

### 问题 5: 字体回退机制不可靠

**文件**: `annotate.js` (第 17-18 行)

**问题描述**:
```javascript
const HANDWRITING_FONT = "Comic Sans MS, Marker Felt, Bradley Hand, cursive";
const CLEAN_FONT = "Arial, Helvetica, sans-serif";
```
- 依赖系统字体，不同平台表现不一致
- `Comic Sans MS` 在某些系统可能不存在

**影响范围**:
- 跨平台使用时字体显示不一致

**修复建议**:

1. 使用更可靠的 Web Safe Fonts:
   ```javascript
   // 手写风格字体（按优先级排序）
   const HANDWRITING_FONT = "Comic Sans MS, Chalkboard SE, Patrick Hand, cursive";
   
   // 清晰无衬线字体
   const CLEAN_FONT = "Segoe UI, Helvetica Neue, Arial, sans-serif";
   ```

2. 或者考虑嵌入字体（增加包体积，但保证一致性）

---

### 问题 6: 内存处理大图片

**文件**: `annotate.js` (第 644-651 行)

**问题描述**:
```javascript
await sharp(inputPath)
  .composite([{
    input: Buffer.from(svg),
    top: 0,
    left: 0
  }])
  .toFile(outputPath);
```
- `Buffer.from(svg)` 在大图片时占用大量内存
- 4K+ 分辨率图片可能触发内存问题

**影响范围**:
- 处理超大图片时可能内存溢出

**修复建议**:

1. 使用流式处理替代 Buffer:
   ```javascript
   const { pipeline } = require('stream/promises');
   const { PassThrough } = require('stream');
   
   async function annotateImage(inputPath, outputPath, annotations, options = {}) {
     // ... 验证代码 ...
     
     // 创建 SVG 流
     const svgStream = new PassThrough();
     svgStream.end(Buffer.from(svg));
     
     // 使用 pipeline 流式处理
     const input = sharp(inputPath);
     const metadata = await input.metadata();
     
     await pipeline(
       input.clone().composite([{ input: svgStream }]),
       sharp().toFile(outputPath)
     );
     
     // ...
   }
   ```

2. 添加图片大小检查和警告

---

## 轻微问题 (P2)

### 问题 7: 未使用的参数

**文件**: `annotate.js` (第 271 行)

**问题描述**:
```javascript
function createCallout({ x, y, text, color = 'primary', background = 'white', width = null, pointer = 'bottom', fontSize = 18, shadow = true, handwriting = true }) {
```
`width` 参数声明但被 `textWidth` 计算覆盖。

**修复建议**:
如果 `width` 参数有意设计为允许用户指定固定宽度，应保留；如果不需要，移除该参数以避免混淆。

---

### 问题 8: Magic Numbers

**文件**: `annotate.js` (多处)

**问题描述**:
```javascript
const textWidth = width || Math.max(...lines.map(l => l.length * fontSize * 0.65)) + padding * 2;
```
`0.65` 是经验值，缺少说明。

**修复建议**:

添加常量定义:
```javascript
// 文字宽度估算系数（基于平均字符宽度/字体大小比）
const TEXT_WIDTH_RATIO = 0.65;

// 默认内边距
const DEFAULT_PADDING = 14;

// 默认行高系数
const LINE_HEIGHT_RATIO = 1.5;
```

---

### 问题 9: 缺少输入验证

**文件**: `annotate.js`

**问题描述**:
- 缺少对负数坐标的校验
- 缺少对超出图片边界坐标的校验

**修复建议**:

添加验证函数:
```javascript
/**
 * 验证坐标是否在图片范围内
 */
function validateCoordinates(x, y, width, height, imageWidth, imageHeight) {
  if (x < 0 || y < 0) {
    throw new InvalidParameterError('Coordinates cannot be negative', 'coordinates');
  }
  if (x > imageWidth || y > imageHeight) {
    throw new InvalidParameterError(
      `Coordinates (${x}, ${y}) exceed image bounds (${imageWidth}x${imageHeight})`,
      'coordinates'
    );
  }
  return true;
}
```

---

## 验收标准

### P0 问题（必须修复）

- [ ] **问题1**: README 文档包含跨平台配置示例（npx 方式）
- [ ] **问题2**: CLI 支持带空格的参数值（如文本中包含空格）
- [ ] **问题3**: 实现自定义错误类，server.js 能区分错误类型

### P1 问题（应该修复）

- [ ] **问题4**: 使用 UUID 或时间戳+随机数替代全局 ID 计数器
- [ ] **问题5**: 更新字体回退列表，使用更可靠的 Web Safe Fonts
- [ ] **问题6**: 对超大图片（> 4K）添加内存处理优化或警告

### P2 问题（建议修复）

- [ ] **问题7**: 清理未使用的 `width` 参数或明确其用途
- [ ] **问题8**: 提取 Magic Numbers 为命名常量
- [ ] **问题9**: 添加坐标和参数范围验证

---

## 修复优先级建议

1. **第一阶段（P0）**: 修复 CLI 参数解析和错误处理，这两个直接影响用户体验
2. **第二阶段（P1）**: 修复全局状态和字体问题，提升稳定性
3. **第三阶段（P2）**: 清理代码，提升可维护性

---

## 技术债务

- 当前使用原生 Node.js 参数解析，建议评估是否需要引入 commander.js 或 yargs 等成熟 CLI 框架
- 缺少单元测试，建议添加 Jest 测试覆盖核心功能
- 可以考虑添加 TypeScript 支持，提升类型安全
