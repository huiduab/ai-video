import type { HtmlAnimationTemplateId, VideoScriptScene } from "@/types/agent";

export interface HtmlAnimationTemplate {
  id: HtmlAnimationTemplateId;
  name: string;
  bestFor: string[];
  layoutRules: string;
  motionRules: string;
  safeAreaRules: string;
}

export const HTML_ANIMATION_TEMPLATES: HtmlAnimationTemplate[] = [
  {
    id: "kinetic-title",
    name: "冲击标题",
    bestFor: ["开场", "结论", "关键概念", "短视频钩子"],
    layoutRules: "使用全屏大字号关键词，最多 3 组文本层；主体文本占画面中心 60%，辅助标签在角落或底部安全区上方。",
    motionRules: "关键词按 0.2s-0.4s 间隔弹入、缩放回弹、轻微旋转；强调词可使用描边、闪白、色块扫过或短促震动。",
    safeAreaRules: "底部 18% 留给播放器和字幕，不放核心文字；超长英文必须断行，中文每行不超过 12 个字。",
  },
  {
    id: "data-flow-network",
    name: "数据流动网络",
    bestFor: ["编码", "传输", "协议", "网络", "数据流", "管线"],
    layoutRules: "左侧输入，中间处理节点，右侧输出；使用 SVG path 绘制连线和箭头，节点尺寸固定，避免自由绝对定位堆叠。",
    motionRules: "数据粒子沿路径循环移动，当前节点依次高亮，箭头方向清晰；每个阶段至少有一次节点发光或线条扫过。",
    safeAreaRules: "主图限制在画面中部 26%-74% 高度，标题在上方 8%-20%，底部保留空白。",
  },
  {
    id: "layered-stack",
    name: "分层堆栈",
    bestFor: ["容器结构", "系统分层", "模型层", "文件结构", "架构解释"],
    layoutRules: "使用 3-6 个横向或透视层叠卡片表达层级，每层只放短标签；层间距稳定，避免重叠。",
    motionRules: "层从底到顶或由远到近依次滑入，当前层放大 1.04 倍并发光，最后整体轻微悬浮。",
    safeAreaRules: "堆栈主体不得超过画面宽度 78%，底部字幕安全区不放层卡。",
  },
  {
    id: "comparison-split",
    name: "左右对比",
    bestFor: ["前后对比", "输入输出", "错误与正确", "压缩前后"],
    layoutRules: "左右双栏或中轴分割，左侧旧状态、右侧新状态；中间用箭头或变换轨迹连接。",
    motionRules: "左侧先出现，随后中轴扫光，右侧生成结果弹入；对比差异用短脉冲或颜色切换强调。",
    safeAreaRules: "两栏各自保留 8% 内边距，文本不跨越中轴，底部不放重要差异点。",
  },
  {
    id: "timeline-process",
    name: "流程时间线",
    bestFor: ["步骤", "流程", "渲染管线", "制作过程", "生命周期"],
    layoutRules: "使用横向或弧形时间线，3-5 个步骤节点；当前步骤标签最大，非当前步骤弱化。",
    motionRules: "进度线从左到右填充，节点依次点亮，当前步骤出现局部图形或状态卡片。",
    safeAreaRules: "时间线位于画面中部，步骤标签字号不小于 28px 等效视觉尺寸。",
  },
  {
    id: "matrix-grid",
    name: "矩阵网格",
    bestFor: ["像素", "编码块", "数据块", "表格", "分片", "采样"],
    layoutRules: "使用规则网格、像素块或数据块矩阵；网格单元不超过 12x8，避免太密。",
    motionRules: "块状元素按波浪、扫描线或随机但有节奏的顺序点亮；关键块放大并连接到说明标签。",
    safeAreaRules: "网格边缘至少离画面 6%，标签贴近目标块但不得覆盖网格主体。",
  },
  {
    id: "three-d-card",
    name: "3D 卡片旋转",
    bestFor: ["对象展示", "封装", "容器", "状态切换", "概念实体"],
    layoutRules: "使用 CSS 3D transform 表达卡片、盒体或层叠面板；文本放在正面或侧边标签。",
    motionRules: "主体从 12deg-24deg 透视角缓慢转入，关键面翻转或展开，最后停在清晰可读角度。",
    safeAreaRules: "3D 旋转不得让文字长时间倾斜不可读；最终静帧必须文字正向清晰。",
  },
  {
    id: "ppt-cover-impact",
    name: "PPT 章节页",
    bestFor: ["章节切换", "总结", "定义", "标题页", "学术解释"],
    layoutRules: "使用强主标题、短副标题和一个抽象几何主体；不使用长段正文。",
    motionRules: "背景几何缓慢推进，标题淡入上移，关键词用细线或色块强调。",
    safeAreaRules: "标题区域不超过两行，副标题不超过 18 个中文字符或 36 个英文字符。",
  },
];

const fallbackTemplate = HTML_ANIMATION_TEMPLATES[0];

export function getHtmlAnimationTemplate(id: unknown): HtmlAnimationTemplate {
  if (typeof id !== "string" || id === "auto") {
    return fallbackTemplate;
  }

  return HTML_ANIMATION_TEMPLATES.find((template) => template.id === id) ?? fallbackTemplate;
}

export function chooseHtmlAnimationTemplate(scene: VideoScriptScene): HtmlAnimationTemplate {
  const explicitTemplate = getHtmlAnimationTemplate(scene.htmlAnimation?.templateId);

  if (scene.htmlAnimation?.templateId && scene.htmlAnimation.templateId !== "auto") {
    return explicitTemplate;
  }

  const text = `${scene.title} ${scene.narration} ${scene.visualPrompt} ${scene.animationPrompt ?? ""}`.toLowerCase();

  if (/(编码|传输|协议|network|flow|stream|packet|pipeline|data)/i.test(text)) {
    return getHtmlAnimationTemplate("data-flow-network");
  }

  if (/(容器|结构|分层|架构|layer|stack|container|module)/i.test(text)) {
    return getHtmlAnimationTemplate("layered-stack");
  }

  if (/(步骤|流程|过程|时间线|timeline|process|step)/i.test(text)) {
    return getHtmlAnimationTemplate("timeline-process");
  }

  if (/(像素|矩阵|网格|表格|采样|matrix|grid|block)/i.test(text)) {
    return getHtmlAnimationTemplate("matrix-grid");
  }

  if (/(对比|前后|before|after|versus|vs)/i.test(text)) {
    return getHtmlAnimationTemplate("comparison-split");
  }

  if (/(3d|三维|旋转|立体|翻转|rotation|cube|card)/i.test(text)) {
    return getHtmlAnimationTemplate("three-d-card");
  }

  return explicitTemplate;
}
