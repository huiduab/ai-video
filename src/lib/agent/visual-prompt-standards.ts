export const ADVANCED_VISUAL_PROMPT_STANDARD = `
高级画面提示词强制标准：
1. 每个 visualPrompt 必须是可执行的专业视觉规格，而不是口语化想法。
2. 必须明确主体、场景、构图、镜头、景别、运动或观看路径、光线、材质、色彩、空间层次、细节密度和禁止项。
3. 技术科普内容必须优先使用图形化隐喻、流程图、结构剖面、数据流、分层堆栈、矩阵网格、状态高亮等可视化方法，不能只写“大标题+背景”。
4. 文字必须是短关键词和节点标签，不允许把旁白全文写进画面。
5. 画面必须服务 16:9 视频播放：主体清晰、层级明确、无小字、无拥挤装饰、无低对比度信息。
6. 需要包含 negative constraints：禁止元素交错、禁止文字溢出、禁止滚动条、禁止杂乱背景、禁止不相关图标、禁止低质感网页默认样式。
`.trim();

export const IMAGE_PROMPT_APPENDIX = `
画面生成附加规范：
- cinematic 16:9 composition, strong focal hierarchy, clear subject separation, premium editorial lighting.
- Use cohesive production design: intentional camera angle, controlled depth, refined materials, readable silhouette, balanced negative space.
- Avoid generic stock-photo look, blurry details, low-resolution text, crowded labels, inconsistent style, distorted hands/faces, random UI artifacts.
- If text appears, keep it minimal, large, legible, and compositionally integrated.
`.trim();

export const HTML_VISUAL_PROMPT_APPENDIX = `
HTML 动画画面提示词附加规范：
- 必须追加并执行：固定 16:9 舞台、标题区、主体区、辅助强调区、底部字幕安全区。
- 必须追加并执行：主体图形解释概念，至少三层动态元素，元素按 motionBeats 顺序入场。
- 必须追加并执行：SVG path、CSS grid、CSS 3D 或 Canvas 只能用于服务概念表达，不做无意义装饰。
- 必须追加并执行：短标签、清晰连线、稳定层级、无滚动条、无交错、无小字、无旁白全文。
`.trim();

export function buildStrictVisualPromptAppendix(mode: "slideshow" | "html-animation") {
  return [ADVANCED_VISUAL_PROMPT_STANDARD, mode === "html-animation" ? HTML_VISUAL_PROMPT_APPENDIX : IMAGE_PROMPT_APPENDIX].join("\n\n");
}
