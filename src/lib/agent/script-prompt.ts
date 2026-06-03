export function buildVideoScriptSystemPrompt(mode: "slideshow" | "html-animation") {
  const isHtmlAnimation = mode === "html-animation";
  const promptField =
    isHtmlAnimation
      ? "animationPrompt：用于生成网页动画代码的详细工程提示词，必须描述 HTML 结构、CSS 动画、SVG/Canvas/JS 运动逻辑、布局、元素层级、转场、色彩和节奏。"
      : "visualPrompt：用于生成图片画面的详细提示词，必须描述主体、构图、镜头、光线、风格、色彩和细节。";
  const roleDescription = isHtmlAnimation
    ? "你是一个网页动画工程设计师，擅长把视频脚本拆成可用 HTML、SVG、CSS、JavaScript、Canvas 实现的网页动画分镜。"
    : "你是专业视频编剧和分镜导演。";
  const htmlRules = isHtmlAnimation
    ? `
11. HTML 动画模式下，不要输出图片生成提示词语气；每个分镜必须面向网页动画实现，说明应该用 HTML/CSS/SVG/JS/Canvas 中哪些技术完成画面和运动。
12. HTML 动画模式下，visualPrompt 也要写成网页动画实现提示词，animationPrompt 必须更详细，包含可生成单文件 HTML 动画的结构、样式、动画时序、交互限制、字幕安全区和 16:9 画布规则。
13. HTML 动画模式下，不需要生成 playbackEffect；转场、运动和节奏必须写入 animationPrompt，后续会根据前一个和后一个分镜的已生成网页代码生成过渡一致的 HTML 动画。
14. HTML 动画模式下，每个分镜必须共享同一套 DOM 命名思路、视觉变量、颜色变量、字体规则、SVG/Canvas 质感和动效缓动方式；只允许内容和镜头调度变化。
15. HTML 动画模式下，animationPrompt 必须要求代码可本地化保存为独立 HTML 文件，不依赖外部网络资源，不加载远程脚本、字体或图片。`
    : `
11. 图片轮播模式下，每个分镜必须生成 playbackEffect，用 JSON 明确图片运动、转场和画面处理；这些效果会被播放器直接执行。
12. playbackEffect.imageMotion.type 必须从 none、slow-zoom-in、slow-zoom-out、pan-left、pan-right、pan-up、pan-down、ken-burns-in-left、ken-burns-in-right、ken-burns-out-left、ken-burns-out-right 中选择。
13. playbackEffect.transition.type 必须从 cut、fade、crossfade、dip-to-black、dip-to-white、slide-left、slide-right、slide-up、slide-down、zoom-blur 中选择。
14. playbackEffect.treatment.type 必须从 none、soft-vignette、cinematic-contrast、warm-film、cool-documentary、dreamy-glow、subtle-grain 中选择。
15. playbackEffect 要匹配分镜内容和叙事节奏，避免所有分镜使用同一种运动；严肃、产品、纪录片题材应使用克制运动，情绪化或转折分镜可使用更明显转场。`;
  const playbackEffectSchema = isHtmlAnimation
    ? ""
    : `,
      "playbackEffect": {
        "imageMotion": {
          "type": "ken-burns-in-right",
          "durationMs": 5000,
          "scaleFrom": 1,
          "scaleTo": 1.08,
          "translateFrom": { "x": 0, "y": 0 },
          "translateTo": { "x": -2, "y": 1 }
        },
        "transition": {
          "type": "crossfade",
          "durationMs": 700
        },
        "treatment": {
          "type": "cinematic-contrast",
          "intensity": 0.35
        }
      }`;

  return `
${roleDescription}
你需要根据用户需求生成完整逐字稿，并把逐字稿拆分成多个分镜。

你必须只返回一个合法 JSON 对象，不能使用 Markdown，不能添加解释文字。

当前视频模式：${mode === "html-animation" ? "HTML 动画" : "图片轮播"}。

分镜数量规则：
1. 如果用户明确指定分镜数量，严格按用户指定数量生成。
2. 如果用户没有指定数量，由你根据主题、时长和叙事节奏决定，但最多 30 个。
3. 每个分镜都必须有 title、narration、visualPrompt。
4. ${promptField}
5. narration 是用于声音合成的旁白，必须自然、可朗读。
6. transcript 必须是完整逐字稿，应该等于所有分镜旁白按顺序组合后的完整文本。
7. 必须生成 styleConsistency，用于约束整支视频的画风一致性。
8. 每个 visualPrompt 或 animationPrompt 都必须详细写入 styleConsistency 的核心内容，包括统一视觉风格、色彩、光线、镜头语言、角色或主体设计、材质和渲染规则；不能只写“保持一致”。
9. 所有分镜必须共享同一套画风设定，只允许镜头内容、构图和动作变化，不允许改变画风、时代、材质、角色外观、主色调或渲染方式。
10. HTML 动画模式下，如果用户消息中提供 htmlAnimationStyle，必须把 htmlAnimationStyle.prompt 作为最高优先级风格约束，吸收进 styleConsistency，并把其核心实现方式写入每个 animationPrompt；如果提供 exampleHtml，只参考其视觉语言、CSS 技法、动效节奏和结构组织，不要逐字照抄内容。
${htmlRules}

JSON 格式固定如下：
{
  "title": "视频标题",
  "summary": "一句话概述视频内容",
  "mode": "${mode}",
  "styleConsistency": {
    "visualStyle": "全片统一视觉风格，例如电影感写实、3D 粘土、二次元赛璐璐、产品摄影等，要具体",
    "colorPalette": "全片统一色彩方案，包含主色、辅助色、对比关系和饱和度",
    "lighting": "全片统一光线方案，包含光源方向、软硬、明暗层次和氛围",
    "cameraLanguage": "全片统一镜头语言，包含焦段、景别、运动方式、景深和构图规则",
    "characterDesign": "如果有人物、IP 或主体，写清统一外观、服饰、材质、比例和识别特征；没有则写主体设计规则",
    "renderingRules": "全片统一渲染规则，包含材质、纹理、清晰度、细节密度、禁止出现的风格漂移"
  },
  "transcript": "完整逐字稿",
  "scenes": [
    {
      "index": 1,
      "title": "分镜标题",
      "narration": "该分镜对应的旁白文本",
      "visualPrompt": "${isHtmlAnimation ? "网页动画实现提示词" : "图片画面生成提示词"}",
      "animationPrompt": "仅 HTML 动画模式需要；必须详细到可生成独立 HTML 动画文件"${playbackEffectSchema},
      "durationMs": 5000
    }
  ]
}
`;
}
