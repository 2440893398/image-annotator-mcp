# R4: 字体跨平台一致性（Text-to-Path）

## 文档信息

- **项目**: image-annotator-mcp
- **需求编号**: R4
- **所属阶段**: Phase 2 / P2
- **创建日期**: 2026-03-16
- **状态**: 待开发
- **估计工作量**: L（1 ~ 2 周）

---

## 1. 问题描述

当前系统依赖宿主机系统字库（`Inter, -apple-system, BlinkMacSystemFont, sans-serif` 等字体栈）渲染 SVG 中的 `<text>` 标签。在不同操作系统上，字体渲染存在以下差异：

1. **字号偏差**：不同操作系统的字体 hinting 策略不同，相同 `fontSize` 下实际渲染高度有差异
2. **字偶距偏差**：kerning 和字符间距在 Windows / macOS / Linux 上表现不一致
3. **包围盒计算失准**：`annotate.js` 中的 callout / label 宽度用估算系数（`TEXT_WIDTH_RATIO = 0.65`）推算，在不同字体下精度参差不齐
4. **跨平台 snapshot 不稳定**：同一参数在不同平台上产生不同的 SVG 结构，导致 CI/CD 环境下的 snapshot 测试可能在不同机器上失败

---

## 2. 适用范围

**覆盖**：

- `annotate.js` 中的 SVG 构建（`buildSvg`、`createCallout`、`createLabel`）
- Latin 字符（ASCII + 扩展 Latin）

**不覆盖（本阶段）**：

- CJK 字符（汉字、假名、韩文）——字体文件过大（~16MB），不打包
- `preview/renderer.js`（待 R2 同步后再更新）

---

## 3. 方案设计

### 3.1 字体内置

在项目 `assets/fonts/` 目录放置以下字体（OFL 协议，可免费商用）：

| 字体 | 用途 | 格式 | 估计大小 |
|------|------|------|---------|
| `Inter-Regular.woff2` | documentation / tutorial / highlight 主题 | WOFF2 | ~150KB |
| `Inter-Bold.woff2` | 粗体标注 | WOFF2 | ~155KB |
| `JetBrainsMono-Regular.woff2` | bugReport 主题（代码/key） | WOFF2 | ~200KB |

字体文件通过 npm 包 `@fontsource/inter` 和 `@fontsource/jetbrains-mono` 引入，不需要自行托管（这两个包已存在于 npm registry 且文件直接可用）。

### 3.2 Text-to-Path 实现

引入 `opentype.js`（MIT 协议）作为服务端字体解析库：

```javascript
const opentype = require('opentype.js');
```

在 `annotate.js` 中添加字体管理模块：

```javascript
// font-manager.js
const opentype = require('opentype.js');
const path = require('path');
const FONTS = {};

function getFont(fontName) {
  if (!FONTS[fontName]) {
    const fontPath = path.join(__dirname, 'assets', 'fonts', `${fontName}.woff2`);
    FONTS[fontName] = opentype.loadSync(fontPath);
  }
  return FONTS[fontName];
}

function textToPath(text, fontName, fontSize, x, y) {
  const font = getFont(fontName);
  const pathData = font.getPath(text, x, y, fontSize);
  return pathData.toSVG(2);  // 返回 <path d="..."> 字符串
}

function measureText(text, fontName, fontSize) {
  const font = getFont(fontName);
  const width = font.getAdvanceWidth(text, fontSize);
  return { width, height: fontSize * 1.2 };
}
```

### 3.3 替换 `<text>` 为 `<path>`

在 `createLabel()` 和 `createCallout()` 中：

**改前**：
```javascript
element += `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}">${escapeXml(text)}</text>`;
```

**改后**：
```javascript
const pathStr = textToPath(text, resolvedFont, fontSize, x, y);
element += pathStr;
```

### 3.4 包围盒计算改善

用 `measureText()` 替换现有的估算系数计算：

**改前**：
```javascript
const textWidth = Math.max(...lines.map(l => l.length * fontSize * TEXT_WIDTH_RATIO));
```

**改后**：
```javascript
const textWidth = Math.max(...lines.map(l => measureText(l, resolvedFont, fontSize).width));
```

### 3.5 CJK 回退策略

当文本中检测到 CJK 字符（`CJK_REGEX` 已存在于 `annotate.js`）时，跳过 Text-to-Path，保留 `<text>` 标签，使用系统字体回退：

```javascript
function containsCJK(text) {
  return CJK_REGEX.test(text);
}

function renderTextOrPath(text, font, fontSize, x, y) {
  if (containsCJK(text)) {
    // 保留 <text> 标签
    return `<text ...>${escapeXml(text)}</text>`;
  }
  return textToPath(text, font, fontSize, x, y);
}
```

---

## 4. 新增依赖

| 包 | 用途 | 协议 |
|----|------|------|
| `opentype.js` | 字体解析 + path 生成 | MIT |
| `@fontsource/inter` | Inter 字体文件 | OFL |
| `@fontsource/jetbrains-mono` | JetBrains Mono 字体文件 | OFL |

生产依赖约增加 ~600KB（字体文件）+ ~300KB（opentype.js）。

---

## 5. 需要修改的文件

| 文件 | 改动 |
|------|------|
| `annotate.js` | 引入字体管理，`createLabel` / `createCallout` 替换 `<text>` 为 `<path>` |
| 新增 `font-manager.js` | 字体加载、path 生成、文字宽度测量 |
| 新增 `assets/fonts/*.woff2` | 字体文件 |
| `package.json` | 新增 3 个依赖 |
| `annotate.test.js` | 更新 snapshot（text→path 后 SVG 结构变化） |

---

## 6. 验收标准

- [ ] Latin 文字渲染后 SVG 中不含 `<text>` 标签，改为 `<path>`
- [ ] CJK 文字仍保留 `<text>` 标签
- [ ] 相同 Latin 文字在修复前后视觉一致（人眼检查）
- [ ] `callout` 包围盒宽度更接近实际渲染宽度（用 `measureText` 计算）
- [ ] `npm test` 全部通过（snapshot 更新后）
- [ ] 跨平台（Windows / macOS / Linux）产出的 SVG `<path>` 内容完全一致

---

## 7. 注意事项

- Text-to-Path 后 SVG 体积会增大；SVGO 已在管线中，可压缩 path 数据
- 字体首次加载会有约 10~50ms 延迟，建议在模块初始化时预加载（lazy load 改为 eager load）
- 完成本需求后，`preview/renderer.js`（R2）需要再次同步

---

## 8. 参考

- `docs/plans/2026-03-16-phase2-candidate-requirements.md` — R4
- Phase 1 已知限制 L5
- opentype.js: https://opentype.js.org/
