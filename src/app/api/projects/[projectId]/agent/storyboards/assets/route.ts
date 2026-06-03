import { randomUUID } from "node:crypto";
import { access, stat } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AgentMessageRole, AssetType, Prisma, TaskStatus, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { buildAgentDisplay } from "@/lib/agent/display";
import { parseAgentJson } from "@/lib/agent/intent-validator";
import { validateAgentIntent } from "@/lib/agent/intent-validator";
import { prisma } from "@/lib/db";
import { readHtmlAnimationStyleExample } from "@/lib/html-animation-style-examples";
import { getHtmlAnimationStyleFromMetadata, type AnimationStyle } from "@/lib/html-animation-styles";
import { getScriptCoverImage, getScriptDurationMs } from "@/lib/storyboard-playback";
import type { AgentIntentResult, GeneratedSceneAsset, SceneGenerationState, VideoScriptResult } from "@/types/agent";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

type EvolinkTaskStatus = "pending" | "processing" | "completed" | "failed";

interface EvolinkGenerationTask {
  created?: number;
  id: string;
  model?: string;
  object?: string;
  progress?: number;
  results?: string[];
  status: EvolinkTaskStatus;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
  task_info?: {
    can_cancel?: boolean;
    estimated_time?: number;
  };
  type?: string;
  usage?: unknown;
}

const defaultEvolinkBaseUrl = "https://api.evolink.ai/v1";
const defaultImageModel = "z-image-turbo";
const defaultImageSize = "16:9";
const defaultPollIntervalMs = 3000;
const defaultPollTimeoutMs = 120000;
const defaultTtsModel = "qwen3-tts-flash";
const defaultTtsVoice = "Li";
const defaultTtsFormat = "mp3";
const defaultHtmlAnimationModel = "gemini-3-flash-preview";

function getEvolinkConfig() {
  return {
    apiKey: process.env.EVOLINK_API_KEY ?? "",
    baseUrl: (process.env.EVOLINK_BASE_URL ?? defaultEvolinkBaseUrl).trim().replace(/\/$/, ""),
    model: process.env.EVOLINK_IMAGE_MODEL ?? defaultImageModel,
    size: process.env.EVOLINK_IMAGE_SIZE ?? defaultImageSize,
    pollIntervalMs: toPositiveInt(process.env.EVOLINK_IMAGE_POLL_INTERVAL_MS, defaultPollIntervalMs),
    pollTimeoutMs: toPositiveInt(process.env.EVOLINK_IMAGE_POLL_TIMEOUT_MS, defaultPollTimeoutMs),
  };
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
    apiKey: process.env.AI_API_KEY ?? "",
    baseUrl: (process.env.AI_BASE_URL ?? "").trim().replace(/\/$/, ""),
    model: process.env.AI_HTML_ANIMATION_MODEL ?? process.env.AI_MODEL ?? defaultHtmlAnimationModel,
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
    "全片统一画风约束，必须严格保持一致：",
    `视觉风格：${style.visualStyle}`,
    `色彩方案：${style.colorPalette}`,
    `光线方案：${style.lighting}`,
    `镜头语言：${style.cameraLanguage}`,
    style.characterDesign ? `角色/主体设计：${style.characterDesign}` : "",
    `渲染规则：${style.renderingRules}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImagePrompt(scene: VideoScriptResult["scenes"][number], style?: VideoScriptResult["styleConsistency"]) {
  return [
    buildStyleConsistencyPrompt(style),
    scene.visualPrompt,
    "16:9 cinematic storyboard frame, high quality, clean composition, consistent art direction across all scenes",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHtmlAnimationSystemPrompt() {
  return `
你是一个网页动画工程设计师。
你必须只返回一个合法 JSON 对象，不能使用 Markdown，不能添加解释文字。

任务：为单个视频分镜生成一个可本地保存、可在 iframe 中播放的完整单文件 HTML 动画。

硬性要求：
1. 返回 JSON 格式为 { "html": "<!doctype html>..." }。
2. html 必须包含完整 <!doctype html>、html、head、style、body 和必要 script。
3. 使用 HTML、CSS、SVG、JavaScript、Canvas 中合适的技术实现网页动画展示。
4. 画布必须是 16:9，自适应容器，不能依赖外部网络资源、远程字体、远程脚本、远程图片或 CDN。
5. 代码应自动播放动画，动画时长贴合分镜 durationMs；可以循环，但首次播放必须完整表达该分镜。
6. 字幕和旁白由外层播放器负责，不要在 HTML 内重复展示旁白全文。
7. 严格保持 styleConsistency 里的画风、颜色变量、材质、光影、镜头语言、主体设计和动效节奏。
8. 如果提供 previousSceneHtml 或 nextSceneHtml，必须参考它们的变量命名、DOM 层级、色彩、元素质感和运动节奏；previousSceneHtml 用于承接上一个分镜，nextSceneHtml 用于预留过渡到下一个分镜。
9. 代码不得访问 parent/window.top，不得发起网络请求，不得使用 alert、prompt、confirm、localStorage、cookie。
10. 用 CSS 变量集中定义主题色、背景、光影和动效参数，便于后续局部重生成时保持前后一致。
11. 如果会话中提供 htmlAnimationStyleRule，必须把 htmlAnimationStyleRule.prompt 作为最高优先级风格约束。
12. 如果会话中提供 htmlAnimationStyleExample，必须参考示例 HTML 的视觉语言、CSS 技法、DOM 组织和动效节奏；不要照抄示例文字内容。
`;
}

function buildHtmlAnimationStyleMessages(style: AnimationStyle, exampleHtml: string) {
  return [
    {
      role: "user" as const,
      content: JSON.stringify({
        messageType: "htmlAnimationStyleRule",
        instruction: "后续单分镜 HTML 动画生成必须优先遵循这个风格提示词。",
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
        instruction: "这是当前风格对应的示例 HTML。只参考视觉语言、CSS 技法、DOM 组织和动效节奏，不要照抄示例文本内容。",
        styleId: style.id,
        htmlAnimationStyleExample: exampleHtml,
      }),
    },
  ];
}

function buildHtmlAnimationUserContent({
  script,
  sceneIndex,
  htmlAnimationStyle,
}: {
  script: VideoScriptResult;
  sceneIndex: number;
  htmlAnimationStyle: AnimationStyle;
}) {
  const scene = script.scenes.find((item) => item.index === sceneIndex);
  const previousScene = [...script.scenes].reverse().find((item) => item.index < sceneIndex && item.generation?.html?.code);
  const nextScene = script.scenes.find((item) => item.index > sceneIndex && item.generation?.html?.code);

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
          durationMs: scene.durationMs,
        }
      : null,
    previousSceneHtml: previousScene
      ? {
          label: `前一个已生成分镜：${previousScene.index} ${previousScene.title}`,
          code: previousScene.generation?.html?.code,
        }
      : null,
    nextSceneHtml: nextScene
      ? {
          label: `后一个已生成分镜：${nextScene.index} ${nextScene.title}`,
          code: nextScene.generation?.html?.code,
        }
      : null,
    output: {
      html: "返回完整单文件 HTML 字符串",
    },
  });
}

function normalizeGeneratedHtml(value: unknown) {
  const payload = typeof value === "string" ? parseAgentJson(value) : value;
  const html = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { html?: unknown }).html : undefined;

  if (typeof html !== "string" || !html.trim()) {
    throw new Error("HTML animation response must include html");
  }

  const trimmed = html.trim();
  return trimmed.toLowerCase().startsWith("<!doctype html") ? trimmed : `<!doctype html>\n${trimmed}`;
}

async function callHtmlAnimationModel({
  baseUrl,
  apiKey,
  model,
  script,
  sceneIndex,
  htmlAnimationStyle,
  htmlAnimationStyleExample,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  script: VideoScriptResult;
  sceneIndex: number;
  htmlAnimationStyle: AnimationStyle;
  htmlAnimationStyleExample: string;
}) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildHtmlAnimationSystemPrompt() },
        ...buildHtmlAnimationStyleMessages(htmlAnimationStyle, htmlAnimationStyleExample),
        { role: "user", content: buildHtmlAnimationUserContent({ script, sceneIndex, htmlAnimationStyle }) },
      ],
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: unknown;
  };

  if (!response.ok) {
    throw new Error(extractEvolinkError(payload, `HTML animation request failed: ${response.status}`));
  }

  return normalizeGeneratedHtml(payload.choices?.[0]?.message?.content);
}

async function loadProjectHtmlAnimationStyle(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { metadata: true },
  });

  return getHtmlAnimationStyleFromMetadata(project?.metadata);
}

async function submitEvolinkImageTask({
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
}) {
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      nsfw_check: false,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<EvolinkGenerationTask> & { error?: unknown };

  if (!response.ok || typeof payload.id !== "string") {
    throw new Error(extractEvolinkError(payload, `Evolink image task submit failed: ${response.status}`));
  }

  return payload as EvolinkGenerationTask;
}

async function getEvolinkTask({
  baseUrl,
  apiKey,
  taskId,
}: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
}) {
  const response = await fetch(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<EvolinkGenerationTask>;

  if (!response.ok || typeof payload.status !== "string") {
    throw new Error(extractEvolinkError(payload, `Evolink task query failed: ${response.status}`));
  }

  return payload as EvolinkGenerationTask;
}

async function pollEvolinkTask({
  baseUrl,
  apiKey,
  taskId,
  intervalMs,
  timeoutMs,
  onProgress,
}: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  intervalMs: number;
  timeoutMs: number;
  onProgress: (task: EvolinkGenerationTask) => Promise<void>;
}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const task = await getEvolinkTask({ baseUrl, apiKey, taskId });
    await onProgress(task);

    if (task.status === "completed") {
      return task;
    }

    if (task.status === "failed") {
      throw new Error(task.error?.message ?? "Evolink image task failed");
    }

    await sleep(intervalMs);
  }

  throw new Error(`Evolink image task timed out after ${Math.round(timeoutMs / 1000)}s`);
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
  let lastError = "";

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
      lastError = await extractResponseError(response, `TTS request failed: ${response.status}`);
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
        lastError = error instanceof Error ? error.message : String(error);
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
        lastError = error instanceof Error ? error.message : String(error);
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
        lastError = error instanceof Error ? error.message : String(error);
        continue;
      }
    }

    lastError = "TTS response did not contain audio data";
  }

  throw new Error(lastError || "TTS request failed");
}

async function extractResponseError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return extractEvolinkError(await response.json().catch(() => ({})), fallback);
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

function extractEvolinkError(payload: unknown, fallback: string) {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
                  error: "本地图片文件不存在，请重新生成",
                }
              : image,
          html:
            html && !htmlOk
              ? {
                  ...html,
                  status: "failed" as const,
                  url: undefined,
                  error: "本地 HTML 文件不存在，请重新生成",
                }
              : html,
          audio:
            audio && !audioOk
              ? {
                  ...audio,
                  status: "failed" as const,
                  url: undefined,
                  error: "本地音频文件不存在，请重新生成",
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
    };
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const sceneIndex = typeof body.sceneIndex === "number" ? body.sceneIndex : 0;
    const kind = typeof body.kind === "string" ? body.kind : "image";
    const force = body.force === true;

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
        return NextResponse.json({ error: "AI_BASE_URL and AI_API_KEY are required for HTML animation generation" }, { status: 500 });
      }

      const task = await prisma.generationTask.create({
        data: {
          projectId,
          type: TaskType.GENERATE_ASSET,
          status: TaskStatus.RUNNING,
          progress: 10,
          startedAt: new Date(),
          input: {
            provider: "ai-html-animation",
            baseUrl: config.baseUrl,
            model: config.model,
            messageId,
            sceneIndex,
            kind: "html",
            sourcePrompt: scene.animationPrompt ?? scene.visualPrompt,
            hasPreviousSceneHtml: Boolean([...script.scenes].reverse().find((item) => item.index < sceneIndex && item.generation?.html?.code)),
            hasNextSceneHtml: Boolean(script.scenes.find((item) => item.index > sceneIndex && item.generation?.html?.code)),
          },
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

    const config = getEvolinkConfig();

    if (!config.apiKey) {
      return NextResponse.json({ error: "EVOLINK_API_KEY is required for image generation" }, { status: 500 });
    }

    const prompt = buildImagePrompt(scene, script.styleConsistency);
    const task = await prisma.generationTask.create({
      data: {
        projectId,
        type: TaskType.GENERATE_ASSET,
        status: TaskStatus.RUNNING,
        progress: 5,
        startedAt: new Date(),
        input: {
          provider: "evolink",
          baseUrl: config.baseUrl,
          model: config.model,
          size: config.size,
          messageId,
          sceneIndex,
          kind: "image",
          prompt,
          sourcePrompt: scene.visualPrompt,
        },
      },
    });

    try {
      const submittedTask = await submitEvolinkImageTask({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        prompt,
        size: config.size,
      });

      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          progress: submittedTask.progress ?? 10,
          output: toInputJson({
            provider: "evolink",
            externalTaskId: submittedTask.id,
            submitResponse: submittedTask,
          }),
        },
      });

      const completedTask = await pollEvolinkTask({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        taskId: submittedTask.id,
        intervalMs: config.pollIntervalMs,
        timeoutMs: config.pollTimeoutMs,
        onProgress: async (currentTask) => {
          await prisma.generationTask.update({
            where: { id: task.id },
            data: {
              progress: currentTask.progress ?? 10,
              output: toInputJson({
                provider: "evolink",
                externalTaskId: submittedTask.id,
                latestStatus: currentTask,
              }),
            },
          });
        },
      });
      const remoteImageUrl = completedTask.results?.[0];

      if (!remoteImageUrl) {
        throw new Error("Evolink task completed without image result");
      }

      const savedImage = await saveRemoteImage({ imageUrl: remoteImageUrl, projectId, sceneIndex });
      const asset = await prisma.asset.create({
        data: {
          projectId,
          type: AssetType.IMAGE,
          url: savedImage.url,
          storageKey: savedImage.storageKey,
          mimeType: savedImage.contentType,
          sizeBytes: BigInt(savedImage.sizeBytes),
          metadata: toInputJson({
            provider: "evolink",
            model: config.model,
            size: config.size,
            messageId,
            sceneIndex,
            prompt,
            sourcePrompt: scene.visualPrompt,
            externalTaskId: submittedTask.id,
            remoteUrl: remoteImageUrl,
            fileName: savedImage.fileName,
            completedTask,
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
              provider: "evolink",
              externalTaskId: submittedTask.id,
              assetId: asset.id,
              localUrl: savedImage.url,
              storageKey: savedImage.storageKey,
              remoteUrl: remoteImageUrl,
              completedTask,
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
          externalTaskId: submittedTask.id,
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
