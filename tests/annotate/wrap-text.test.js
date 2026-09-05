const { wrapTextLines, measureTextBlock, getTextContentWidthPx, buildSvg, setIdGenerator, resetIdGenerator, getLeadoutChipSize } = require('../../src/annotate/render');

describe('wrapTextLines', () => {
  test('no maxWidth keeps legacy split-on-newline behavior', () => {
    expect(wrapTextLines('hello world', 18, null)).toEqual(['hello world']);
    expect(wrapTextLines('line one\nline two', 18, null)).toEqual(['line one', 'line two']);
    expect(wrapTextLines('a\nb', 18, 0)).toEqual(['a', 'b']);
  });

  test('non-string input is stringified like the renderers do', () => {
    expect(wrapTextLines(undefined, 18, null)).toEqual(['']);
    expect(wrapTextLines(42, 18, null)).toEqual(['42']);
  });

  test('wraps latin text at word boundaries', () => {
    // fontSize 10 -> each latin char is 5px wide, "aaa bbb ccc" = 55px
    const lines = wrapTextLines('aaa bbb ccc', 10, 40);
    expect(lines).toEqual(['aaa bbb', 'ccc']);
  });

  test('drops the space at a break point', () => {
    for (const line of wrapTextLines('one two three four five', 10, 30)) {
      expect(line).not.toMatch(/^\s|\s$/);
    }
  });

  test('wraps CJK text at any character', () => {
    // fontSize 10 -> each CJK char is 10px wide
    const lines = wrapTextLines('点击这里打开设置', 10, 30);
    expect(lines).toEqual(['点击这', '里打开', '设置']);
  });

  test('mixed CJK and latin wraps without splitting latin words', () => {
    const lines = wrapTextLines('打开settings页面', 10, 40);
    // 打开(20) + settings(40) exceeds 40 -> break after 打开
    expect(lines[0]).toBe('打开');
    expect(lines[1]).toBe('settings');
    expect(lines[2]).toBe('页面');
  });

  test('hard-splits a single word wider than the box', () => {
    const lines = wrapTextLines('abcdefghij', 10, 25);
    expect(lines).toEqual(['abcde', 'fghij']);
  });

  test('explicit newlines always break, then wrapping applies per line', () => {
    const lines = wrapTextLines('aaa\nbbb ccc ddd', 10, 35);
    expect(lines[0]).toBe('aaa');
    expect(lines).toEqual(['aaa', 'bbb ccc', 'ddd']);
  });

  test('every wrapped line fits within maxWidth', () => {
    const text = '在 2026 年的 annotation 工具里 automatic wrapping 是标配功能';
    for (const line of wrapTextLines(text, 16, 120)) {
      expect(getTextContentWidthPx(line, 16)).toBeLessThanOrEqual(120);
    }
  });

  test('handles surrogate-pair codepoints without splitting them', () => {
    const lines = wrapTextLines('🎯🎯🎯', 10, 15);
    expect(lines.join('')).toBe('🎯🎯🎯');
    for (const line of lines) {
      expect(line).not.toMatch(/[\uD800-\uDBFF]$/);
    }
  });
});

describe('measureTextBlock', () => {
  test('matches legacy per-line measurement when maxWidth is null', () => {
    const block = measureTextBlock('hello\n世界', 20, { maxWidth: null, lineHeightRatio: 1.3 });
    expect(block.lines).toEqual(['hello', '世界']);
    expect(block.width).toBe(getTextContentWidthPx('hello', 20));
    expect(block.lineHeight).toBe(26);
    expect(block.height).toBe(52);
  });

  test('height grows with wrapped line count', () => {
    const unwrapped = measureTextBlock('aaa bbb ccc', 10, {});
    const wrapped = measureTextBlock('aaa bbb ccc', 10, { maxWidth: 40 });
    expect(wrapped.lines.length).toBeGreaterThan(unwrapped.lines.length);
    expect(wrapped.height).toBeGreaterThan(unwrapped.height);
    expect(wrapped.width).toBeLessThanOrEqual(40);
  });
});

describe('component auto-wrap', () => {
  beforeEach(() => {
    let counter = 0;
    setIdGenerator((prefix) => `${prefix}-test-${counter++}`);
  });
  afterEach(() => resetIdGenerator());

  const countTspans = (svg) => (svg.match(/<tspan/g) || []).length;

  test('callout with fixed width wraps its text', () => {
    const long = 'this is a fairly long callout sentence that must wrap';
    const wrapped = buildSvg(800, 600, [{ type: 'callout', x: 400, y: 300, text: long, width: 200 }]);
    const unwrapped = buildSvg(800, 600, [{ type: 'callout', x: 400, y: 300, text: long }]);
    expect(countTspans(wrapped)).toBeGreaterThan(1);
    expect(countTspans(unwrapped)).toBe(1);
  });

  test('callout maxWidth wraps without forcing the box width', () => {
    const svg = buildSvg(800, 600, [{ type: 'callout', x: 400, y: 300, text: '点击右上角的设置按钮打开偏好设置面板', fontSize: 18, maxWidth: 200 }]);
    expect(countTspans(svg)).toBeGreaterThan(1);
  });

  test('label maxWidth wraps and keeps the block above the anchor baseline', () => {
    const svg = buildSvg(800, 600, [{ type: 'label', x: 100, y: 300, text: 'wrap wrap wrap wrap wrap', fontSize: 20, maxWidth: 120 }]);
    expect(countTspans(svg)).toBeGreaterThan(1);
    // bottom-anchored: the <text> y must sit above the anchor y
    const textY = Number(svg.match(/<text x="100" y="([\d.-]+)"/)[1]);
    expect(textY).toBeLessThan(300);
  });

  test('multi-line label keeps its last baseline on y (regression: text used to escape the box)', () => {
    const svg = buildSvg(800, 600, [{ type: 'label', x: 100, y: 300, text: 'one\ntwo', fontSize: 20, background: 'white' }]);
    const textY = Number(svg.match(/<text x="100" y="([\d.-]+)"/)[1]);
    expect(textY).toBe(300 - 26); // first baseline one lineHeight (20*1.3) above y
  });

  test('leadout chip grows in height and respects maxWidth', () => {
    const text = 'Primary navigation entry point';
    const plain = getLeadoutChipSize(text, 16);
    const wrapped = getLeadoutChipSize(text, 16, 140);
    expect(wrapped.lines.length).toBeGreaterThan(plain.lines.length);
    expect(wrapped.width).toBeLessThanOrEqual(140);
    expect(wrapped.height).toBeGreaterThan(plain.height);
  });
});
