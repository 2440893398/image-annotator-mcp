# R7: 基于正则的隐私脱敏（auto_redact）

## 文档信息

- **项目**: image-annotator-mcp
- **需求编号**: R7
- **所属阶段**: Phase 2 / P2
- **创建日期**: 2026-03-16
- **状态**: 待开发
- **估计工作量**: S（1 ~ 2 天，正则版）/ L（3 ~ 5 天，OCR 版）

---

## 1. 问题描述

技术文档截图中经常包含敏感信息：

- 邮箱地址、用户名
- API Key / Token / 密码
- 信用卡号、身份证号
- 数据库连接字符串
- 生产环境 URL / IP 地址

目前工作流需要 AI Agent 逐一判断哪些区域需要 blur，再传入 blur 类型的 annotation，流程繁琐且容易遗漏。

---

## 2. 方案设计

本需求分两个实施阶段：

### Phase 2：正则版（不含 OCR）

- 对 annotation 中已有的文字内容（callout text、label text）进行正则扫描
- 匹配到敏感模式时，自动在该标注的文字区域上叠加 blur 遮蔽
- 依赖**已有文字标注的坐标**，不扫描截图底图中的未标注文字

### Phase 3 候选：OCR 版

- 引入 `tesseract.js` 对截图底图全屏 OCR
- 对识别到的文字使用正则匹配
- 自动生成 blur annotation 覆盖匹配区域

---

## 3. 正则版（Phase 2）详细设计

### 3.1 新增参数

在 `annotate_screenshot` 和 `create_step_guide` 的 inputSchema 中添加可选参数：

```json
"redact_patterns": {
  "type": "array",
  "description": "正则表达式字符串数组，匹配 callout/label 文字中的敏感内容后自动生成 blur 标注。示例：[\"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\"] 匹配邮箱",
  "items": { "type": "string" }
},
"auto_redact": {
  "type": "boolean",
  "description": "开启后自动使用内置规则脱敏（邮箱、API Key、信用卡号等），不需要提供 redact_patterns",
  "default": false
}
```

### 3.2 内置规则集

当 `auto_redact: true` 时启用内置规则：

```javascript
const BUILTIN_REDACT_PATTERNS = [
  // 邮箱
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // API Key / Token（通用格式：字母数字+特殊字符，20位以上）
  /[A-Za-z0-9_\-]{20,}/g,
  // 信用卡号
  /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
  // 中国手机号
  /1[3-9]\d{9}/g,
  // IP 地址
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  // URL 中的 token/key 参数
  /(?:token|key|secret|password|pwd|api_key)=[^\s&"']+/gi,
];
```

### 3.3 处理流程

在 `annotateImage()` 的标注处理阶段，`clampAnnotations` 后插入脱敏检测：

```javascript
function detectSensitiveInAnnotations(annotations, patterns) {
  const redactAnnotations = [];

  for (const ann of annotations) {
    const text = ann.text || '';
    if (!text) continue;

    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'g');
      let match;
      while ((match = regex.exec(text)) !== null) {
        // 找到匹配内容，根据 annotation 的包围盒位置生成 blur
        const bbox = getBoundingBox(ann, sizePreset);
        if (bbox) {
          redactAnnotations.push({
            type: 'blur',
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            intensity: 10
          });
        }
        break; // 一个 annotation 只生成一个 blur
      }
    }
  }

  return redactAnnotations;
}
```

脱敏生成的 blur annotation 自动追加到 annotations 末尾。

### 3.4 返回信息

在 MCP 响应中说明脱敏动作：

```
✓ Annotated screenshot saved: result.png
  Size: 1920×1080 | Annotations: 5
  Redacted: 2 annotation(s) automatically blurred based on pattern matching.
```

---

## 4. OCR 版（Phase 3 候选，不在本期实施）

OCR 版本的设计要点（供后续参考）：

1. 引入 `tesseract.js`（lazy load，首次使用时初始化）
2. 在 `annotateImage()` 处理前，对底图进行全屏 OCR
3. 获取 word-level 的文字坐标和内容
4. 对每个 word 应用正则规则
5. 匹配到的 word 坐标生成 blur annotation
6. OCR 初始化约需 3~15 秒（首次），后续调用约 0.5~2 秒

---

## 5. 需要修改的文件

**正则版**

| 文件 | 改动 |
|------|------|
| `server.js` | inputSchema 添加 `redact_patterns` 和 `auto_redact` 参数；handler 传参 |
| `annotate.js` | 新增 `detectSensitiveInAnnotations()`，集成到 `annotateImage()` |
| `annotate.test.js` | 新增脱敏测试（邮箱匹配、API key 匹配、空 text 无误报） |

---

## 6. 验收标准

**正则版**

- [ ] `auto_redact: true` 时，label/callout 中的邮箱地址被 blur 覆盖
- [ ] 自定义 `redact_patterns` 可正确匹配并 blur
- [ ] 文字中无匹配内容时不产生额外 blur
- [ ] 脱敏信息在 MCP 响应中明确告知
- [ ] `npm test` 全部通过
- [ ] 不引入 OCR 依赖

---

## 7. 注意事项

- 正则版只能处理**通过 annotations 传入的文本**，不能检测截图底图中已有的文字
- 误报风险：通用 API Key 正则可能误匹配普通长字符串，建议文档中说明规则适用范围
- 生产使用时建议调用方提供精确的 `redact_patterns` 而不是依赖 `auto_redact`

---

## 8. 参考

- `docs/plans/2026-03-16-phase2-candidate-requirements.md` — R7
- 分析报告第五章：隐私保护与智能脱敏
- tesseract.js: https://github.com/naptha/tesseract.js
