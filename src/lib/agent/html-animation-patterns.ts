export interface HtmlAnimationPattern {
  id: string;
  name: string;
  triggerHints: string[];
  promptAddendum: string;
}

export const HTML_ANIMATION_PATTERNS: HtmlAnimationPattern[] = [
  {
    id: "data-flow",
    name: "数据流可视化",
    triggerHints: ["编码", "传输", "协议", "流媒体", "数据", "packet", "stream", "network"],
    promptAddendum:
      "使用左到右数据流：输入块、处理节点、输出块必须形成清晰路径；数据粒子沿 SVG path 循环流动，节点按顺序发光，箭头方向明确。",
  },
  {
    id: "layered-system",
    name: "分层结构剖面",
    triggerHints: ["容器", "结构", "架构", "层", "模块", "MP4", "container", "layer", "stack"],
    promptAddendum:
      "使用分层堆栈或剖面图：每层使用短标签和稳定间距，当前层放大并高亮，层间关系用细线或阴影表达，不允许层卡互相覆盖文字。",
  },
  {
    id: "kinetic-emphasis",
    name: "动态关键词强调",
    triggerHints: ["重点", "结论", "开场", "转折", "记住", "核心"],
    promptAddendum:
      "使用动态关键词：关键词逐词弹入、描边闪光、色块扫过；每个关键词停留可读，不允许连续抖动造成阅读困难。",
  },
  {
    id: "ppt-page-turn",
    name: "PPT 章节演示",
    triggerHints: ["章节", "定义", "概念", "总结", "介绍", "overview"],
    promptAddendum:
      "使用高级演示页：大标题、短副标题、一个抽象几何主体和少量注释；通过遮罩、滑入和轻微镜头推进完成 PPT 式转场。",
  },
  {
    id: "three-d-object",
    name: "3D 对象展示",
    triggerHints: ["3D", "三维", "立体", "旋转", "盒子", "封装", "对象"],
    promptAddendum:
      "使用 CSS 3D 卡片或盒体：主体先以透视角转入，再展开关键面；最终定格必须文字正向清晰，不允许长期倾斜不可读。",
  },
  {
    id: "layout-safety",
    name: "版式安全约束",
    triggerHints: [],
    promptAddendum:
      "所有布局必须使用明确区域和稳定尺寸：title-zone、main-zone、accent-zone、caption-safe-zone；禁止普通文档流自然堆叠复杂元素，禁止小字、溢出、交错、滚动条。",
  },
];

export function selectHtmlAnimationPatterns(text: string) {
  const normalized = text.toLowerCase();
  const selected = HTML_ANIMATION_PATTERNS.filter((pattern) =>
    pattern.triggerHints.length === 0 ? true : pattern.triggerHints.some((hint) => normalized.includes(hint.toLowerCase())),
  );

  return selected.slice(0, 4);
}

export function buildHtmlAnimationPatternAddendum(text: string) {
  return selectHtmlAnimationPatterns(text)
    .map((pattern) => `${pattern.name}：${pattern.promptAddendum}`)
    .join("\n");
}
