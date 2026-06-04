import type {
  GeneratedSceneAsset,
  HtmlAnimationBlueprint,
  HtmlAnimationTemplateId,
  SceneGenerationState,
  VideoScriptResult,
  VideoScriptScene,
  VideoStyleConsistency,
} from "@/types/agent";
import { normalizePlaybackEffect } from "@/lib/storyboard-playback";

const validAssetStatuses = new Set(["idle", "queued", "generating", "succeeded", "failed", "cancelled"]);
const validHtmlAnimationTemplateIds = new Set<HtmlAnimationTemplateId>([
  "auto",
  "kinetic-title",
  "data-flow-network",
  "layered-stack",
  "comparison-split",
  "timeline-process",
  "matrix-grid",
  "three-d-card",
  "ppt-cover-impact",
]);
const minHtmlScenePromptLength = 80;
const minDirectorPromptLength = 80;
const minLayerPromptLength = 40;
const minCameraPromptLength = 40;
const minHtmlExecutionPromptLength = 160;
const minTimelineBeatLength = 20;

function validateGeneratedAsset(value: unknown): GeneratedSceneAsset | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const asset = value as Partial<GeneratedSceneAsset>;
  const status = typeof asset.status === "string" && validAssetStatuses.has(asset.status) ? asset.status : "idle";

  return {
    status: status as GeneratedSceneAsset["status"],
    assetId: typeof asset.assetId === "string" ? asset.assetId : undefined,
    url: typeof asset.url === "string" ? asset.url : undefined,
    prompt: typeof asset.prompt === "string" ? asset.prompt : undefined,
    error: typeof asset.error === "string" ? asset.error : undefined,
    generatedAt: typeof asset.generatedAt === "string" ? asset.generatedAt : undefined,
    durationMs: typeof asset.durationMs === "number" && asset.durationMs > 0 ? Math.round(asset.durationMs) : undefined,
  };
}

function validateGenerationState(value: unknown): SceneGenerationState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const generation = value as Partial<SceneGenerationState>;
  const image = validateGeneratedAsset(generation.image);
  const htmlBase = validateGeneratedAsset(generation.html);
  const html =
    htmlBase && generation.html && typeof generation.html === "object" && !Array.isArray(generation.html)
      ? {
          ...htmlBase,
          code: typeof generation.html.code === "string" ? generation.html.code : undefined,
        }
      : undefined;
  const audio = validateGeneratedAsset(generation.audio);

  if (!image && !html && !audio) {
    return undefined;
  }

  return { image, html, audio };
}

function validateHtmlAnimationBlueprint(value: unknown): HtmlAnimationBlueprint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const blueprint = value as Partial<HtmlAnimationBlueprint>;
  const templateId = typeof blueprint.templateId === "string" && validHtmlAnimationTemplateIds.has(blueprint.templateId as HtmlAnimationTemplateId) ? blueprint.templateId : "auto";
  const visualMetaphor = optionalText(blueprint.visualMetaphor);
  const focusPath = optionalText(blueprint.focusPath);
  const transitionIntent = optionalText(blueprint.transitionIntent);
  const directorPrompt = optionalText(blueprint.directorPrompt);
  const cameraPrompt = optionalText(blueprint.cameraPrompt);
  const htmlPrompt = optionalText(blueprint.htmlPrompt);
  const layerPrompt =
    blueprint.layerPrompt && typeof blueprint.layerPrompt === "object" && !Array.isArray(blueprint.layerPrompt)
      ? {
          background: optionalText(blueprint.layerPrompt.background) ?? "",
          midground: optionalText(blueprint.layerPrompt.midground) ?? "",
          foreground: optionalText(blueprint.layerPrompt.foreground) ?? "",
        }
      : undefined;
  const animationTimeline =
    blueprint.animationTimeline && typeof blueprint.animationTimeline === "object" && !Array.isArray(blueprint.animationTimeline)
      ? {
          start: optionalText(blueprint.animationTimeline.start) ?? "",
          middle: optionalText(blueprint.animationTimeline.middle) ?? "",
          end: optionalText(blueprint.animationTimeline.end) ?? "",
        }
      : undefined;
  const motionTechniques = Array.isArray(blueprint.motionTechniques)
    ? blueprint.motionTechniques.map(optionalText).filter((item): item is string => Boolean(item)).slice(0, 10)
    : [];
  const negativePrompt = Array.isArray(blueprint.negativePrompt)
    ? blueprint.negativePrompt.map(optionalText).filter((item): item is string => Boolean(item)).slice(0, 12)
    : [];
  const revisionHints = Array.isArray(blueprint.revisionHints)
    ? blueprint.revisionHints.map(optionalText).filter((item): item is string => Boolean(item)).slice(0, 8)
    : [];
  const motionBeats = Array.isArray(blueprint.motionBeats)
    ? blueprint.motionBeats
        .map((beat) => {
          if (!beat || typeof beat !== "object" || Array.isArray(beat)) {
            return undefined;
          }

          const item = beat as { timeMs?: unknown; action?: unknown };
          const action = optionalText(item.action);

          if (!action) {
            return undefined;
          }

          return {
            timeMs: typeof item.timeMs === "number" && item.timeMs >= 0 ? Math.round(item.timeMs) : 0,
            action,
          };
        })
        .filter((beat): beat is { timeMs: number; action: string } => Boolean(beat))
        .slice(0, 8)
    : [];
  const emphasisMoments = Array.isArray(blueprint.emphasisMoments)
    ? blueprint.emphasisMoments.map(optionalText).filter((item): item is string => Boolean(item)).slice(0, 8)
    : [];

  return {
    templateId: templateId as HtmlAnimationTemplateId,
    visualMetaphor: visualMetaphor ?? "",
    directorPrompt,
    layerPrompt,
    animationTimeline,
    cameraPrompt,
    motionTechniques,
    htmlPrompt,
    negativePrompt,
    revisionHints,
    motionBeats,
    focusPath: focusPath ?? "",
    emphasisMoments,
    transitionIntent: transitionIntent ?? "与前后分镜保持同一视觉语言，用节奏相近的淡入、推进或状态高亮承接。",
  };
}

function validateScene(value: unknown, fallbackIndex: number): VideoScriptScene {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Script scene must be an object");
  }

  const scene = value as Partial<VideoScriptScene>;

  if (typeof scene.title !== "string" || !scene.title.trim()) {
    throw new Error("Script scene title is required");
  }

  if (typeof scene.narration !== "string" || !scene.narration.trim()) {
    throw new Error("Script scene narration is required");
  }

  if (typeof scene.visualPrompt !== "string" || !scene.visualPrompt.trim()) {
    throw new Error("Script scene visualPrompt is required");
  }

  return {
    index: typeof scene.index === "number" && scene.index > 0 ? scene.index : fallbackIndex,
    title: scene.title.trim(),
    narration: scene.narration.trim(),
    visualPrompt: scene.visualPrompt.trim(),
    animationPrompt: typeof scene.animationPrompt === "string" ? scene.animationPrompt.trim() : undefined,
    htmlAnimation: validateHtmlAnimationBlueprint(scene.htmlAnimation),
    playbackEffect: normalizePlaybackEffect(scene.playbackEffect),
    durationMs: typeof scene.durationMs === "number" && scene.durationMs > 0 ? Math.round(scene.durationMs) : undefined,
    generation: validateGenerationState(scene.generation),
  };
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textLength(value: string | undefined) {
  return value?.trim().length ?? 0;
}

function assertMinText(value: string | undefined, minLength: number, fieldName: string) {
  if (textLength(value) < minLength) {
    throw new Error(`${fieldName} must be at least ${minLength} characters`);
  }
}

function ensureMinText(value: string | undefined, minLength: number, fallback: string) {
  const text = value?.trim() ?? "";
  const fallbackText = fallback.trim();

  if (text.length >= minLength) {
    return text;
  }

  if (!text) {
    return fallbackText;
  }

  if (fallbackText.includes(text) || text.includes(fallbackText)) {
    return text.length >= fallbackText.length ? text : fallbackText;
  }

  return `${text} ${fallbackText}`.trim();
}

function ensureMinItems(items: string[] | undefined, minLength: number, fallbackItems: string[]) {
  const next = [...(items ?? [])];

  for (const item of fallbackItems) {
    if (next.length >= minLength) {
      break;
    }

    if (!next.includes(item)) {
      next.push(item);
    }
  }

  return next;
}

export function ensureHtmlAnimationDirectorDetail(scene: VideoScriptScene) {
  const fallbackSummary = `本镜头围绕“${scene.title}”展开，旁白核心是“${scene.narration}”。画面必须使用固定 16:9 HTML 舞台、深色背景、清晰标题区、主体动态图形区和底部字幕安全区，避免滚动条、远程图片、远程字体、无关图标和旁白全文上屏。`;
  const fallbackImplementation = `使用 HTML/CSS/SVG/JavaScript 构建单文件网页动画，保持统一 DOM 命名、颜色变量、无衬线字体、克制缓动和网页播放器安全区。主体图形需要解释本镜头概念，至少包含标题、主体结构和辅助强调三层动态元素。`;

  scene.visualPrompt = ensureMinText(scene.visualPrompt, minHtmlScenePromptLength, fallbackSummary);
  scene.animationPrompt = ensureMinText(scene.animationPrompt, minHtmlScenePromptLength, `${fallbackSummary} ${fallbackImplementation}`);

  const blueprint =
    scene.htmlAnimation ??
    ({
      templateId: "auto",
      visualMetaphor: "",
      motionBeats: [],
      focusPath: "",
      emphasisMoments: [],
      transitionIntent: "",
    } satisfies HtmlAnimationBlueprint);

  blueprint.visualMetaphor = ensureMinText(
    blueprint.visualMetaphor,
    40,
    `用与“${scene.title}”直接相关的结构化图形隐喻解释概念，让信息从输入、处理、对比或输出区域有序流动。`,
  );
  blueprint.directorPrompt = ensureMinText(
    blueprint.directorPrompt,
    minDirectorPromptLength,
    `${fallbackSummary} 导演调度应先建立主题和视觉焦点，再让主体图形按旁白逻辑逐步出现、发光、连线或状态切换，最后定格在一个可读的概念结果上，并与前后分镜保持同一深色极简科技视觉语言。`,
  );
  blueprint.layerPrompt = {
    background: ensureMinText(
      blueprint.layerPrompt?.background,
      minLayerPromptLength,
      "背景层使用 #111111 深炭色和极淡网格或低透明度线性纹理，保持干净高对比，不出现照片、远程资源、杂乱装饰和低可读小字。",
    ),
    midground: ensureMinText(
      blueprint.layerPrompt?.midground,
      minLayerPromptLength,
      `中景层承载“${scene.title}”的主体动态图形，使用 SVG 节点、路径、矩阵、卡片或流程块表达概念，位置避开底部安全区。`,
    ),
    foreground: ensureMinText(
      blueprint.layerPrompt?.foreground,
      minLayerPromptLength,
      "前景层只放少量高亮线、粒子、描边、关键词或焦点光扫，负责引导视线和强调节奏，不遮挡主体图形和标题文本。",
    ),
  };
  blueprint.animationTimeline = {
    start: ensureMinText(
      blueprint.animationTimeline?.start,
      minTimelineBeatLength,
      "0 到 1 秒标题淡入并轻微上移，背景纹理低透明出现，主体图形保持待激活状态。",
    ),
    middle: ensureMinText(
      blueprint.animationTimeline?.middle,
      minTimelineBeatLength,
      "中段按旁白逻辑依次激活节点、连线、数据流或关键词，使用平滑缓动和清晰层级推进。",
    ),
    end: ensureMinText(
      blueprint.animationTimeline?.end,
      minTimelineBeatLength,
      "结尾收束粒子和高亮，主体图形定格，预留同色背景和运动方向衔接下一镜头。",
    ),
  };
  blueprint.cameraPrompt = ensureMinText(
    blueprint.cameraPrompt,
    minCameraPromptLength,
    "镜头以固定 16:9 舞台为基础，可用 CSS transform 做轻微推近或视差，但不改变布局流，不旋转，不让文字或动态图形进入底部 18% 字幕安全区。",
  );
  blueprint.motionTechniques = ensureMinItems(blueprint.motionTechniques, 3, [
    "fade-in with subtle slide-up",
    "SVG path or node activation",
    "CSS transform based slow push-in",
    "foreground highlight sweep",
  ]);
  blueprint.htmlPrompt = ensureMinText(
    blueprint.htmlPrompt,
    minHtmlExecutionPromptLength,
    `${scene.animationPrompt} 生成完整自包含 HTML 文件，只输出 HTML。舞台固定 16:9，隐藏 html/body overflow，背景、中景、前景三层清晰分离。允许使用 GSAP CDN，但必须同时能用 CSS keyframes、Web Animations API 或 requestAnimationFrame 实现核心动画。不得使用远程字体、远程图片、其他远程脚本、弹窗、滚动条和旁白全文上屏。`,
  );
  blueprint.negativePrompt = ensureMinItems(blueprint.negativePrompt, 5, [
    "不要使用远程图片或远程字体",
    "不要把旁白全文写进画面",
    "不要出现滚动条或溢出内容",
    "不要添加无关人物、图标或装饰",
    "不要把核心元素放入底部字幕安全区",
  ]);
  blueprint.revisionHints = ensureMinItems(blueprint.revisionHints, 3, [
    "如果画面太空，优先增加与概念相关的主体结构层，而不是添加装饰。",
    "如果动效太弱，优先加强节点激活、路径流动和轻微镜头推进。",
    "如果文字拥挤，减少画面文字数量并扩大主体图形留白。",
  ]);
  blueprint.motionBeats =
    blueprint.motionBeats.length >= 4
      ? blueprint.motionBeats
      : [
          ...blueprint.motionBeats,
          { timeMs: 0, action: "标题淡入并轻微上移，背景纹理低透明建立空间。" },
          { timeMs: 800, action: "主体图形从中心或左侧进入，关键节点按顺序点亮。" },
          { timeMs: 1800, action: "数据流、连线或高亮沿主体路径移动，解释本镜头核心概念。" },
          { timeMs: 3200, action: "关键词或结果状态短暂强调后定格，预留下一镜头转场。" },
        ].slice(0, 8);
  blueprint.focusPath = ensureMinText(
    blueprint.focusPath,
    30,
    "观众视线从标题移动到主体图形，再跟随高亮路径或节点流动到最终结果区域。",
  );
  blueprint.emphasisMoments = ensureMinItems(blueprint.emphasisMoments, 1, [scene.title]);
  blueprint.transitionIntent = ensureMinText(
    blueprint.transitionIntent,
    40,
    "延续同一深色背景、字体、颜色变量和缓动节奏，通过淡入、状态高亮或数据流方向承接前后镜头。",
  );
  scene.htmlAnimation = blueprint;
}

function validateHtmlAnimationDirectorDetail(scene: VideoScriptScene) {
  ensureHtmlAnimationDirectorDetail(scene);

  const blueprint = scene.htmlAnimation;

  if (!blueprint) {
    throw new Error(`Scene ${scene.index} htmlAnimation is required for HTML animation mode`);
  }

  assertMinText(scene.visualPrompt, minHtmlScenePromptLength, `Scene ${scene.index} visualPrompt`);
  assertMinText(scene.animationPrompt, minHtmlScenePromptLength, `Scene ${scene.index} animationPrompt`);
  assertMinText(blueprint.visualMetaphor, 40, `Scene ${scene.index} htmlAnimation.visualMetaphor`);
  assertMinText(blueprint.directorPrompt, minDirectorPromptLength, `Scene ${scene.index} htmlAnimation.directorPrompt`);
  assertMinText(blueprint.cameraPrompt, minCameraPromptLength, `Scene ${scene.index} htmlAnimation.cameraPrompt`);
  assertMinText(blueprint.htmlPrompt, minHtmlExecutionPromptLength, `Scene ${scene.index} htmlAnimation.htmlPrompt`);
  assertMinText(blueprint.layerPrompt?.background, minLayerPromptLength, `Scene ${scene.index} htmlAnimation.layerPrompt.background`);
  assertMinText(blueprint.layerPrompt?.midground, minLayerPromptLength, `Scene ${scene.index} htmlAnimation.layerPrompt.midground`);
  assertMinText(blueprint.layerPrompt?.foreground, minLayerPromptLength, `Scene ${scene.index} htmlAnimation.layerPrompt.foreground`);
  assertMinText(blueprint.animationTimeline?.start, minTimelineBeatLength, `Scene ${scene.index} htmlAnimation.animationTimeline.start`);
  assertMinText(blueprint.animationTimeline?.middle, minTimelineBeatLength, `Scene ${scene.index} htmlAnimation.animationTimeline.middle`);
  assertMinText(blueprint.animationTimeline?.end, minTimelineBeatLength, `Scene ${scene.index} htmlAnimation.animationTimeline.end`);

  if ((blueprint.motionTechniques?.length ?? 0) < 3) {
    throw new Error(`Scene ${scene.index} htmlAnimation.motionTechniques must include at least 3 items`);
  }

  if ((blueprint.negativePrompt?.length ?? 0) < 5) {
    throw new Error(`Scene ${scene.index} htmlAnimation.negativePrompt must include at least 5 items`);
  }

  if ((blueprint.revisionHints?.length ?? 0) < 3) {
    throw new Error(`Scene ${scene.index} htmlAnimation.revisionHints must include at least 3 items`);
  }
}

function validateStyleConsistency(value: unknown): VideoStyleConsistency | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const style = value as Partial<VideoStyleConsistency>;
  const visualStyle = optionalText(style.visualStyle);
  const colorPalette = optionalText(style.colorPalette);
  const lighting = optionalText(style.lighting);
  const cameraLanguage = optionalText(style.cameraLanguage);
  const renderingRules = optionalText(style.renderingRules);

  if (!visualStyle || !colorPalette || !lighting || !cameraLanguage || !renderingRules) {
    return undefined;
  }

  return {
    visualStyle,
    colorPalette,
    lighting,
    cameraLanguage,
    renderingRules,
    characterDesign: optionalText(style.characterDesign),
  };
}

export function validateVideoScript(value: unknown): VideoScriptResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Video script must be an object");
  }

  const script = value as Partial<VideoScriptResult>;

  if (typeof script.title !== "string" || !script.title.trim()) {
    throw new Error("Video script title is required");
  }

  if (typeof script.summary !== "string" || !script.summary.trim()) {
    throw new Error("Video script summary is required");
  }

  if (script.mode !== "slideshow" && script.mode !== "html-animation") {
    throw new Error("Invalid video script mode");
  }

  if (typeof script.transcript !== "string" || !script.transcript.trim()) {
    throw new Error("Video script transcript is required");
  }

  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error("Video script scenes are required");
  }

  if (script.scenes.length > 80) {
    throw new Error("Video script has too many scenes");
  }

  const normalized: VideoScriptResult = {
    title: script.title.trim(),
    summary: script.summary.trim(),
    mode: script.mode,
    styleConsistency: validateStyleConsistency(script.styleConsistency),
    transcript: script.transcript.trim(),
    scenes: script.scenes.map((scene, index) => validateScene(scene, index + 1)),
  };

  if (normalized.mode === "html-animation") {
    normalized.scenes.forEach(validateHtmlAnimationDirectorDetail);
  }

  return normalized;
}
