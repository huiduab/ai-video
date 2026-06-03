import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AgentMessageRole, AssetType, Prisma, TaskStatus, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { buildAgentDisplay } from "@/lib/agent/display";
import { validateAgentIntent } from "@/lib/agent/intent-validator";
import { prisma } from "@/lib/db";
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

function getEvolinkConfig() {
  return {
    apiKey: process.env.EVOLINK_API_KEY ?? "",
    baseUrl: (process.env.EVOLINK_BASE_URL ?? defaultEvolinkBaseUrl).replace(/\/$/, ""),
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
    baseUrl: (process.env.AI_BASE_URL ?? "").replace(/\/$/, ""),
    model: process.env.AI_TTS_MODEL ?? defaultTtsModel,
    voice: process.env.AI_TTS_VOICE ?? defaultTtsVoice,
    responseFormat: process.env.AI_TTS_RESPONSE_FORMAT ?? defaultTtsFormat,
    paths: explicitPath ? [normalizeEndpointPath(explicitPath)] : ["/audio/speech", "/tts"],
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

function buildAudioAssetState(asset: GeneratedSceneAsset, current?: SceneGenerationState): SceneGenerationState {
  return {
    image: current?.image,
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

    const response = await fetch(`${baseUrl}${endpointPath}`, {
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
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        contentType: contentType || contentTypeFromAudioFormat(responseFormat),
        durationMs: undefined,
        providerResponse: {
          endpointPath,
          responseMode: "binary",
        },
      };
    }

    const payload = (await response.json().catch(() => ({}))) as unknown;
    const parsed = parseTtsJsonPayload(payload);

    if (parsed.audioUrl) {
      const audioResponse = await fetch(parsed.audioUrl, { cache: "no-store" });

      if (!audioResponse.ok) {
        throw new Error(`Generated audio download failed: ${audioResponse.status}`);
      }

      return {
        bytes: Buffer.from(await audioResponse.arrayBuffer()),
        contentType: audioResponse.headers.get("content-type") ?? contentTypeFromAudioFormat(responseFormat),
        durationMs: parsed.durationMs,
        providerResponse: {
          endpointPath,
          responseMode: "json-url",
          payload,
          audioUrl: parsed.audioUrl,
        },
      };
    }

    if (parsed.audioBase64) {
      return {
        bytes: Buffer.from(parsed.audioBase64, "base64"),
        contentType: parsed.contentType ?? contentTypeFromAudioFormat(responseFormat),
        durationMs: parsed.durationMs,
        providerResponse: {
          endpointPath,
          responseMode: "json-base64",
          payload,
        },
      };
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

    if (kind !== "image" && kind !== "audio") {
      return NextResponse.json({ error: "Asset kind must be image or audio" }, { status: 400 });
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
    const script = currentIntent.payload.generatedScript;

    if (!script) {
      return NextResponse.json({ error: "Message does not contain generated storyboard" }, { status: 400 });
    }

    const scene = script.scenes.find((item) => item.index === sceneIndex);

    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    if (kind === "image" && !force && scene.generation?.image?.status === "succeeded" && scene.generation.image.url) {
      await updateProjectSummaryFromScript(projectId, script);
      return NextResponse.json({ scene, asset: scene.generation.image, skipped: true });
    }

    if (kind === "audio" && !force && scene.generation?.audio?.status === "succeeded" && scene.generation.audio.url) {
      await updateProjectSummaryFromScript(projectId, script);
      return NextResponse.json({ scene, asset: scene.generation.audio, skipped: true });
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
