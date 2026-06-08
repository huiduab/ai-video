import { randomUUID } from "node:crypto";
import { access, stat } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AgentMessageRole, AssetType, Prisma, TaskStatus, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { buildAgentDisplay } from "@/lib/agent/display";
import { logAiConversation } from "@/lib/agent/ai-conversation-log";
import { buildHtmlAnimationPatternAddendum } from "@/lib/agent/html-animation-patterns";
import { parseAgentJson } from "@/lib/agent/intent-validator";
import { validateAgentIntent } from "@/lib/agent/intent-validator";
import { buildStrictVisualPromptAppendix, IMAGE_PROMPT_APPENDIX } from "@/lib/agent/visual-prompt-standards";
import { prisma } from "@/lib/db";
import { readHtmlAnimationStyleExample } from "@/lib/html-animation-style-examples";
import { getHtmlAnimationStyleFromMetadata, type AnimationStyle } from "@/lib/html-animation-styles";
import { chooseHtmlAnimationTemplate, type HtmlAnimationTemplate } from "@/lib/html-animation-templates";
import { getScriptCoverImage, getScriptDurationMs } from "@/lib/storyboard-playback";
import type { AgentIntentResult, GeneratedSceneAsset, SceneGenerationState, VideoScriptResult } from "@/types/agent";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

interface SceneRevisionContext {
  userModificationRequest?: string;
  originalVisualPrompt?: string;
  originalHtmlIssueSummary?: string;
  revisedVisualPrompt?: string;
}

interface ImageGenerationResult {
  imageUrl?: string;
  imageBase64?: string;
  contentType?: string;
  providerResponse: unknown;
}

const defaultImageModel = "gpt-image-1";
const defaultImageSize = "1536x1024";
const seedream5ImageSize = "2560x1440";
const imageGenerationMinPixels = 3_686_400;
const defaultTtsModel = "qwen3-tts-flash";
const defaultTtsVoice = "Neil";
const defaultTtsFormat = "mp3";
const defaultHtmlAnimationModel = "deepseek-v4-pro";
const imageGenerationMaxAttempts = 3;
const imageGenerationRetryDelayMs = 1200;

function getDefaultImageSizeForModel(model: string) {
  const normalizedModel = model.toLowerCase();

  if (normalizedModel.startsWith("gpt-image-")) {
    return defaultImageSize;
  }

  if (normalizedModel === "dall-e-3") {
    return "1792x1024";
  }

  if (normalizedModel === "dall-e-2") {
    return "1024x1024";
  }

  return normalizedModel.includes("seedream-5-0") ? seedream5ImageSize : "2560x1440";
}

function getImageGenerationConfig() {
  const model = process.env.IMAGE_MODEL ?? defaultImageModel;
  const requestedSize = process.env.IMAGE_SIZE ?? getDefaultImageSizeForModel(model);

  return {
    apiKey: process.env.IMAGE_API_KEY ?? process.env.AI_API_KEY ?? "",
    baseUrl: (process.env.IMAGE_API_BASE_URL ?? process.env.AI_BASE_URL ?? "").trim().replace(/\/$/, ""),
    model,
    size: normalizeImageGenerationSize(requestedSize, model),
    requestedSize,
  };
}

function normalizeImageGenerationSize(size: string, model: string) {
  const trimmedSize = size.trim();
  const normalizedModel = model.toLowerCase();

  if (normalizedModel.startsWith("gpt-image-")) {
    return ["1024x1024", "1024x1536", "1536x1024"].includes(trimmedSize) ? trimmedSize : defaultImageSize;
  }

  if (normalizedModel === "dall-e-3") {
    return ["1024x1024", "1024x1792", "1792x1024"].includes(trimmedSize) ? trimmedSize : "1792x1024";
  }

  if (normalizedModel === "dall-e-2") {
    return ["256x256", "512x512", "1024x1024"].includes(trimmedSize) ? trimmedSize : "1024x1024";
  }

  const ratioMatch = trimmedSize.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);

  if (ratioMatch) {
    const widthRatio = Number.parseFloat(ratioMatch[1]);
    const heightRatio = Number.parseFloat(ratioMatch[2]);

    if (Number.isFinite(widthRatio) && Number.isFinite(heightRatio) && widthRatio > 0 && heightRatio > 0) {
      const scale = Math.sqrt(imageGenerationMinPixels / (widthRatio * heightRatio));
      return `${Math.ceil((widthRatio * scale) / 2) * 2}x${Math.ceil((heightRatio * scale) / 2) * 2}`;
    }
  }

  const dimensionMatch = trimmedSize.match(/^(\d+)x(\d+)$/i);

  if (!dimensionMatch) {
    return trimmedSize;
  }

  const width = Number.parseInt(dimensionMatch[1], 10);
  const height = Number.parseInt(dimensionMatch[2], 10);
  const pixels = width * height;

  if (pixels >= imageGenerationMinPixels) {
    return `${width}x${height}`;
  }

  const ratio = width / height;

  if (Math.abs(ratio - 16 / 9) < 0.06) {
    return seedream5ImageSize;
  }

  const scale = Math.sqrt(imageGenerationMinPixels / pixels);
  return `${Math.ceil((width * scale) / 2) * 2}x${Math.ceil((height * scale) / 2) * 2}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorCauseCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const cause = (error as { cause?: unknown }).cause;

  if (!cause || typeof cause !== "object") {
    return "";
  }

  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function isRetryableImageGenerationError(error: unknown) {
  if (error instanceof TypeError && error.message === "fetch failed") {
    return true;
  }

  return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"].includes(getErrorCauseCode(error));
}

function isRetryableImageGenerationStatus(status: number) {
  return status === 429 || status >= 500;
}

function getTtsConfig() {
  const explicitPath = process.env.AI_TTS_PATH?.trim();
  return {
    apiKey: process.env.AI_API_KEY ?? "",
    baseUrl: (process.env.AI_BASE_URL ?? "").trim().replace(/\/$/, ""),
    model: process.env.AI_TTS_MODEL ?? defaultTtsModel,
    voice: process.env.AI_TTS_VOICE ?? defaultTtsVoice,
    responseFormat: process.env.AI_TTS_RESPONSE_FORMAT ?? defaultTtsFormat,
    paths: explicitPath ? [normalizeEndpointPath(explicitPath)] : ["/audio/speech", "/tts"],
  };
}

function getHtmlAnimationConfig() {
  return {
    apiKey: process.env.HTML_API_KEY ?? process.env.AI_HTML_ANIMATION_API_KEY ?? process.env.AI_API_KEY ?? "",
    baseUrl: (process.env.HTML_API_BASE_URL ?? process.env.AI_HTML_ANIMATION_BASE_URL ?? process.env.AI_BASE_URL ?? "").trim().replace(/\/$/, ""),
    model: process.env.HTML_MODEL ?? process.env.AI_HTML_ANIMATION_MODEL ?? defaultHtmlAnimationModel,
  };
}

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildImageAssetState(asset: GeneratedSceneAsset, current?: SceneGenerationState): SceneGenerationState {
  return {
    image: asset,
    audio: current?.audio ?? {
      status: "idle",
    },
  };
}

function buildHtmlAssetState(asset: GeneratedSceneAsset & { code?: string }, current?: SceneGenerationState): SceneGenerationState {
  return {
    image: current?.image,
    html: asset,
    audio: current?.audio ?? {
      status: "idle",
    },
  };
}

function buildAudioAssetState(asset: GeneratedSceneAsset, current?: SceneGenerationState): SceneGenerationState {
  return {
    image: current?.image,
    html: current?.html,
    audio: asset,
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function mergeProjectMetadata(metadata: unknown, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return {
    ...base,
    ...patch,
  } as Prisma.InputJsonValue;
}

async function updateProjectSummaryFromScript(projectId: string, script: VideoScriptResult) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { metadata: true },
  });

  if (!project) {
    return;
  }

  const coverImage = getScriptCoverImage(script);
  const metadataPatch: Record<string, unknown> = {};

  if (coverImage?.url) {
    metadataPatch.coverImageUrl = coverImage.url;
  }

  if (coverImage?.assetId) {
    metadataPatch.coverImageAssetId = coverImage.assetId;
  }

  const coverHtml = script.scenes.find((scene) => scene.generation?.html?.url)?.generation?.html;

  if (coverHtml?.url) {
    metadataPatch.coverHtmlUrl = coverHtml.url;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      title: script.title,
      durationMs: getScriptDurationMs(script),
      thumbnailAssetId: coverImage?.assetId,
      metadata: mergeProjectMetadata(project.metadata, metadataPatch),
    },
  });
}

function normalizeEndpointPath(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

function buildAbsoluteEndpointUrl(baseUrl: string, endpointPath: string) {
  const url = `${baseUrl.trim().replace(/\/$/, "")}${normalizeEndpointPath(endpointPath)}`;

  try {
    return new URL(url).toString();
  } catch {
    throw new Error(`Invalid endpoint URL: ${url}`);
  }
}

function buildStyleConsistencyPrompt(style: VideoScriptResult["styleConsistency"]) {
  if (!style) {
    return "";
  }

  return [
    "Global visual consistency constraints:",
    `Visual style: ${style.visualStyle}`,
    `Color palette: ${style.colorPalette}`,
    `Lighting: ${style.lighting}`,
    `Camera language: ${style.cameraLanguage}`,
    style.characterDesign ? `Character or subject design: ${style.characterDesign}` : "",
    `Rendering rules: ${style.renderingRules}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeSceneRevisionContext(value: unknown): SceneRevisionContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const item = value as Record<string, unknown>;

  return {
    userModificationRequest: typeof item.userModificationRequest === "string" ? item.userModificationRequest : undefined,
    originalVisualPrompt: typeof item.originalVisualPrompt === "string" ? item.originalVisualPrompt : undefined,
    originalHtmlIssueSummary: typeof item.originalHtmlIssueSummary === "string" ? item.originalHtmlIssueSummary : undefined,
    revisedVisualPrompt: typeof item.revisedVisualPrompt === "string" ? item.revisedVisualPrompt : undefined,
  };
}

function buildImagePrompt(scene: VideoScriptResult["scenes"][number], style?: VideoScriptResult["styleConsistency"], revisionContext?: SceneRevisionContext) {
  return [
    buildStyleConsistencyPrompt(style),
    revisionContext
      ? [
          "Single-scene regeneration context:",
          `User change request: ${revisionContext.userModificationRequest ?? ""}`,
          `Original visual prompt: ${revisionContext.originalVisualPrompt ?? ""}`,
          `Previous HTML issue summary: ${revisionContext.originalHtmlIssueSummary ?? ""}`,
          `Revised visual prompt: ${revisionContext.revisedVisualPrompt ?? ""}`,
          "Only redraw the current scene. Do not change other scenes.",
        ].join("\n")
      : "",
    scene.visualPrompt,
    IMAGE_PROMPT_APPENDIX,
    "16:9 cinematic storyboard frame, high quality, clean composition, consistent art direction across all scenes",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHtmlAnimationSystemPrompt() {
  const strictVisualPromptAppendix = buildStrictVisualPromptAppendix("html-animation");

  return `
You are a web animation engineer. Return only one valid JSON object: { "html": "<!doctype html>..." }.
Build one self-contained 16:9 HTML animation for the current scene.
Rules:
1. Include complete doctype/html/head/style/body/script markup inside the html string.
2. Use local HTML/CSS/SVG/JS/Canvas. The only allowed external resource is GSAP CDN.
3. Do not use remote fonts, remote images, fetch, parent/window.top, localStorage, cookies, alert, prompt, or confirm.
4. Do not render the full narration. Use short labels, keywords, diagrams, and annotations.
5. Keep the bottom 18% free for external subtitles and player controls.
6. Follow styleConsistency, htmlAnimationStyleRule, htmlAnimationTemplate, htmlAnimationPatterns, currentScene.htmlAnimation, and strictVisualPromptAppendix.
7. If previousSceneContext or nextSceneContext is provided, use only its style summary, color hint, motion rhythm, and transition intent. Do not expect full neighboring HTML source.
8. Use fixed 16:9 stage layout with overflow hidden and a clear .mw-stage root.
9. Keep key elements from overlapping in final and intermediate animation states.
10. Implement motionweave:play, motionweave:pause, and motionweave:seek message listeners when possible.
11. currentScene.htmlAnimation.htmlPrompt is the primary execution brief. Do not mix other scene stories into this scene.

Strict visual prompt appendix:
${strictVisualPromptAppendix}
`;
}

function buildHtmlAnimationTemplateMessage(template: HtmlAnimationTemplate) {
  return {
    role: "user" as const,
    content: JSON.stringify({
      messageType: "htmlAnimationTemplate",
      instruction: "Use this template for layout, safe areas, and motion rules.",
      htmlAnimationTemplate: template,
    }),
  };
}

function buildHtmlAnimationResponseContractMessage() {
  return {
    role: "user" as const,
    content: JSON.stringify({
      messageType: "htmlAnimationResponseContract",
      instruction: "Return exactly one JSON object. Do not return raw HTML, Markdown, or explanation text.",
      requiredShape: {
        html: "<!doctype html><html><head><style>...</style></head><body><main class=\"mw-stage\">...</main></body></html>",
      },
      invalidOutputs: [
        "<!doctype html>{ \"html\": \"...\" }",
        "```html\n<!doctype html>...\n```",
        "<html>...</html>",
        "{ \"code\": \"...\" }",
      ],
      finalCheck: "Before sending, confirm the first non-whitespace character is { and the only top-level field is html.",
    }),
  };
}

function buildHtmlAnimationStyleMessages(style: AnimationStyle, exampleHtml: string) {
  return [
    {
      role: "user" as const,
      content: JSON.stringify({
        messageType: "htmlAnimationStyleRule",
        instruction: "Follow this animation style rule first.",
        htmlAnimationStyleRule: {
          id: style.id,
          name: style.name,
          description: style.description,
          prompt: style.prompt,
        },
      }),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        messageType: "htmlAnimationStyleExample",
        instruction: "This is a style example for visual language only. Do not copy its text or return it as the final HTML.",
        styleId: style.id,
        htmlAnimationStyleExample: exampleHtml,
      }),
    },
  ];
}

function buildNeighborSceneContext(scene: VideoScriptResult["scenes"][number] | undefined, relation: "previous" | "next") {
  if (!scene) {
    return null;
  }

  return {
    relation,
    index: scene.index,
    title: scene.title,
    visualStyleSummary: scene.htmlAnimation?.visualMetaphor ?? scene.visualPrompt,
    colorAndTextureHint: scene.animationPrompt ?? scene.visualPrompt,
    motionRhythm: scene.htmlAnimation?.motionBeats?.map((beat) => beat.action).join(" -> ") ?? scene.htmlAnimation?.directorPrompt ?? "",
    transitionIntent: scene.htmlAnimation?.transitionIntent ?? "",
  };
}

function buildHtmlAnimationUserContent({
  script,
  sceneIndex,
  htmlAnimationStyle,
  revisionContext,
}: {
  script: VideoScriptResult;
  sceneIndex: number;
  htmlAnimationStyle: AnimationStyle;
  revisionContext?: SceneRevisionContext;
}) {
  const scene = script.scenes.find((item) => item.index === sceneIndex);
  const template = scene ? chooseHtmlAnimationTemplate(scene) : chooseHtmlAnimationTemplate({ index: sceneIndex, title: "", narration: "", visualPrompt: "" });
  const patternAddendum = scene
    ? buildHtmlAnimationPatternAddendum(`${script.title} ${script.summary} ${scene.title} ${scene.narration} ${scene.visualPrompt} ${scene.animationPrompt ?? ""}`)
    : buildHtmlAnimationPatternAddendum(`${script.title} ${script.summary}`);
  const previousScene = [...script.scenes].reverse().find((item) => item.index < sceneIndex);
  const nextScene = script.scenes.find((item) => item.index > sceneIndex);

  return JSON.stringify({
    mode: "html-animation",
    videoTitle: script.title,
    summary: script.summary,
    styleConsistency: script.styleConsistency,
    htmlAnimationStyle: {
      id: htmlAnimationStyle.id,
      name: htmlAnimationStyle.name,
      description: htmlAnimationStyle.description,
      prompt: htmlAnimationStyle.prompt,
    },
    currentScene: scene
      ? {
          index: scene.index,
          title: scene.title,
          narration: scene.narration,
          visualPrompt: scene.visualPrompt,
          animationPrompt: scene.animationPrompt ?? scene.visualPrompt,
          htmlAnimation: scene.htmlAnimation,
          directorExecutionPrompt: scene.htmlAnimation?.htmlPrompt ?? scene.animationPrompt ?? scene.visualPrompt,
          directorNegativePrompt: scene.htmlAnimation?.negativePrompt ?? [],
          directorMotionTechniques: scene.htmlAnimation?.motionTechniques ?? [],
          selectedTemplate: template,
          durationMs: scene.durationMs,
        }
      : null,
    sceneRevisionContext: revisionContext
      ? {
          instruction:
            "Single-scene HTML regeneration. Apply the user change visibly in this scene only. The old HTML source is not provided; use the issue summary only to avoid repeating layout defects.",
          userModificationRequest: revisionContext.userModificationRequest,
          originalVisualPrompt: revisionContext.originalVisualPrompt,
          originalHtmlIssueSummary: revisionContext.originalHtmlIssueSummary,
          revisedVisualPrompt: revisionContext.revisedVisualPrompt,
        }
      : null,
    htmlAnimationTemplate: template,
    htmlAnimationPatterns: patternAddendum,
    strictVisualPromptAppendix: buildStrictVisualPromptAppendix("html-animation"),
    layoutContract: {
      stage: "Use a single fixed 16:9 stage with overflow hidden. Prefer .mw-stage as the root visual container.",
      zones: ["title-zone: top 8%-20%", "main-zone: center 24%-74%", "accent-zone: sides or corners", "caption-safe-zone: bottom 18%, no core content"],
      typography: "Use clamp() with max-width and line-height. Use short labels, not narration paragraphs.",
      motion: "Follow currentScene.htmlAnimation.motionBeats when present. Keep a clear focus path and at least three animated layers.",
      playbackProtocol: "Implement safe postMessage listeners for motionweave:play, motionweave:pause and motionweave:seek.",
    },
    previousSceneContext: buildNeighborSceneContext(previousScene, "previous"),
    nextSceneContext: buildNeighborSceneContext(nextScene, "next"),
    output: {
      html: "Return a complete single-file HTML string",
    },
  });
}

function injectHtmlAnimationRuntime(html: string, durationMs?: number) {
  const runtime = `
<style id="motionweave-runtime-guard">
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  body {
    min-width: 0;
  }

  .mw-stage, [data-motionweave-stage] {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    box-sizing: border-box;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .caption-safe-zone, [data-caption-safe-zone] {
    pointer-events: none;
  }
</style>
<script id="motionweave-runtime-bridge">
  (() => {
    const durationMs = ${Math.max(durationMs ?? 5000, 1000)};
    const animations = () => document.getAnimations ? document.getAnimations({ subtree: true }) : [];
    window.addEventListener("message", (event) => {
      const data = event.data || {};
      if (!data || typeof data.type !== "string" || !data.type.startsWith("motionweave:")) return;
      if (data.type === "motionweave:play") {
        animations().forEach((animation) => animation.play());
      }
      if (data.type === "motionweave:pause") {
        animations().forEach((animation) => animation.pause());
      }
      if (data.type === "motionweave:seek") {
        const timeMs = Number.isFinite(data.timeMs) ? Math.max(0, Math.min(data.timeMs, durationMs)) : 0;
        animations().forEach((animation) => {
          animation.currentTime = timeMs;
        });
      }
    });
  })();
</script>`;

  if (html.includes("motionweave-runtime-bridge")) {
    return html;
  }

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${runtime}\n</head>`);
  }

  return html.replace(/<body([^>]*)>/i, `<body$1>\n${runtime}`);
}

function validateHtmlAnimationSafety(html: string) {
  const lowerHtml = html.toLowerCase();
  const failures: string[] = [];
  const remoteResourceMatches = Array.from(html.matchAll(/\s(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)).map((match) => match[1]);
  const disallowedRemoteResources = remoteResourceMatches.filter((url) => !/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/3\.\d+\.\d+\/gsap(?:\.min)?\.js$/i.test(url));

  if (/^\s*<!doctype html>\s*[{[]/i.test(html) || /"html"\s*:\s*"<!doctype html/i.test(html) || /"html"\s*:\s*"<html/i.test(html)) {
    failures.push("HTML animation response wrapper was written into the HTML file");
  }

  if (!lowerHtml.includes("<html") || !lowerHtml.includes("<body")) {
    failures.push("HTML must include html and body tags");
  }

  if (disallowedRemoteResources.length > 0 || /@import\s+url\(["']?https?:\/\//i.test(html)) {
    failures.push("HTML animation must not load remote resources except GSAP CDN");
  }

  if (/\b(window\.top|window\.parent|parent\.|top\.|localStorage|document\.cookie|alert\s*\(|prompt\s*\(|confirm\s*\()/i.test(html)) {
    failures.push("HTML animation contains forbidden browser API usage");
  }

  if (!/overflow\s*:\s*hidden/i.test(html)) {
    failures.push("HTML animation must explicitly hide overflow");
  }

  if (!/motionweave-runtime-bridge/i.test(html)) {
    failures.push("HTML animation runtime bridge was not injected");
  }

  if (failures.length > 0) {
    throw new Error(`HTML animation QA failed: ${failures.join("; ")}`);
  }
}

function normalizeHtmlResponseText(value: string) {
  return value
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isHtmlDocument(value: string) {
  const lowerValue = value.toLowerCase();
  return lowerValue.startsWith("<!doctype html") || lowerValue.startsWith("<html");
}

function normalizeGeneratedHtml(value: unknown, durationMs?: number) {
  const rawText = typeof value === "string" ? normalizeHtmlResponseText(value) : "";
  const payload =
    rawText && (rawText.startsWith("{") || rawText.startsWith("["))
      ? parseAgentJson(rawText)
      : rawText && isHtmlDocument(rawText)
        ? { html: rawText }
        : typeof value === "string"
          ? parseAgentJson(value)
          : value;
  const html = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { html?: unknown }).html : undefined;

  if (typeof html !== "string" || !html.trim()) {
    throw new Error("HTML animation response must include html");
  }

  const trimmed = html.trim();
  const normalized = trimmed.toLowerCase().startsWith("<!doctype html") ? trimmed : `<!doctype html>\n${trimmed}`;
  const withRuntime = injectHtmlAnimationRuntime(normalized, durationMs);
  validateHtmlAnimationSafety(withRuntime);
  return withRuntime;
}

async function callHtmlAnimationModel({
  baseUrl,
  apiKey,
  model,
  script,
  sceneIndex,
  htmlAnimationStyle,
  htmlAnimationStyleExample,
  revisionContext,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  script: VideoScriptResult;
  sceneIndex: number;
  htmlAnimationStyle: AnimationStyle;
  htmlAnimationStyleExample: string;
  revisionContext?: SceneRevisionContext;
}) {
  const scene = script.scenes.find((item) => item.index === sceneIndex);
  const template = scene ? chooseHtmlAnimationTemplate(scene) : chooseHtmlAnimationTemplate({ index: sceneIndex, title: "", narration: "", visualPrompt: "" });
  const requestId = randomUUID();
  const requestBody = {
    model,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildHtmlAnimationSystemPrompt() },
      ...buildHtmlAnimationStyleMessages(htmlAnimationStyle, htmlAnimationStyleExample),
      buildHtmlAnimationTemplateMessage(template),
      buildHtmlAnimationResponseContractMessage(),
      { role: "user", content: buildHtmlAnimationUserContent({ script, sceneIndex, htmlAnimationStyle, revisionContext }) },
    ],
  };

  await logAiConversation({
    requestId,
    stage: "html-animation",
    event: "request",
    model,
    baseUrl,
    payload: {
      sceneIndex,
      body: requestBody,
    },
  });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: unknown;
  };

  if (!response.ok) {
    await logAiConversation({
      requestId,
      stage: "html-animation",
      event: "error",
      model,
      baseUrl,
      payload: {
        sceneIndex,
        status: response.status,
        body: payload,
      },
    });
    throw new Error(extractOpenAiCompatibleError(payload, `HTML animation request failed: ${response.status}`));
  }

  const content = payload.choices?.[0]?.message?.content;
  const html = normalizeGeneratedHtml(content, scene?.durationMs);

  await logAiConversation({
    requestId,
    stage: "html-animation",
    event: "response",
    model,
    baseUrl,
    payload: {
      sceneIndex,
      contentPreview: typeof content === "string" ? content.slice(0, 4000) : content,
      contentChars: typeof content === "string" ? content.length : 0,
      normalizedHtmlChars: html.length,
    },
  });

  return html;
}

async function loadProjectHtmlAnimationStyle(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { metadata: true },
  });

  return getHtmlAnimationStyleFromMetadata(project?.metadata);
}

async function callOpenAiCompatibleImageGeneration({
  baseUrl,
  apiKey,
  model,
  prompt,
  size,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
}): Promise<ImageGenerationResult> {
  let response: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= imageGenerationMaxAttempts; attempt++) {
    try {
      response = await fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
        }),
      });

      if (response.ok || attempt >= imageGenerationMaxAttempts || !isRetryableImageGenerationStatus(response.status)) {
        break;
      }

      await sleep(imageGenerationRetryDelayMs * attempt);
      break;
    } catch (error) {
      lastError = error;

      if (attempt >= imageGenerationMaxAttempts || !isRetryableImageGenerationError(error)) {
        break;
      }

      await sleep(imageGenerationRetryDelayMs * attempt);
    }
  }

  if (!response) {
    const code = getErrorCauseCode(lastError);
    throw new Error(`图片生成服务连接失败${code ? `（${code}）` : ""}，请稍后重试或检查 IMAGE_API_BASE_URL 网络连通性`);
  }

  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new Error(extractOpenAiCompatibleError(payload, `Image generation request failed: ${response.status}`));
  }

  const parsed = parseImageGenerationPayload(payload);

  if (!parsed.imageUrl && !parsed.imageBase64) {
    throw new Error("Image generation response did not contain image url or b64_json");
  }

  return {
    ...parsed,
    providerResponse: payload,
  };
}

async function saveRemoteImage({
  imageUrl,
  projectId,
  sceneIndex,
}: {
  imageUrl: string;
  projectId: string;
  sceneIndex: number;
}) {
  const response = await fetch(imageUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Generated image download failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  const extension = extensionFromContentType(contentType) ?? extensionFromUrl(imageUrl) ?? "png";
  const fileName = `scene-${sceneIndex}-${Date.now()}-${randomUUID()}.${extension}`;
  const relativePath = `/generated/storyboards/${projectId}/${fileName}`;
  const outputDir = path.join(process.cwd(), "public", "generated", "storyboards", projectId);
  const outputPath = path.join(outputDir, fileName);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, bytes);

  return {
    contentType,
    fileName,
    sizeBytes: bytes.byteLength,
    storageKey: path.join("public", "generated", "storyboards", projectId, fileName).replace(/\\/g, "/"),
    url: relativePath,
  };
}

async function saveGeneratedImage({
  result,
  projectId,
  sceneIndex,
}: {
  result: ImageGenerationResult;
  projectId: string;
  sceneIndex: number;
}) {
  if (result.imageUrl) {
    return saveRemoteImage({ imageUrl: result.imageUrl, projectId, sceneIndex });
  }

  if (!result.imageBase64) {
    throw new Error("Generated image result is empty");
  }

  const bytes = Buffer.from(result.imageBase64, "base64");
  const contentType = result.contentType ?? "image/png";
  const extension = extensionFromContentType(contentType) ?? "png";
  const fileName = `scene-${sceneIndex}-${Date.now()}-${randomUUID()}.${extension}`;
  const relativePath = `/generated/storyboards/${projectId}/${fileName}`;
  const outputDir = path.join(process.cwd(), "public", "generated", "storyboards", projectId);
  const outputPath = path.join(outputDir, fileName);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, bytes);

  return {
    contentType,
    fileName,
    sizeBytes: bytes.byteLength,
    storageKey: path.join("public", "generated", "storyboards", projectId, fileName).replace(/\\/g, "/"),
    url: relativePath,
  };
}

async function saveAudioBytes({
  audioBytes,
  contentType,
  projectId,
  sceneIndex,
  extensionHint,
}: {
  audioBytes: Buffer;
  contentType: string;
  projectId: string;
  sceneIndex: number;
  extensionHint?: string;
}) {
  const extension = extensionFromContentType(contentType) ?? extensionHint ?? defaultTtsFormat;
  const fileName = `scene-${sceneIndex}-narration-${Date.now()}-${randomUUID()}.${extension}`;
  const relativePath = `/generated/storyboards/${projectId}/${fileName}`;
  const outputDir = path.join(process.cwd(), "public", "generated", "storyboards", projectId);
  const outputPath = path.join(outputDir, fileName);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, audioBytes);

  return {
    contentType,
    fileName,
    sizeBytes: audioBytes.byteLength,
    storageKey: path.join("public", "generated", "storyboards", projectId, fileName).replace(/\\/g, "/"),
    url: relativePath,
  };
}

async function saveHtmlFile({
  html,
  projectId,
  sceneIndex,
}: {
  html: string;
  projectId: string;
  sceneIndex: number;
}) {
  const bytes = Buffer.from(html, "utf8");
  const fileName = `scene-${sceneIndex}-animation-${Date.now()}-${randomUUID()}.html`;
  const relativePath = `/generated/storyboards/${projectId}/${fileName}`;
  const outputDir = path.join(process.cwd(), "public", "generated", "storyboards", projectId);
  const outputPath = path.join(outputDir, fileName);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, bytes);

  return {
    contentType: "text/html; charset=utf-8",
    fileName,
    sizeBytes: bytes.byteLength,
    storageKey: path.join("public", "generated", "storyboards", projectId, fileName).replace(/\\/g, "/"),
    url: relativePath,
  };
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "jpg";
  }

  if (contentType.includes("png")) {
    return "png";
  }

  if (contentType.includes("webp")) {
    return "webp";
  }

  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return "mp3";
  }

  if (contentType.includes("wav") || contentType.includes("wave")) {
    return "wav";
  }

  if (contentType.includes("ogg")) {
    return "ogg";
  }

  if (contentType.includes("aac")) {
    return "aac";
  }

  return null;
}

function extensionFromUrl(value: string) {
  try {
    const extension = new URL(value).pathname.split(".").pop()?.toLowerCase();
    return extension && ["jpg", "jpeg", "png", "webp", "mp3", "wav", "ogg", "aac"].includes(extension) ? (extension === "jpeg" ? "jpg" : extension) : null;
  } catch {
    return null;
  }
}

async function callTts({
  baseUrl,
  apiKey,
  model,
  voice,
  responseFormat,
  paths,
  text,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  responseFormat: string;
  paths: string[];
  text: string;
}) {
  const errors: string[] = [];

  for (const endpointPath of paths) {
    const isOpenAiSpeechPath = endpointPath.includes("audio/speech");
    const requestBody = isOpenAiSpeechPath
      ? {
          model,
          voice,
          input: text,
          response_format: responseFormat,
        }
      : {
          model,
          voice,
          text,
        };

    const response = await fetch(buildAbsoluteEndpointUrl(baseUrl, endpointPath), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: isOpenAiSpeechPath ? "audio/*,application/json" : "application/json,audio/*",
      },
      body: JSON.stringify(requestBody),
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      errors.push(`${endpointPath}: ${await extractResponseError(response, `TTS request failed: ${response.status}`)}`);
      continue;
    }

    if (!contentType.includes("application/json")) {
      const providerResponse = {
          endpointPath,
          responseMode: "binary",
        };
      const bytes = Buffer.from(await response.arrayBuffer());

      try {
        const usableAudio = ensureUsableAudioResult(bytes, contentType || contentTypeFromAudioFormat(responseFormat), providerResponse);

        return {
          ...usableAudio,
          durationMs: undefined,
        };
      } catch (error) {
        errors.push(`${endpointPath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    const payload = (await response.json().catch(() => ({}))) as unknown;
    const parsed = parseTtsJsonPayload(payload);

    if (parsed.audioUrl) {
      const audioResponse = await fetch(parsed.audioUrl, { cache: "no-store" });

      if (!audioResponse.ok) {
        throw new Error(`Generated audio download failed: ${audioResponse.status}`);
      }

      const providerResponse = {
          endpointPath,
          responseMode: "json-url",
          payload,
          audioUrl: parsed.audioUrl,
        };
      const bytes = Buffer.from(await audioResponse.arrayBuffer());

      try {
        const usableAudio = ensureUsableAudioResult(bytes, audioResponse.headers.get("content-type") ?? contentTypeFromAudioFormat(responseFormat), providerResponse);

        return {
          ...usableAudio,
          durationMs: parsed.durationMs,
        };
      } catch (error) {
        errors.push(`${endpointPath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    if (parsed.audioBase64) {
      const providerResponse = {
          endpointPath,
          responseMode: "json-base64",
          payload,
        };
      const bytes = Buffer.from(parsed.audioBase64, "base64");

      try {
        const usableAudio = ensureUsableAudioResult(bytes, parsed.contentType ?? contentTypeFromAudioFormat(responseFormat), providerResponse);

        return {
          ...usableAudio,
          durationMs: parsed.durationMs,
        };
      } catch (error) {
        errors.push(`${endpointPath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    errors.push(`${endpointPath}: TTS response did not contain audio data`);
  }

  throw new Error(errors.length > 0 ? `TTS request failed: ${errors.join(" | ")}` : "TTS request failed");
}

async function extractResponseError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return extractOpenAiCompatibleError(await response.json().catch(() => ({})), fallback);
  }

  const text = await response.text().catch(() => "");
  return text ? `${fallback}: ${text.slice(0, 500)}` : fallback;
}

function parseTtsJsonPayload(payload: unknown) {
  const objectPayload = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const audio = objectPayload.audio && typeof objectPayload.audio === "object" ? (objectPayload.audio as Record<string, unknown>) : {};
  const output = objectPayload.output && typeof objectPayload.output === "object" ? (objectPayload.output as Record<string, unknown>) : {};
  const outputAudio = output.audio && typeof output.audio === "object" ? (output.audio as Record<string, unknown>) : {};
  const metadata = objectPayload.metadata && typeof objectPayload.metadata === "object" ? (objectPayload.metadata as Record<string, unknown>) : {};
  const url = typeof audio.url === "string" ? audio.url : typeof outputAudio.url === "string" ? outputAudio.url : undefined;
  const data = typeof audio.data === "string" ? audio.data : typeof outputAudio.data === "string" ? outputAudio.data : undefined;
  const durationSeconds = typeof metadata.duration === "number" ? metadata.duration : typeof outputAudio.duration === "number" ? outputAudio.duration : undefined;
  const contentType = typeof audio.mime_type === "string" ? audio.mime_type : typeof outputAudio.mime_type === "string" ? outputAudio.mime_type : undefined;

  return {
    audioUrl: url,
    audioBase64: data,
    contentType,
    durationMs: typeof durationSeconds === "number" && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : undefined,
  };
}

function contentTypeFromAudioFormat(format: string) {
  if (format === "wav") {
    return "audio/wav";
  }

  if (format === "ogg") {
    return "audio/ogg";
  }

  if (format === "aac") {
    return "audio/aac";
  }

  return "audio/mpeg";
}

function hasAudioMagicBytes(bytes: Buffer) {
  if (bytes.length < 12) {
    return false;
  }

  const start3 = bytes.subarray(0, 3).toString("ascii");
  const start4 = bytes.subarray(0, 4).toString("ascii");
  const wave = bytes.subarray(8, 12).toString("ascii");

  return (
    start3 === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    (start4 === "RIFF" && wave === "WAVE") ||
    start4 === "OggS" ||
    start4 === "fLaC"
  );
}

function ensureUsableAudioResult(bytes: Buffer, contentType: string, providerResponse: unknown) {
  const isAudioContentType = contentType.toLowerCase().startsWith("audio/");

  if (bytes.byteLength < 128 || (!isAudioContentType && !hasAudioMagicBytes(bytes))) {
    const preview = bytes.subarray(0, 80).toString("utf8").replace(/\s+/g, " ").trim();
    throw new Error(
      `TTS response is not usable audio: content-type=${contentType || "unknown"}, bytes=${bytes.byteLength}${
        preview ? `, preview=${JSON.stringify(preview)}` : ""
      }`,
    );
  }

  return {
    bytes,
    contentType: isAudioContentType ? contentType : "audio/mpeg",
    providerResponse,
  };
}

function parseImageGenerationPayload(payload: unknown) {
  const objectPayload = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = Array.isArray(objectPayload.data) ? objectPayload.data : [];
  const firstItem = data[0] && typeof data[0] === "object" ? (data[0] as Record<string, unknown>) : {};
  const image = objectPayload.image && typeof objectPayload.image === "object" ? (objectPayload.image as Record<string, unknown>) : {};
  const output = objectPayload.output && typeof objectPayload.output === "object" ? (objectPayload.output as Record<string, unknown>) : {};
  const outputImage = output.image && typeof output.image === "object" ? (output.image as Record<string, unknown>) : {};
  const imageUrl =
    typeof firstItem.url === "string"
      ? firstItem.url
      : typeof image.url === "string"
        ? image.url
        : typeof outputImage.url === "string"
          ? outputImage.url
          : undefined;
  const imageBase64 =
    typeof firstItem.b64_json === "string"
      ? firstItem.b64_json
      : typeof firstItem.data === "string"
        ? firstItem.data
        : typeof image.b64_json === "string"
          ? image.b64_json
          : typeof outputImage.b64_json === "string"
            ? outputImage.b64_json
            : undefined;
  const contentType =
    typeof firstItem.mime_type === "string"
      ? firstItem.mime_type
      : typeof image.mime_type === "string"
        ? image.mime_type
        : typeof outputImage.mime_type === "string"
          ? outputImage.mime_type
          : undefined;

  return {
    imageUrl,
    imageBase64,
    contentType,
  };
}

function extractOpenAiCompatibleError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const error = (payload as { error?: unknown }).error;

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" && message ? message : fallback;
  }

  return fallback;
}

async function generatedPublicUrlExists(url: string | undefined, minSizeBytes = 1) {
  if (!url) {
    return false;
  }

  if (url.startsWith("data:")) {
    return true;
  }

  if (!url.startsWith("/generated/")) {
    return true;
  }

  const relativePath = url.replace(/^\/+/, "").split(/[?#]/)[0];

  try {
    const filePath = path.join(process.cwd(), "public", relativePath);
    await access(filePath);
    const fileStat = await stat(filePath);
    return fileStat.size >= minSizeBytes;
  } catch {
    return false;
  }
}

async function normalizeMissingGeneratedAssets(script: VideoScriptResult) {
  const scenes = await Promise.all(
    script.scenes.map(async (scene) => {
      const image = scene.generation?.image;
      const html = scene.generation?.html;
      const audio = scene.generation?.audio;
      const [imageOk, htmlOk, audioOk] = await Promise.all([
        image?.status === "succeeded" && image.url ? generatedPublicUrlExists(image.url) : Promise.resolve(true),
        html?.status === "succeeded" && html.url ? generatedPublicUrlExists(html.url) : Promise.resolve(true),
        audio?.status === "succeeded" && audio.url ? generatedPublicUrlExists(audio.url, 128) : Promise.resolve(true),
      ]);

      if (imageOk && htmlOk && audioOk) {
        return scene;
      }

      return {
        ...scene,
        generation: {
          ...scene.generation,
          image:
            image && !imageOk
              ? {
                  ...image,
                  status: "failed" as const,
                  url: undefined,
                  error: "Local generated file is missing. Please regenerate.",
                }
              : image,
          html:
            html && !htmlOk
              ? {
                  ...html,
                  status: "failed" as const,
                  url: undefined,
                  error: "Local generated file is missing. Please regenerate.",
                }
              : html,
          audio:
            audio && !audioOk
              ? {
                  ...audio,
                  status: "failed" as const,
                  url: undefined,
                  error: "Local generated file is missing. Please regenerate.",
                }
              : audio,
        },
      };
    }),
  );

  return {
    ...script,
    scenes,
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      messageId?: unknown;
      sceneIndex?: unknown;
      kind?: unknown;
      force?: unknown;
      revisionContext?: unknown;
    };
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const sceneIndex = typeof body.sceneIndex === "number" ? body.sceneIndex : 0;
    const kind = typeof body.kind === "string" ? body.kind : "image";
    const force = body.force === true;
    const revisionContext = normalizeSceneRevisionContext(body.revisionContext);

    if (!messageId || sceneIndex <= 0) {
      return NextResponse.json({ error: "Message id and scene index are required" }, { status: 400 });
    }

    if (kind !== "image" && kind !== "html" && kind !== "audio") {
      return NextResponse.json({ error: "Asset kind must be image, html or audio" }, { status: 400 });
    }

    const message = await prisma.agentMessage.findFirst({
      where: {
        id: messageId,
        projectId,
        role: AgentMessageRole.ASSISTANT,
        intentJson: { not: Prisma.JsonNull },
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Generated storyboard not found" }, { status: 404 });
    }

    const currentIntent = validateAgentIntent(message.intentJson);
    const rawScript = currentIntent.payload.generatedScript;

    if (!rawScript) {
      return NextResponse.json({ error: "Message does not contain generated storyboard" }, { status: 400 });
    }

    const script = await normalizeMissingGeneratedAssets(rawScript);
    const scene = script.scenes.find((item) => item.index === sceneIndex);

    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    if (kind === "image" && !force && scene.generation?.image?.status === "succeeded" && scene.generation.image.url && (await generatedPublicUrlExists(scene.generation.image.url))) {
      await updateProjectSummaryFromScript(projectId, script);
      return NextResponse.json({ scene, asset: scene.generation.image, skipped: true });
    }

    if (kind === "audio" && !force && scene.generation?.audio?.status === "succeeded" && scene.generation.audio.url && (await generatedPublicUrlExists(scene.generation.audio.url, 128))) {
      await updateProjectSummaryFromScript(projectId, script);
      return NextResponse.json({ scene, asset: scene.generation.audio, skipped: true });
    }

    if (kind === "html" && !force && scene.generation?.html?.status === "succeeded" && scene.generation.html.url && (await generatedPublicUrlExists(scene.generation.html.url))) {
      await updateProjectSummaryFromScript(projectId, script);
      return NextResponse.json({ scene, asset: scene.generation.html, skipped: true });
    }

    if (kind === "audio") {
      const config = getTtsConfig();

      if (!config.baseUrl || !config.apiKey) {
        return NextResponse.json({ error: "AI_BASE_URL and AI_API_KEY are required for narration audio generation" }, { status: 500 });
      }

      const task = await prisma.generationTask.create({
        data: {
          projectId,
          type: TaskType.GENERATE_ASSET,
          status: TaskStatus.RUNNING,
          progress: 10,
          startedAt: new Date(),
          input: {
            provider: "ai-tts",
            baseUrl: config.baseUrl,
            paths: config.paths,
            model: config.model,
            voice: config.voice,
            responseFormat: config.responseFormat,
            messageId,
            sceneIndex,
            kind: "audio",
            text: scene.narration,
          },
        },
      });

      try {
        const ttsResult = await callTts({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          voice: config.voice,
          responseFormat: config.responseFormat,
          paths: config.paths,
          text: scene.narration,
        });
        const savedAudio = await saveAudioBytes({
          audioBytes: ttsResult.bytes,
          contentType: ttsResult.contentType,
          projectId,
          sceneIndex,
          extensionHint: config.responseFormat,
        });
        const asset = await prisma.asset.create({
          data: {
            projectId,
            type: AssetType.AUDIO,
            url: savedAudio.url,
            storageKey: savedAudio.storageKey,
            mimeType: savedAudio.contentType,
            durationMs: ttsResult.durationMs,
            sizeBytes: BigInt(savedAudio.sizeBytes),
            metadata: toInputJson({
              provider: "ai-tts",
              model: config.model,
              voice: config.voice,
              responseFormat: config.responseFormat,
              messageId,
              sceneIndex,
              text: scene.narration,
              fileName: savedAudio.fileName,
              providerResponse: ttsResult.providerResponse,
            }),
          },
        });

        const audioState: GeneratedSceneAsset = {
          status: "succeeded",
          assetId: asset.id,
          url: savedAudio.url,
          prompt: scene.narration,
          generatedAt: asset.createdAt.toISOString(),
          durationMs: ttsResult.durationMs,
        };
        const nextScript: VideoScriptResult = {
          ...script,
          scenes: script.scenes.map((item) =>
            item.index === sceneIndex
              ? {
                  ...item,
                  generation: buildAudioAssetState(audioState, item.generation),
                }
              : item,
          ),
        };
        const nextIntent: AgentIntentResult = {
          ...currentIntent,
          payload: {
            ...currentIntent.payload,
            generatedScript: nextScript,
          },
        };

        await prisma.$transaction([
          prisma.agentMessage.update({
            where: { id: message.id },
            data: {
              intentJson: nextIntent as unknown as Prisma.InputJsonValue,
            },
          }),
          prisma.generationTask.update({
            where: { id: task.id },
            data: {
              status: TaskStatus.SUCCEEDED,
              progress: 100,
              finishedAt: new Date(),
              output: toInputJson({
                provider: "ai-tts",
                assetId: asset.id,
                localUrl: savedAudio.url,
                storageKey: savedAudio.storageKey,
                durationMs: ttsResult.durationMs,
                providerResponse: ttsResult.providerResponse,
              }),
            },
          }),
        ]);
        await updateProjectSummaryFromScript(projectId, nextScript);

        return NextResponse.json({
          scene: nextScript.scenes.find((item) => item.index === sceneIndex),
          asset: audioState,
          task: {
            id: task.id,
            progress: 100,
            status: "succeeded",
          },
          display: buildAgentDisplay(nextIntent),
        });
      } catch (generationError) {
        const errorMessage = generationError instanceof Error ? generationError.message : String(generationError);
        const failedAudioState: GeneratedSceneAsset = {
          status: "failed",
          prompt: scene.narration,
          error: errorMessage,
          generatedAt: new Date().toISOString(),
        };
        const nextScript: VideoScriptResult = {
          ...script,
          scenes: script.scenes.map((item) =>
            item.index === sceneIndex
              ? {
                  ...item,
                  generation: buildAudioAssetState(failedAudioState, item.generation),
                }
              : item,
          ),
        };
        const nextIntent: AgentIntentResult = {
          ...currentIntent,
          payload: {
            ...currentIntent.payload,
            generatedScript: nextScript,
          },
        };

        await prisma.$transaction([
          prisma.agentMessage.update({
            where: { id: message.id },
            data: {
              intentJson: nextIntent as unknown as Prisma.InputJsonValue,
            },
          }),
          prisma.generationTask.update({
            where: { id: task.id },
            data: {
              status: TaskStatus.FAILED,
              errorMessage,
              finishedAt: new Date(),
            },
          }),
        ]);

        throw generationError;
      }
    }

    if (kind === "html") {
      if (script.mode !== "html-animation") {
        return NextResponse.json({ error: "HTML animation assets are only available for html-animation projects" }, { status: 400 });
      }

      const config = getHtmlAnimationConfig();

      if (!config.baseUrl || !config.apiKey) {
        return NextResponse.json({ error: "HTML_API_BASE_URL and HTML_API_KEY are required for HTML animation generation" }, { status: 500 });
      }

      const task = await prisma.generationTask.create({
        data: {
          projectId,
          type: TaskType.GENERATE_ASSET,
          status: TaskStatus.RUNNING,
          progress: 10,
          startedAt: new Date(),
          input: toInputJson({
            provider: "ai-html-animation",
            baseUrl: config.baseUrl,
            model: config.model,
            messageId,
            sceneIndex,
            kind: "html",
            sourcePrompt: scene.animationPrompt ?? scene.visualPrompt,
            hasPreviousSceneHtml: Boolean([...script.scenes].reverse().find((item) => item.index < sceneIndex && item.generation?.html?.code)),
            hasNextSceneHtml: Boolean(script.scenes.find((item) => item.index > sceneIndex && item.generation?.html?.code)),
            revisionContext,
          }),
        },
      });

      try {
        const htmlAnimationStyle = await loadProjectHtmlAnimationStyle(projectId);
        const htmlAnimationStyleExample = await readHtmlAnimationStyleExample(htmlAnimationStyle);
        const html = await callHtmlAnimationModel({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          script,
          sceneIndex,
          htmlAnimationStyle,
          htmlAnimationStyleExample,
          revisionContext,
        });
        const savedHtml = await saveHtmlFile({ html, projectId, sceneIndex });
        const asset = await prisma.asset.create({
          data: {
            projectId,
            type: AssetType.HTML,
            url: savedHtml.url,
            storageKey: savedHtml.storageKey,
            mimeType: savedHtml.contentType,
            durationMs: scene.durationMs,
            sizeBytes: BigInt(savedHtml.sizeBytes),
            metadata: toInputJson({
              provider: "ai-html-animation",
              model: config.model,
              htmlAnimationStyleId: htmlAnimationStyle.id,
              htmlAnimationStyleName: htmlAnimationStyle.name,
              messageId,
              sceneIndex,
              sourcePrompt: scene.animationPrompt ?? scene.visualPrompt,
              fileName: savedHtml.fileName,
            }),
          },
        });
        const htmlState: GeneratedSceneAsset & { code?: string } = {
          status: "succeeded",
          assetId: asset.id,
          url: savedHtml.url,
          prompt: scene.animationPrompt ?? scene.visualPrompt,
          generatedAt: asset.createdAt.toISOString(),
          durationMs: scene.durationMs,
          code: html,
        };
        const nextScript: VideoScriptResult = {
          ...script,
          scenes: script.scenes.map((item) =>
            item.index === sceneIndex
              ? {
                  ...item,
                  generation: buildHtmlAssetState(htmlState, item.generation),
                }
              : item,
          ),
        };
        const nextIntent: AgentIntentResult = {
          ...currentIntent,
          payload: {
            ...currentIntent.payload,
            generatedScript: nextScript,
          },
        };

        await prisma.$transaction([
          prisma.agentMessage.update({
            where: { id: message.id },
            data: {
              intentJson: nextIntent as unknown as Prisma.InputJsonValue,
            },
          }),
          prisma.generationTask.update({
            where: { id: task.id },
            data: {
              status: TaskStatus.SUCCEEDED,
              progress: 100,
              finishedAt: new Date(),
              output: toInputJson({
                provider: "ai-html-animation",
                assetId: asset.id,
                localUrl: savedHtml.url,
                storageKey: savedHtml.storageKey,
              }),
            },
          }),
        ]);
        await updateProjectSummaryFromScript(projectId, nextScript);

        return NextResponse.json({
          scene: nextScript.scenes.find((item) => item.index === sceneIndex),
          asset: htmlState,
          task: {
            id: task.id,
            progress: 100,
            status: "succeeded",
          },
          display: buildAgentDisplay(nextIntent),
        });
      } catch (generationError) {
        const errorMessage = generationError instanceof Error ? generationError.message : String(generationError);
        const failedHtmlState: GeneratedSceneAsset & { code?: string } = {
          status: "failed",
          prompt: scene.animationPrompt ?? scene.visualPrompt,
          error: errorMessage,
          generatedAt: new Date().toISOString(),
        };
        const nextScript: VideoScriptResult = {
          ...script,
          scenes: script.scenes.map((item) =>
            item.index === sceneIndex
              ? {
                  ...item,
                  generation: buildHtmlAssetState(failedHtmlState, item.generation),
                }
              : item,
          ),
        };
        const nextIntent: AgentIntentResult = {
          ...currentIntent,
          payload: {
            ...currentIntent.payload,
            generatedScript: nextScript,
          },
        };

        await prisma.$transaction([
          prisma.agentMessage.update({
            where: { id: message.id },
            data: {
              intentJson: nextIntent as unknown as Prisma.InputJsonValue,
            },
          }),
          prisma.generationTask.update({
            where: { id: task.id },
            data: {
              status: TaskStatus.FAILED,
              errorMessage,
              finishedAt: new Date(),
            },
          }),
        ]);

        throw generationError;
      }
    }

    const config = getImageGenerationConfig();

    if (!config.baseUrl || !config.apiKey) {
      return NextResponse.json({ error: "IMAGE_API_BASE_URL and IMAGE_API_KEY are required for image generation" }, { status: 500 });
    }

    const prompt = buildImagePrompt(scene, script.styleConsistency, revisionContext);
    const task = await prisma.generationTask.create({
      data: {
        projectId,
        type: TaskType.GENERATE_ASSET,
        status: TaskStatus.RUNNING,
        progress: 5,
        startedAt: new Date(),
        input: toInputJson({
          provider: "openai-compatible-image",
          baseUrl: config.baseUrl,
          model: config.model,
          requestedSize: config.requestedSize,
          size: config.size,
          messageId,
          sceneIndex,
          kind: "image",
          prompt,
          sourcePrompt: scene.visualPrompt,
          revisionContext,
        }),
      },
    });

    try {
      const generatedImage = await callOpenAiCompatibleImageGeneration({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        prompt,
        size: config.size,
      });
      const savedImage = await saveGeneratedImage({ result: generatedImage, projectId, sceneIndex });

      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          progress: 80,
          output: toInputJson({
            provider: "openai-compatible-image",
            responseMode: generatedImage.imageUrl ? "url" : "base64",
            response: generatedImage.providerResponse,
            localUrl: savedImage.url,
            storageKey: savedImage.storageKey,
          }),
        },
      });
      const asset = await prisma.asset.create({
        data: {
          projectId,
          type: AssetType.IMAGE,
          url: savedImage.url,
          storageKey: savedImage.storageKey,
          mimeType: savedImage.contentType,
          sizeBytes: BigInt(savedImage.sizeBytes),
          metadata: toInputJson({
            provider: "openai-compatible-image",
            model: config.model,
            requestedSize: config.requestedSize,
            size: config.size,
            messageId,
            sceneIndex,
            prompt,
            sourcePrompt: scene.visualPrompt,
            remoteUrl: generatedImage.imageUrl,
            fileName: savedImage.fileName,
            responseMode: generatedImage.imageUrl ? "url" : "base64",
            providerResponse: generatedImage.providerResponse,
          }),
        },
      });

      const imageState: GeneratedSceneAsset = {
        status: "succeeded",
        assetId: asset.id,
        url: savedImage.url,
        prompt,
        generatedAt: asset.createdAt.toISOString(),
      };
      const nextScript: VideoScriptResult = {
        ...script,
        scenes: script.scenes.map((item) =>
          item.index === sceneIndex
            ? {
                ...item,
                generation: buildImageAssetState(imageState, item.generation),
              }
            : item,
        ),
      };
      const nextIntent: AgentIntentResult = {
        ...currentIntent,
        payload: {
          ...currentIntent.payload,
          generatedScript: nextScript,
        },
      };

      await prisma.$transaction([
        prisma.agentMessage.update({
          where: { id: message.id },
          data: {
            intentJson: nextIntent as unknown as Prisma.InputJsonValue,
          },
        }),
        prisma.generationTask.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.SUCCEEDED,
            progress: 100,
            finishedAt: new Date(),
            output: toInputJson({
              provider: "openai-compatible-image",
              assetId: asset.id,
              localUrl: savedImage.url,
              storageKey: savedImage.storageKey,
              remoteUrl: generatedImage.imageUrl,
              responseMode: generatedImage.imageUrl ? "url" : "base64",
            }),
          },
        }),
      ]);
      await updateProjectSummaryFromScript(projectId, nextScript);

      const updatedScene = nextScript.scenes.find((item) => item.index === sceneIndex);

      return NextResponse.json({
        scene: updatedScene,
        asset: imageState,
        task: {
          id: task.id,
          progress: 100,
          status: "succeeded",
        },
        display: buildAgentDisplay(nextIntent),
      });
    } catch (generationError) {
      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.FAILED,
          errorMessage: generationError instanceof Error ? generationError.message : String(generationError),
          finishedAt: new Date(),
        },
      });

      throw generationError;
    }
  } catch (error) {
    console.error("Failed to generate storyboard asset", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate storyboard asset" }, { status: 500 });
  }
}
