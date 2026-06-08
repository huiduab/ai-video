import { AgentIntentType, AgentMessageRole, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { buildAgentDisplay } from "@/lib/agent/display";
import { planHtmlAnimationLayouts } from "@/lib/agent/html-layout-planner";
import { mapAgentMessage } from "@/lib/agent/mappers";
import { callDirectorModel, callIntentModel } from "@/lib/agent/openai-compatible";
import { AGENT_INTENT_SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { parseAgentJson, validateAgentIntent } from "@/lib/agent/intent-validator";
import { buildVideoScriptSystemPrompt } from "@/lib/agent/script-prompt";
import { validateVideoScript, validateVideoScriptScene } from "@/lib/agent/script-validator";
import { prisma } from "@/lib/db";
import { readHtmlAnimationStyleExample } from "@/lib/html-animation-style-examples";
import { getHtmlAnimationStyleFromMetadata, type AnimationStyle } from "@/lib/html-animation-styles";
import { getScriptDurationMs } from "@/lib/storyboard-playback";
import type { AgentDisplay, AgentIntentResult, VideoScriptResult, VideoScriptScene } from "@/types/agent";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function toDbIntentType(type: AgentIntentResult["type"]): AgentIntentType {
  return AgentIntentType[type];
}

function isFullOutlineGenerationIntent(type: AgentIntentResult["type"]) {
  return type === "GENERATE_OUTLINE" || type === "REGENERATE_OUTLINE";
}

function isOutlineEditIntent(type: AgentIntentResult["type"]) {
  return type === "REGENERATE_OUTLINE" || type === "ADD_SCENE" || type === "DELETE_SCENE" || type === "REGENERATE_SCENE";
}

function shouldGenerateScriptForIntent(type: AgentIntentResult["type"]) {
  return isFullOutlineGenerationIntent(type) || type === "ADD_SCENE" || type === "DELETE_SCENE" || type === "REGENERATE_SCENE";
}

function buildErrorDisplay(message: string): AgentDisplay {
  return {
    type: "error",
    title: "AI 分析失败",
    message,
  };
}

function mergeMetadata(metadata: unknown, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return {
    ...base,
    ...patch,
  } as Prisma.InputJsonValue;
}

function getActiveGeneratedStoryboardMessageId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = (metadata as { activeGeneratedStoryboardMessageId?: unknown }).activeGeneratedStoryboardMessageId;
  return typeof value === "string" ? value : "";
}

function hasGeneratedStoryboardAssets(script?: VideoScriptResult | null) {
  return Boolean(
    script?.scenes.some((scene) => {
      const generation = scene.generation;
      return Boolean(
        generation?.image?.url ||
          generation?.image?.assetId ||
          generation?.image?.status === "succeeded" ||
          generation?.html?.url ||
          generation?.html?.assetId ||
          generation?.html?.status === "succeeded" ||
          generation?.audio?.url ||
          generation?.audio?.assetId ||
          generation?.audio?.status === "succeeded",
      );
    }),
  );
}

function summarizeScriptForRegeneration(script?: VideoScriptResult | null) {
  if (!script) {
    return null;
  }

  return {
    title: script.title,
    summary: script.summary,
    mode: script.mode,
    styleConsistency: script.styleConsistency,
    transcript: script.transcript,
    scenes: script.scenes.map((scene) => ({
      index: scene.index,
      title: scene.title,
      narration: scene.narration,
      visualPrompt: scene.visualPrompt,
      animationPrompt: scene.animationPrompt,
      durationMs: scene.durationMs,
    })),
  };
}

function getRequestedSceneIndex(intent: AgentIntentResult) {
  const value = intent.payload.sceneIndex;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function getTargetSceneIndex(intent: AgentIntentResult) {
  const value = intent.payload.sceneIndex;
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function getInsertAfterSceneIndex(intent: AgentIntentResult) {
  const value = intent.payload.insertAfterSceneIndex;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function truncateForIntent(value: string | undefined, maxLength = 60) {
  const text = value?.trim() ?? "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildIntentStoryboardContext({
  activeScript,
  databaseScenes,
}: {
  activeScript?: VideoScriptResult | null;
  databaseScenes: Array<{ sceneIndex: number; title: string; narration: string | null }>;
}) {
  if (activeScript?.scenes.length) {
    return {
      source: "active-generated-script",
      scenes: activeScript.scenes.map((scene) => ({
        index: scene.index,
        title: scene.title,
        narrationBrief: truncateForIntent(scene.narration),
      })),
    };
  }

  return {
    source: "database-storyboard",
    scenes: databaseScenes.map((scene) => ({
      index: scene.sceneIndex,
      title: scene.title,
      narrationBrief: truncateForIntent(scene.narration ?? ""),
    })),
  };
}

function toApiMode(mode: "SLIDESHOW" | "HTML_ANIMATION"): VideoScriptResult["mode"] {
  return mode === "HTML_ANIMATION" ? "html-animation" : "slideshow";
}

function buildScriptRequestContent({
  userPrompt,
  mode,
  projectTitle,
  intent,
  memory,
  htmlAnimationStyle,
  originalUserPrompt,
  currentScript,
}: {
  userPrompt: string;
  mode: VideoScriptResult["mode"];
  projectTitle: string;
  intent: AgentIntentResult;
  memory: AgentMemoryItem[];
  htmlAnimationStyle: AnimationStyle;
  originalUserPrompt?: string;
  currentScript?: VideoScriptResult | null;
}) {
  return JSON.stringify({
    userPrompt,
    projectTitle,
    mode,
    ...(mode === "html-animation"
      ? {
          htmlAnimationStyle: {
            id: htmlAnimationStyle.id,
            name: htmlAnimationStyle.name,
            description: htmlAnimationStyle.description,
            prompt: htmlAnimationStyle.prompt,
          },
        }
      : {}),
    memory,
    regenerationContext:
      isOutlineEditIntent(intent.type)
        ? {
            originalUserPrompt: originalUserPrompt ?? "",
            currentStoryboardOutline: summarizeScriptForRegeneration(currentScript),
            userModificationRequest: userPrompt,
            targetSceneIndex: intent.type === "REGENERATE_SCENE" ? getRequestedSceneIndex(intent) : undefined,
            directorInstruction:
              intent.type === "REGENERATE_SCENE"
                ? "这是带明确分镜编号的局部修改。只能重新编写 targetSceneIndex 对应分镜的 title、narration、visualPrompt、animationPrompt/playbackEffect 和 durationMs；其它分镜必须保持原标题、旁白、画面提示词、顺序和数量不变。仍然返回完整 VideoScript JSON，并同步重写 transcript。"
                : "请把原始用户提示词、现有分镜大纲和用户新的修改需求一起作为上下文。判断哪些分镜必须修改、哪些分镜可以保留不变；需要修改的分镜要重写旁白和画面提示词，不需要修改的分镜保持标题、旁白和画面意图稳定。如果用户只要求修改某个具体分镜、增加分镜或删除分镜，也必须返回修改后的完整 VideoScript JSON。",
          }
        : null,
    intentAnalysis: {
      type: intent.type,
      payload: intent.payload,
    },
    outputRequirements: {
      transcript: "生成完整逐字稿",
      scenes: "根据逐字稿拆分多个分镜",
      sceneFields:
        mode === "html-animation"
          ? ["title", "narration", "visualPrompt", "animationPrompt", "durationMs"]
          : ["title", "narration", "visualPrompt", "playbackEffect", "durationMs"],
      persistence: "返回 JSON 会被系统保存，字段必须稳定",
      regeneration:
        isOutlineEditIntent(intent.type)
          ? "重新生成时必须输出完整大纲；保留分镜也要完整返回，修改分镜要更新 narration、visualPrompt、animationPrompt/playbackEffect 和 transcript。"
          : undefined,
    },
  });
}

function mergeSingleSceneRevision({
  currentScript,
  replacement,
  sceneIndex,
}: {
  currentScript: VideoScriptResult;
  replacement: VideoScriptScene;
  sceneIndex: number;
}) {
  const mergedScenes = currentScript.scenes.map((scene) =>
    scene.index === sceneIndex
      ? {
          ...replacement,
          index: scene.index,
          generation: scene.generation,
        }
      : scene,
  );

  return validateVideoScript({
    ...currentScript,
    transcript: mergedScenes.map((scene) => scene.narration).join("\n"),
    scenes: mergedScenes,
  });
}

function buildSingleSceneInsertionRequestContent({
  userPrompt,
  projectTitle,
  mode,
  intent,
  htmlAnimationStyle,
  currentScript,
}: {
  userPrompt: string;
  projectTitle: string;
  mode: VideoScriptResult["mode"];
  intent: AgentIntentResult;
  htmlAnimationStyle: AnimationStyle;
  currentScript: VideoScriptResult;
}) {
  const requestedInsertAfterSceneIndex = getInsertAfterSceneIndex(intent);

  return JSON.stringify({
    messageType: "single-scene-insertion",
    userPrompt,
    projectTitle,
    mode,
    intentAnalysis: {
      type: intent.type,
      payload: intent.payload,
    },
    videoContext: {
      title: currentScript.title,
      summary: currentScript.summary,
      transcript: currentScript.transcript,
      styleConsistency: currentScript.styleConsistency,
      scenes: currentScript.scenes.map((scene) => ({
        index: scene.index,
        title: scene.title,
        narration: scene.narration,
        visualPrompt: scene.visualPrompt,
        animationPrompt: scene.animationPrompt,
        durationMs: scene.durationMs,
      })),
    },
    ...(mode === "html-animation"
      ? {
          htmlAnimationStyle: {
            id: htmlAnimationStyle.id,
            name: htmlAnimationStyle.name,
            description: htmlAnimationStyle.description,
            prompt: htmlAnimationStyle.prompt,
          },
        }
      : {}),
    insertionContext: {
      requestedInsertAfterSceneIndex,
      userNewSceneRequirement: userPrompt,
      instruction:
        requestedInsertAfterSceneIndex > 0
          ? "Create exactly one new scene to insert after requestedInsertAfterSceneIndex. Keep the existing story intact and make the new scene bridge naturally with neighboring scenes."
          : "Create exactly one new scene and decide the best insertAfterSceneIndex from videoContext.scenes. Return 0 only if the new scene should be inserted before the first scene.",
    },
    outputRequirements:
      mode === "html-animation"
        ? {
            shape: "Return { insertAfterSceneIndex, scene } JSON. scene must include index, title, narration, visualPrompt, animationPrompt, durationMs and htmlAnimation.",
            context: "Use videoContext.transcript, videoContext.scenes and userNewSceneRequirement as the main context. Do not return a full script.",
          }
        : {
            shape: "Return { insertAfterSceneIndex, scene } JSON. scene must include index, title, narration, visualPrompt, durationMs and playbackEffect.",
            context: "Use videoContext.transcript, videoContext.scenes and userNewSceneRequirement as the main context. Do not return a full script.",
          },
  });
}

function normalizeInsertAfterSceneIndex(value: unknown, currentScript: VideoScriptResult) {
  const maxIndex = currentScript.scenes.reduce((max, scene) => Math.max(max, scene.index), 0);
  const numericValue = typeof value === "number" && Number.isInteger(value) ? value : 0;

  if (numericValue <= 0) {
    return 0;
  }

  return Math.min(numericValue, maxIndex);
}

function insertGeneratedScene({
  currentScript,
  newScene,
  insertAfterSceneIndex,
}: {
  currentScript: VideoScriptResult;
  newScene: VideoScriptScene;
  insertAfterSceneIndex: number;
}) {
  const sortedScenes = [...currentScript.scenes].sort((a, b) => a.index - b.index);
  const insertAt = insertAfterSceneIndex <= 0 ? 0 : sortedScenes.findIndex((scene) => scene.index === insertAfterSceneIndex) + 1;
  const safeInsertAt = insertAt <= 0 && insertAfterSceneIndex > 0 ? sortedScenes.length : Math.max(0, insertAt);
  const nextScenes = [...sortedScenes.slice(0, safeInsertAt), { ...newScene, generation: undefined }, ...sortedScenes.slice(safeInsertAt)].map((scene, index) => ({
    ...scene,
    index: index + 1,
  }));

  return validateVideoScript({
    ...currentScript,
    transcript: nextScenes.map((scene) => scene.narration).join("\n"),
    scenes: nextScenes,
  });
}

function buildSingleSceneDeletionScript({
  currentScript,
  sceneIndex,
}: {
  currentScript: VideoScriptResult;
  sceneIndex: number;
}) {
  const sortedScenes = [...currentScript.scenes].sort((a, b) => a.index - b.index);
  const deletedScene = sortedScenes.find((scene) => scene.index === sceneIndex);

  if (!deletedScene) {
    throw new Error(`未找到第 ${sceneIndex} 个分镜，请确认要删除的分镜编号。`);
  }

  if (sortedScenes.length <= 1) {
    throw new Error("当前大纲只有 1 个分镜，不能删除到空大纲。");
  }

  const nextScenes = sortedScenes
    .filter((scene) => scene.index !== sceneIndex)
    .map((scene, index) => ({
      ...scene,
      index: index + 1,
    }));

  const script = validateVideoScript({
    ...currentScript,
    transcript: nextScenes.map((scene) => scene.narration).join("\n"),
    scenes: nextScenes,
  });

  return {
    script,
    deletedSceneIndex: sceneIndex,
    deletedSceneTitle: deletedScene.title,
  };
}

async function generateSingleSceneInsertion({
  userPrompt,
  projectTitle,
  mode,
  intent,
  htmlAnimationStyle,
  currentScript,
  signal,
}: {
  userPrompt: string;
  projectTitle: string;
  mode: VideoScriptResult["mode"];
  intent: AgentIntentResult;
  htmlAnimationStyle: AnimationStyle;
  currentScript: VideoScriptResult;
  signal?: AbortSignal;
}) {
  const requestedInsertAfterSceneIndex = getInsertAfterSceneIndex(intent);
  const systemPrompt =
    mode === "html-animation"
      ? "You are a video content director and HTML animation storyboard planner. Generate exactly one new scene for insertion. Return only valid JSON with no Markdown."
      : "You are a professional video content director. Generate exactly one new storyboard scene for insertion. Return only valid JSON with no Markdown.";
  let lastError: unknown;
  let lastRaw = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repairMessage =
      attempt === 0
        ? []
        : [
            {
              role: "user" as const,
              content: JSON.stringify({
                messageType: "single-scene-insertion-repair",
                instruction: "Your previous output failed validation. Return exactly { insertAfterSceneIndex, scene } and keep one new scene only.",
                validationError: lastError instanceof Error ? lastError.message : String(lastError),
              }),
            },
          ];

    lastRaw =
      (await callDirectorModel(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: buildSingleSceneInsertionRequestContent({
              userPrompt,
              projectTitle,
              mode,
              intent,
              htmlAnimationStyle,
              currentScript,
            }),
          },
          ...repairMessage,
        ],
        { signal },
      )) ?? "";

    try {
      const parsed = parseAgentJson(lastRaw) as { insertAfterSceneIndex?: unknown; scene?: unknown };
      const insertAfterSceneIndex =
        requestedInsertAfterSceneIndex > 0 ? normalizeInsertAfterSceneIndex(requestedInsertAfterSceneIndex, currentScript) : normalizeInsertAfterSceneIndex(parsed.insertAfterSceneIndex, currentScript);
      const newScene = validateVideoScriptScene(parsed.scene ?? parsed, insertAfterSceneIndex + 1, mode);

      return {
        insertAfterSceneIndex,
        newScene,
      };
    } catch (error) {
      lastError = error;
      console.error("AI single scene insertion JSON invalid", { attempt: attempt + 1, raw: lastRaw, error });
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI single scene insertion JSON invalid");
}

async function buildSingleSceneInsertionScript({
  projectTitle,
  projectMode,
  userPrompt,
  intent,
  htmlAnimationStyle,
  currentScript,
  signal,
}: {
  projectTitle: string;
  projectMode: "SLIDESHOW" | "HTML_ANIMATION";
  userPrompt: string;
  intent: AgentIntentResult;
  htmlAnimationStyle: AnimationStyle;
  currentScript: VideoScriptResult;
  signal?: AbortSignal;
}) {
  const { insertAfterSceneIndex, newScene } = await generateSingleSceneInsertion({
    userPrompt,
    projectTitle,
    mode: toApiMode(projectMode),
    intent,
    htmlAnimationStyle,
    currentScript,
    signal,
  });
  const script = insertGeneratedScene({
    currentScript,
    newScene,
    insertAfterSceneIndex,
  });

  return {
    script,
    insertAfterSceneIndex,
    insertedSceneIndex: Math.min(insertAfterSceneIndex + 1, script.scenes.length),
  };
}

function buildSingleSceneRevisionRequestContent({
  userPrompt,
  projectTitle,
  mode,
  intent,
  htmlAnimationStyle,
  currentScript,
  sceneIndex,
}: {
  userPrompt: string;
  projectTitle: string;
  mode: VideoScriptResult["mode"];
  intent: AgentIntentResult;
  htmlAnimationStyle: AnimationStyle;
  currentScript: VideoScriptResult;
  sceneIndex: number;
}) {
  const targetScene = currentScript.scenes.find((scene) => scene.index === sceneIndex);
  const previousScene = [...currentScript.scenes].reverse().find((scene) => scene.index < sceneIndex);
  const nextScene = currentScript.scenes.find((scene) => scene.index > sceneIndex);

  return JSON.stringify({
    messageType: "single-scene-revision",
    userPrompt,
    projectTitle,
    mode,
    intentAnalysis: {
      type: intent.type,
      payload: intent.payload,
    },
    videoContext: {
      title: currentScript.title,
      summary: currentScript.summary,
      styleConsistency: currentScript.styleConsistency,
      scenes: currentScript.scenes.map((scene) => ({
        index: scene.index,
        title: scene.title,
        narration: scene.narration,
        visualPrompt: scene.visualPrompt,
        animationPrompt: scene.animationPrompt,
        durationMs: scene.durationMs,
      })),
    },
    ...(mode === "html-animation"
      ? {
          htmlAnimationStyle: {
            id: htmlAnimationStyle.id,
            name: htmlAnimationStyle.name,
            description: htmlAnimationStyle.description,
            prompt: htmlAnimationStyle.prompt,
          },
        }
      : {}),
    revisionContext: {
      targetSceneIndex: sceneIndex,
      targetScene,
      previousScene,
      nextScene,
      userModificationRequest: userPrompt,
      instruction:
        "只改写 targetSceneIndex 对应的单个分镜。必须参考 videoContext.scenes、previousScene 和 nextScene，让修改后的分镜与前后分镜叙事、风格、术语、节奏和转场方向贴合。用户本次修改需求是硬性增量要求，必须转化为画面里可见的新主体、新结构或新信息层，不能只保留旧布局或只做轻微措辞变化。不要新增、删除或重排其它分镜。",
    },
    outputRequirements:
      mode === "html-animation"
        ? {
            shape: "返回 { sceneIndex, scene } JSON。scene 必须包含 index、title、narration、visualPrompt、animationPrompt、durationMs、htmlAnimation。",
            htmlAnimation:
              "htmlAnimation 必须包含 templateId、visualMetaphor、directorPrompt、layerPrompt、animationTimeline、cameraPrompt、motionTechniques、htmlPrompt、negativePrompt、revisionHints、motionBeats、focusPath、emphasisMoments、transitionIntent。htmlPrompt 是给 HTML 执行模型的单镜头详细提示词，不写完整 HTML/CSS/JS。htmlPrompt 必须明确列出用户新增/修改的可见元素，并说明它们相对旧画面的布局位置、尺寸层级和动画方式。",
          }
        : {
            shape: "返回 { sceneIndex, scene } JSON。scene 必须包含 index、title、narration、visualPrompt、durationMs、playbackEffect。",
            playbackEffect: "playbackEffect 要匹配前后镜头节奏，避免和相邻分镜转场冲突。",
          },
  });
}

async function generateSingleSceneRevision({
  userPrompt,
  projectTitle,
  mode,
  intent,
  htmlAnimationStyle,
  currentScript,
  sceneIndex,
  signal,
}: {
  userPrompt: string;
  projectTitle: string;
  mode: VideoScriptResult["mode"];
  intent: AgentIntentResult;
  htmlAnimationStyle: AnimationStyle;
  currentScript: VideoScriptResult;
  sceneIndex: number;
  signal?: AbortSignal;
}) {
  const systemPrompt =
    mode === "html-animation"
      ? "你是视频内容导演兼 HTML 动画分镜编排师。你只修改一个目标分镜，并直接输出该分镜的脚本和 htmlAnimation 执行提示。必须只返回合法 JSON，不要 Markdown，不要解释文字。"
      : "你是视频内容导演。你只修改一个目标分镜，并输出该分镜脚本和图片播放效果。必须只返回合法 JSON，不要 Markdown，不要解释文字。";
  const raw =
    (await callDirectorModel([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: buildSingleSceneRevisionRequestContent({
          userPrompt,
          projectTitle,
          mode,
          intent,
          htmlAnimationStyle,
          currentScript,
          sceneIndex,
        }),
      },
    ], { signal })) ?? "";
  const parsed = parseAgentJson(raw) as { sceneIndex?: unknown; scene?: unknown };
  const returnedSceneIndex = typeof parsed.sceneIndex === "number" ? parsed.sceneIndex : sceneIndex;

  if (returnedSceneIndex !== sceneIndex) {
    throw new Error(`Director returned scene ${returnedSceneIndex}, expected ${sceneIndex}`);
  }

  return validateVideoScriptScene(parsed.scene ?? parsed, sceneIndex, mode);
}

async function buildSingleSceneRevisionScript({
  projectTitle,
  projectMode,
  userPrompt,
  intent,
  htmlAnimationStyle,
  currentScript,
  signal,
}: {
  projectTitle: string;
  projectMode: "SLIDESHOW" | "HTML_ANIMATION";
  userPrompt: string;
  intent: AgentIntentResult;
  htmlAnimationStyle: AnimationStyle;
  currentScript: VideoScriptResult;
  signal?: AbortSignal;
}) {
  const sceneIndex = getRequestedSceneIndex(intent);

  if (!sceneIndex) {
    throw new Error("REGENERATE_SCENE requires payload.sceneIndex");
  }

  const replacement = await generateSingleSceneRevision({
    userPrompt,
    projectTitle,
    mode: toApiMode(projectMode),
    intent,
    htmlAnimationStyle,
    currentScript,
    sceneIndex,
    signal,
  });

  return mergeSingleSceneRevision({
    currentScript,
    replacement,
    sceneIndex,
  });
}

function buildSceneRevisionContext({
  originalScene,
  revisedScene,
  userPrompt,
}: {
  originalScene?: VideoScriptScene;
  revisedScene?: VideoScriptScene;
  userPrompt: string;
}) {
  const originalHtmlCode = originalScene?.generation?.html?.code ?? "";

  return {
    userModificationRequest: userPrompt,
    originalVisualPrompt: originalScene?.animationPrompt ?? originalScene?.visualPrompt ?? "",
    originalHtmlIssueSummary: summarizeOriginalHtmlIssue(originalHtmlCode),
    revisedVisualPrompt: revisedScene?.animationPrompt ?? revisedScene?.visualPrompt ?? "",
  };
}

function summarizeOriginalHtmlIssue(html: string) {
  if (!html.trim()) {
    return "";
  }

  const findings: string[] = [];
  const svgGroupTransformCount = (html.match(/<g\b[^>]*\btransform\s*=/gi) ?? []).length + (html.match(/<g\b[^>]*style=["'][^"']*transform\s*:/gi) ?? []).length;
  const cssTransformCount = (html.match(/transform\s*:/gi) ?? []).length;
  const gsapTransformCount = (html.match(/gsap\.[a-zA-Z]+\([^)]*\{[^}]*\b(?:x|y|scale|translateX|translateY)\s*:/gi) ?? []).length;

  if (svgGroupTransformCount > 0) {
    findings.push(`旧 HTML 在 SVG <g> 元素上使用了 ${svgGroupTransformCount} 处 transform/inline transform，容易导致 SVG 坐标和动画坐标错位。`);
  }

  if (cssTransformCount > 0 && gsapTransformCount > 0) {
    findings.push(`旧 HTML 同时包含 CSS transform 与 GSAP transform 动画，存在同一元素 transform 状态被覆盖或累积的风险。`);
  }

  if (/\.node-(?:x|model|y)/.test(html) && /gsap\.[\s\S]*\.node-(?:x|model|y)/.test(html)) {
    findings.push("旧 HTML 的输入/模型/输出节点由 GSAP 直接操作位置或缩放；新实现应改用固定占位布局，避免直接移动关键节点容器。");
  }

  if (/<g\b[^>]*class=["'][^"']*(?:node-x|node-model|node-y)/.test(html)) {
    findings.push("旧 HTML 把关键语义节点放在 SVG <g> 分组内；新实现应优先使用 HTML absolute div 或纯 SVG 固定坐标，关键节点不要挂 transform 动画。");
  }

  return findings.length > 0
    ? findings.join("\n")
    : "旧 HTML 已存在，但未自动识别到具体技术风险；只将其视为失败历史，不要复刻旧实现。";
}

async function regenerateModifiedSceneVisualAsset({
  requestUrl,
  projectId,
  messageId,
  sceneIndex,
  script,
  revisionContext,
}: {
  requestUrl: string;
  projectId: string;
  messageId: string;
  sceneIndex: number;
  script: VideoScriptResult;
  revisionContext: ReturnType<typeof buildSceneRevisionContext>;
}) {
  const assetKind = script.mode === "html-animation" ? "html" : "image";
  const endpoint = new URL(`/api/projects/${projectId}/agent/storyboards/assets`, requestUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageId,
      sceneIndex,
      kind: assetKind,
      force: true,
      revisionContext,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Scene visual regeneration failed: ${response.status}`);
  }
}

async function generateSingleSceneAsset({
  requestUrl,
  projectId,
  messageId,
  sceneIndex,
  kind,
  force = true,
}: {
  requestUrl: string;
  projectId: string;
  messageId: string;
  sceneIndex: number;
  kind: "image" | "html" | "audio";
  force?: boolean;
}) {
  const endpoint = new URL(`/api/projects/${projectId}/agent/storyboards/assets`, requestUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageId,
      sceneIndex,
      kind,
      force,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Scene ${kind} generation failed: ${response.status}`);
  }
}

async function generateInsertedSceneAssets({
  requestUrl,
  projectId,
  messageId,
  sceneIndex,
  script,
}: {
  requestUrl: string;
  projectId: string;
  messageId: string;
  sceneIndex: number;
  script: VideoScriptResult;
}) {
  await generateSingleSceneAsset({
    requestUrl,
    projectId,
    messageId,
    sceneIndex,
    kind: script.mode === "html-animation" ? "html" : "image",
  });
  await generateSingleSceneAsset({
    requestUrl,
    projectId,
    messageId,
    sceneIndex,
    kind: "audio",
  });
}

function buildHtmlAnimationStyleMessages(style: AnimationStyle, exampleHtml: string) {
  return [
    {
      role: "user" as const,
      content: JSON.stringify({
        messageType: "html-animation-style-rule",
        instruction: "后续 HTML 动画脚本生成必须优先遵循这个风格提示词。",
        style: {
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
        messageType: "html-animation-style-example",
        instruction: "这是当前风格对应的示例 HTML。只参考视觉语言、CSS 技法、DOM 组织和动效节奏，不要照抄示例文本内容。",
        styleId: style.id,
        exampleHtml,
      }),
    },
  ];
}

interface AgentMemoryItem {
  kind: "generated-script" | "accepted-action";
  title: string;
  summary?: string;
  scenes?: Array<{
    index: number;
    title: string;
    narration: string;
    visualPrompt: string;
    animationPrompt?: string;
  }>;
  styleConsistency?: VideoScriptResult["styleConsistency"];
  payload?: AgentIntentResult["payload"];
}

async function loadAgentMemory(projectId: string): Promise<AgentMemoryItem[]> {
  const messages = await prisma.agentMessage.findMany({
    where: {
      projectId,
      role: AgentMessageRole.ASSISTANT,
      intentJson: { not: Prisma.JsonNull },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  const memory: AgentMemoryItem[] = [];

  for (const message of messages.reverse()) {
    try {
      const intent = validateAgentIntent(message.intentJson);
      const script = intent.payload.generatedScript;

      if (script) {
        memory.push({
          kind: "generated-script",
          title: script.title,
          summary: script.summary,
          styleConsistency: script.styleConsistency,
          scenes: script.scenes.slice(0, 30).map((scene) => ({
            index: scene.index,
            title: scene.title,
            narration: scene.narration,
            visualPrompt: scene.visualPrompt,
            animationPrompt: scene.animationPrompt,
          })),
        });
        continue;
      }

      if (intent.type !== "OTHER_REJECTED") {
        memory.push({
          kind: "accepted-action",
          title: intent.assistantReply,
          payload: intent.payload,
        });
      }
    } catch {
      // Ignore malformed historical records; memory only uses validated content.
    }
  }

  return memory.slice(-8);
}

async function loadActiveGeneratedScript(projectId: string, metadata: unknown) {
  const activeMessageId = getActiveGeneratedStoryboardMessageId(metadata);

  if (!activeMessageId) {
    return { activeMessageId: "", script: null as VideoScriptResult | null };
  }

  const message = await prisma.agentMessage.findFirst({
    where: {
      id: activeMessageId,
      projectId,
      role: AgentMessageRole.ASSISTANT,
    },
  });

  if (!message) {
    return { activeMessageId, script: null as VideoScriptResult | null };
  }

  try {
    const intent = validateAgentIntent(message.intentJson);
    return { activeMessageId, script: intent.payload.generatedScript ?? null };
  } catch {
    return { activeMessageId, script: null as VideoScriptResult | null };
  }
}

async function loadOriginalUserPrompt(projectId: string) {
  const firstUserMessage = await prisma.agentMessage.findFirst({
    where: {
      projectId,
      role: AgentMessageRole.USER,
    },
    orderBy: { createdAt: "asc" },
  });

  return firstUserMessage?.content ?? "";
}

async function buildPlannedScript({
  projectTitle,
  projectMode,
  userPrompt,
  intent,
  memory,
  htmlAnimationStyle,
  originalUserPrompt,
  currentScript,
  signal,
}: {
  projectTitle: string;
  projectMode: "SLIDESHOW" | "HTML_ANIMATION";
  userPrompt: string;
  intent: AgentIntentResult;
  memory: AgentMemoryItem[];
  htmlAnimationStyle: AnimationStyle;
  originalUserPrompt?: string;
  currentScript?: VideoScriptResult | null;
  signal?: AbortSignal;
}) {
  const generatedScript = await generateVideoScript({
    userPrompt,
    projectTitle,
    mode: toApiMode(projectMode),
    intent,
    memory,
    htmlAnimationStyle,
    originalUserPrompt,
    currentScript,
    signal,
  });

  return planHtmlAnimationLayouts({
    script: generatedScript,
    htmlAnimationStyle,
    signal,
  });
}

async function generateVideoScript({
  userPrompt,
  projectTitle,
  mode,
  intent,
  memory,
  htmlAnimationStyle,
  originalUserPrompt,
  currentScript,
  signal,
}: {
  userPrompt: string;
  projectTitle: string;
  mode: VideoScriptResult["mode"];
  intent: AgentIntentResult;
  memory: AgentMemoryItem[];
  htmlAnimationStyle: AnimationStyle;
  originalUserPrompt?: string;
  currentScript?: VideoScriptResult | null;
  signal?: AbortSignal;
}) {
  const htmlAnimationStyleExample = mode === "html-animation" ? await readHtmlAnimationStyleExample(htmlAnimationStyle) : "";
  const baseMessages = [
    { role: "system" as const, content: buildVideoScriptSystemPrompt(mode) },
    ...(mode === "html-animation" ? buildHtmlAnimationStyleMessages(htmlAnimationStyle, htmlAnimationStyleExample).slice(0, 1) : []),
    {
      role: "user" as const,
      content: buildScriptRequestContent({
        userPrompt,
        projectTitle,
        mode,
        intent,
        memory,
        htmlAnimationStyle,
        originalUserPrompt,
        currentScript,
      }),
    },
  ];
  let lastRaw = "";
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repairMessage =
      attempt === 0
        ? []
        : [
            {
              role: "user" as const,
              content: JSON.stringify({
                messageType: "director-output-repair",
                instruction:
                  "你的上一次输出没有通过程序校验。请保持同一个故事结构和分镜数量，重新输出完整 JSON；只输出 JSON，不要解释。",
                validationError: lastError instanceof Error ? lastError.message : String(lastError),
                requiredForHtmlAnimation:
                  mode === "html-animation"
                    ? {
                        visualPrompt: "至少 120 字",
                        animationPrompt: "至少 120 字",
                        "htmlAnimation.directorPrompt": "至少 120 字",
                        "htmlAnimation.layerPrompt.background/midground/foreground": "每项至少 60 字",
                        "htmlAnimation.animationTimeline.start/middle/end": "每项至少 30 字",
                        "htmlAnimation.cameraPrompt": "至少 60 字",
                        "htmlAnimation.htmlPrompt": "至少 250 字，必须是可直接给 Gemini Flash 执行的单镜头 HTML 动画提示词",
                        "htmlAnimation.motionTechniques": "至少 3 条",
                        "htmlAnimation.negativePrompt": "至少 5 条",
                        "htmlAnimation.revisionHints": "至少 3 条",
                      }
                    : null,
              }),
            },
          ];

    lastRaw = (await callDirectorModel([...baseMessages, ...repairMessage], { signal })) ?? "";

    try {
      return validateVideoScript(parseAgentJson(lastRaw));
    } catch (error) {
      lastError = error;
      console.error("AI script JSON invalid", { attempt: attempt + 1, raw: lastRaw, error });
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI script JSON invalid");
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const messages = await prisma.agentMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ items: messages.map(mapAgentMessage) });
  } catch (error) {
    console.error("Failed to load agent messages", error);
    return NextResponse.json({ error: "Failed to load agent messages" }, { status: 500 });
  }
}

async function confirmRegenerateOutline({
  projectId,
  confirmationMessageId,
  signal,
}: {
  projectId: string;
  confirmationMessageId: string;
  signal?: AbortSignal;
}) {
  const latestMessage = await prisma.agentMessage.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  if (latestMessage?.id !== confirmationMessageId) {
    return NextResponse.json({ error: "该确认操作已过期，请重新发送修改需求。" }, { status: 409 });
  }

  const confirmationMessage = await prisma.agentMessage.findFirst({
    where: {
      id: confirmationMessageId,
      projectId,
      role: AgentMessageRole.ASSISTANT,
    },
  });

  if (!confirmationMessage) {
    return NextResponse.json({ error: "Confirmation message not found" }, { status: 404 });
  }

  const currentIntent = validateAgentIntent(confirmationMessage.intentJson);
  const pendingAction = currentIntent.payload.pendingAction;

  if (!shouldGenerateScriptForIntent(currentIntent.type) || pendingAction?.type !== "CONFIRM_REGENERATE_OUTLINE") {
    return NextResponse.json({ error: "Message does not contain a pending regenerate action" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const memory = await loadAgentMemory(projectId);
  const htmlAnimationStyle = getHtmlAnimationStyleFromMetadata(project.metadata);
  const { script: currentScript } = await loadActiveGeneratedScript(projectId, project.metadata);
  const originalUserPrompt = await loadOriginalUserPrompt(projectId);
  const plannedScript =
    currentIntent.type === "REGENERATE_SCENE" && currentScript
      ? await buildSingleSceneRevisionScript({
          projectTitle: project.title,
          projectMode: project.mode,
          userPrompt: pendingAction.userPrompt,
          intent: currentIntent,
          htmlAnimationStyle,
          currentScript,
          signal,
        })
      : await buildPlannedScript({
          projectTitle: project.title,
          projectMode: project.mode,
          userPrompt: pendingAction.userPrompt,
          intent: currentIntent,
          memory,
          htmlAnimationStyle,
          originalUserPrompt,
          currentScript,
          signal,
        });
  const { pendingAction: _pendingAction, requiresConfirmation: _requiresConfirmation, ...confirmedPayload } = currentIntent.payload;

  const nextIntent: AgentIntentResult = {
    ...currentIntent,
    assistantReply:
      currentIntent.type === "REGENERATE_OUTLINE"
        ? `已重新生成《${plannedScript.title}》的视频逐字稿和 ${plannedScript.scenes.length} 个分镜。`
        : `已根据修改方向更新《${plannedScript.title}》的视频逐字稿和 ${plannedScript.scenes.length} 个分镜。`,
    payload: {
      ...confirmedPayload,
      outline: plannedScript.scenes.map((scene) => scene.title),
      generatedScript: plannedScript,
    },
  };

  const updatedMessage = await prisma.agentMessage.update({
    where: { id: confirmationMessage.id },
    data: {
      content: nextIntent.assistantReply,
      intentJson: nextIntent as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      title: plannedScript.title,
      durationMs: getScriptDurationMs(plannedScript),
      metadata: mergeMetadata(project.metadata, {
        activeGeneratedStoryboardMessageId: updatedMessage.id,
      }),
    },
  });

  return NextResponse.json({
    assistantMessage: mapAgentMessage(updatedMessage),
    intent: nextIntent,
    display: buildAgentDisplay(nextIntent),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as { content?: unknown; action?: unknown; confirmationMessageId?: unknown };

    if (body.action === "confirm-regenerate-outline") {
      if (typeof body.confirmationMessageId !== "string" || !body.confirmationMessageId) {
        return NextResponse.json({ error: "Confirmation message id is required" }, { status: 400 });
      }

      return await confirmRegenerateOutline({
        projectId,
        confirmationMessageId: body.confirmationMessageId,
        signal: request.signal,
      });
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        scenes: {
          where: { deletedAt: null },
          orderBy: { sceneIndex: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const userMessage = await prisma.agentMessage.create({
      data: {
        projectId,
        role: AgentMessageRole.USER,
        content,
      },
    });

    const activeStoryboard = await loadActiveGeneratedScript(projectId, project.metadata);
    const storyboardContext = buildIntentStoryboardContext({
      activeScript: activeStoryboard.script,
      databaseScenes: project.scenes,
    });
    const htmlAnimationStyle = getHtmlAnimationStyleFromMetadata(project.metadata);

    let raw = "";

    try {
      raw =
        (await callIntentModel([
          { role: "system", content: AGENT_INTENT_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              userPrompt: content,
              project: {
                id: project.id,
                title: project.title,
                mode: project.mode,
                durationMs: project.durationMs,
              },
              storyboard: storyboardContext,
              intentContextRules: {
                addSceneInsertionIndex: "For ADD_SCENE, return payload.insertAfterSceneIndex. If the user did not specify an insertion position, return 0.",
                sceneIndexResolution: "如果用户提到第 N 个、最后一个、开头、结尾或某个标题附近的分镜，只使用 storyboard.scenes 的 index/title/narrationBrief 判断目标编号。",
                noCreativeGeneration: "这里只做意图分类和目标分镜编号判断，不生成脚本、提示词或 HTML。",
              },
            }),
          },
        ], { signal: request.signal })) ?? "";
    } catch (error) {
      console.error("AI intent request failed", error);

      const assistantMessage = await prisma.agentMessage.create({
        data: {
          projectId,
          role: AgentMessageRole.ASSISTANT,
          content: "AI 分析服务暂时不可用，请检查模型配置后重试。",
          intentType: AgentIntentType.OTHER_REJECTED,
          errorJson: { message: error instanceof Error ? error.message : String(error) },
        },
      });

      return NextResponse.json({
        userMessage: mapAgentMessage(userMessage),
        assistantMessage: mapAgentMessage(assistantMessage),
        intent: null,
        display: buildErrorDisplay("AI 分析服务暂时不可用，请检查模型配置后重试。"),
      });
    }

    let intent: AgentIntentResult;

    try {
      intent = validateAgentIntent(parseAgentJson(raw));
    } catch (error) {
      console.error("AI output JSON invalid", { raw, error });

      const assistantMessage = await prisma.agentMessage.create({
        data: {
          projectId,
          role: AgentMessageRole.ASSISTANT,
          content: "AI 返回格式异常，暂时无法执行该指令。",
          intentType: AgentIntentType.OTHER_REJECTED,
          errorJson: {
            raw,
            message: error instanceof Error ? error.message : String(error),
          },
        },
      });

      return NextResponse.json({
        userMessage: mapAgentMessage(userMessage),
        assistantMessage: mapAgentMessage(assistantMessage),
        intent: null,
        display: {
          type: "error",
          title: "AI 输出 JSON 失误",
          message: "AI 返回格式异常，已记录错误日志。",
        } satisfies AgentDisplay,
      });
    }
    if (intent.type === "ADD_SCENE") {
      intent = {
        ...intent,
        payload: {
          ...intent.payload,
          insertAfterSceneIndex: getInsertAfterSceneIndex(intent),
        },
      };
    }
    if (intent.type === "DELETE_SCENE") {
      intent = {
        ...intent,
        payload: {
          ...intent.payload,
          sceneIndex: getTargetSceneIndex(intent),
        },
      };
    }
    if (intent.type === "REGENERATE_OUTLINE" && hasGeneratedStoryboardAssets(activeStoryboard?.script)) {
      intent = {
        ...intent,
        assistantReply: "当前视频已经生成了部分分镜画面或旁白音频。本次修改会重新生成并覆盖当前大纲，已生成的画面和旁白将不再作为当前版本使用。请确认是否继续。",
        payload: {
          ...intent.payload,
          requiresConfirmation: true,
          pendingAction: {
            type: "CONFIRM_REGENERATE_OUTLINE",
            userPrompt: content,
            userMessageId: userMessage.id,
            activeStoryboardMessageId: activeStoryboard?.activeMessageId,
          },
        },
      };
    } else if (shouldGenerateScriptForIntent(intent.type)) {
      try {
        const memory = await loadAgentMemory(projectId);
        const originalUserPrompt = isOutlineEditIntent(intent.type) ? await loadOriginalUserPrompt(projectId) : undefined;

        if (intent.type === "DELETE_SCENE" && !activeStoryboard?.script) {
          throw new Error("当前没有可删除的 AI 分镜版本，请先生成视频大纲。");
        }

        const insertionResult =
          intent.type === "ADD_SCENE" && activeStoryboard?.script
            ? await buildSingleSceneInsertionScript({
                userPrompt: content,
                projectTitle: project.title,
                projectMode: project.mode,
                intent,
                htmlAnimationStyle,
                currentScript: activeStoryboard.script,
                signal: request.signal,
              })
            : null;
        const deletionResult =
          intent.type === "DELETE_SCENE" && activeStoryboard?.script
            ? buildSingleSceneDeletionScript({
                currentScript: activeStoryboard.script,
                sceneIndex: getTargetSceneIndex(intent),
              })
            : null;
        const plannedScript = insertionResult
          ? insertionResult.script
          : deletionResult
            ? deletionResult.script
          : intent.type === "REGENERATE_SCENE" && activeStoryboard?.script
            ? await buildSingleSceneRevisionScript({
                userPrompt: content,
                projectTitle: project.title,
                projectMode: project.mode,
                intent,
                htmlAnimationStyle,
                currentScript: activeStoryboard.script,
                signal: request.signal,
              })
            : await buildPlannedScript({
                userPrompt: content,
                projectTitle: project.title,
                projectMode: project.mode,
                intent,
                memory,
                htmlAnimationStyle,
                originalUserPrompt,
                currentScript: activeStoryboard?.script,
                signal: request.signal,
              });

        intent = {
          ...intent,
          assistantReply:
            intent.type === "GENERATE_OUTLINE"
              ? `已生成《${plannedScript.title}》的视频逐字稿和 ${plannedScript.scenes.length} 个分镜。`
              : intent.type === "REGENERATE_SCENE"
                ? `已更新第 ${getRequestedSceneIndex(intent)} 个分镜脚本，正在重新生成该分镜画面。`
                : intent.type === "ADD_SCENE" && insertionResult
                  ? `已新增第 ${insertionResult.insertedSceneIndex} 个分镜，正在生成该分镜的画面和声音。`
                  : intent.type === "DELETE_SCENE" && deletionResult
                    ? `已删除第 ${deletionResult.deletedSceneIndex} 个分镜「${deletionResult.deletedSceneTitle}」，并更新剩余分镜编号。`
                  : `已根据修改方向更新《${plannedScript.title}》的视频逐字稿和 ${plannedScript.scenes.length} 个分镜。`,
          payload: {
            ...intent.payload,
            insertAfterSceneIndex: insertionResult?.insertAfterSceneIndex ?? intent.payload.insertAfterSceneIndex,
            insertedSceneIndex: insertionResult?.insertedSceneIndex,
            deletedSceneIndex: deletionResult?.deletedSceneIndex,
            deletedSceneTitle: deletionResult?.deletedSceneTitle,
            outline: plannedScript.scenes.map((scene) => scene.title),
            generatedScript: plannedScript,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const failureContent =
          intent.type === "DELETE_SCENE"
            ? `删除分镜失败：${errorMessage}`
            : "AI 已识别为生成视频大纲，但脚本结构化生成失败，请稍后重试。";
        const failureTitle = intent.type === "DELETE_SCENE" ? "删除分镜失败" : "脚本生成失败";
        const assistantMessage = await prisma.agentMessage.create({
          data: {
            projectId,
            role: AgentMessageRole.ASSISTANT,
            content: failureContent,
            intentType: AgentIntentType.OTHER_REJECTED,
            errorJson: {
              message: errorMessage,
            },
          },
        });

        return NextResponse.json({
          userMessage: mapAgentMessage(userMessage),
          assistantMessage: mapAgentMessage(assistantMessage),
          intent: null,
          display: {
            type: "error",
            title: failureTitle,
            message: failureContent,
          } satisfies AgentDisplay,
        });
      }
    }

    let assistantMessage = await prisma.agentMessage.create({
      data: {
        projectId,
        role: AgentMessageRole.ASSISTANT,
        content: intent.assistantReply,
        intentType: toDbIntentType(intent.type),
        intentJson: intent as unknown as Prisma.InputJsonValue,
      },
    });

    if (intent.payload.generatedScript) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          title: intent.payload.generatedScript.title,
          durationMs: getScriptDurationMs(intent.payload.generatedScript),
          metadata: mergeMetadata(project.metadata, {
            activeGeneratedStoryboardMessageId: assistantMessage.id,
          }),
        },
      });
    }

    if (intent.type === "ADD_SCENE" && intent.payload.generatedScript && typeof intent.payload.insertedSceneIndex === "number") {
      const sceneIndex = intent.payload.insertedSceneIndex;

      try {
        await generateInsertedSceneAssets({
          requestUrl: request.url,
          projectId,
          messageId: assistantMessage.id,
          sceneIndex,
          script: intent.payload.generatedScript,
        });

        const latestMessage = await prisma.agentMessage.findUnique({
          where: { id: assistantMessage.id },
        });
        const latestIntent = latestMessage?.intentJson ? validateAgentIntent(latestMessage.intentJson) : intent;
        const nextIntent: AgentIntentResult = {
          ...latestIntent,
          assistantReply: `已完成第 ${sceneIndex} 个新增分镜，并生成该分镜的画面和声音。`,
        };

        assistantMessage = await prisma.agentMessage.update({
          where: { id: assistantMessage.id },
          data: {
            content: nextIntent.assistantReply,
            intentJson: nextIntent as unknown as Prisma.InputJsonValue,
          },
        });
        intent = nextIntent;
      } catch (error) {
        const latestMessage = await prisma.agentMessage.findUnique({
          where: { id: assistantMessage.id },
        });
        const latestIntent = latestMessage?.intentJson ? validateAgentIntent(latestMessage.intentJson) : intent;
        const nextIntent: AgentIntentResult = {
          ...latestIntent,
          assistantReply: `已插入第 ${sceneIndex} 个新增分镜，但画面或声音生成失败：${error instanceof Error ? error.message : String(error)}`,
        };

        assistantMessage = await prisma.agentMessage.update({
          where: { id: assistantMessage.id },
          data: {
            content: nextIntent.assistantReply,
            intentJson: nextIntent as unknown as Prisma.InputJsonValue,
          },
        });
        intent = nextIntent;
      }
    }

    if (intent.type === "REGENERATE_SCENE" && intent.payload.generatedScript) {
      const sceneIndex = getRequestedSceneIndex(intent);
      const originalScene = activeStoryboard?.script?.scenes.find((scene) => scene.index === sceneIndex);
      const revisedScene = intent.payload.generatedScript.scenes.find((scene) => scene.index === sceneIndex);

      try {
        await regenerateModifiedSceneVisualAsset({
          requestUrl: request.url,
          projectId,
          messageId: assistantMessage.id,
          sceneIndex,
          script: intent.payload.generatedScript,
          revisionContext: buildSceneRevisionContext({
            originalScene,
            revisedScene,
            userPrompt: content,
          }),
        });

        const latestMessage = await prisma.agentMessage.findUnique({
          where: { id: assistantMessage.id },
        });
        const latestIntent = latestMessage?.intentJson ? validateAgentIntent(latestMessage.intentJson) : intent;
        const nextIntent: AgentIntentResult = {
          ...latestIntent,
          assistantReply: `已完成第 ${sceneIndex} 个分镜的内容修改，并重新生成该分镜画面。`,
        };

        assistantMessage = await prisma.agentMessage.update({
          where: { id: assistantMessage.id },
          data: {
            content: nextIntent.assistantReply,
            intentJson: nextIntent as unknown as Prisma.InputJsonValue,
          },
        });
        intent = nextIntent;
      } catch (error) {
        const latestMessage = await prisma.agentMessage.findUnique({
          where: { id: assistantMessage.id },
        });
        const latestIntent = latestMessage?.intentJson ? validateAgentIntent(latestMessage.intentJson) : intent;
        const nextIntent: AgentIntentResult = {
          ...latestIntent,
          assistantReply: `已更新第 ${sceneIndex} 个分镜脚本，但画面重新生成失败：${error instanceof Error ? error.message : String(error)}`,
        };

        assistantMessage = await prisma.agentMessage.update({
          where: { id: assistantMessage.id },
          data: {
            content: nextIntent.assistantReply,
            intentJson: nextIntent as unknown as Prisma.InputJsonValue,
          },
        });
        intent = nextIntent;
      }
    }

    return NextResponse.json({
      userMessage: mapAgentMessage(userMessage),
      assistantMessage: mapAgentMessage(assistantMessage),
      intent,
      display: buildAgentDisplay(intent),
    });
  } catch (error) {
    console.error("Failed to process agent message", error);
    return NextResponse.json({ error: "Failed to process agent message" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      messageId?: unknown;
      script?: unknown;
    };

    if (typeof body.messageId !== "string" || !body.messageId) {
      return NextResponse.json({ error: "Message id is required" }, { status: 400 });
    }

    const script = validateVideoScript(body.script);
    const message = await prisma.agentMessage.findFirst({
      where: { id: body.messageId, projectId, role: AgentMessageRole.ASSISTANT },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const currentIntent = validateAgentIntent(message.intentJson);
    const nextIntent: AgentIntentResult = {
      ...currentIntent,
      assistantReply: `已保存《${script.title}》的视频逐字稿和 ${script.scenes.length} 个分镜。`,
      payload: {
        ...currentIntent.payload,
        outline: script.scenes.map((scene) => scene.title),
        generatedScript: script,
      },
    };

    const updated = await prisma.agentMessage.update({
      where: { id: message.id },
      data: {
        content: nextIntent.assistantReply,
        intentJson: nextIntent as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: {
        title: script.title,
        durationMs: getScriptDurationMs(script),
      },
    });

    return NextResponse.json({
      message: mapAgentMessage(updated),
      display: buildAgentDisplay(nextIntent),
    });
  } catch (error) {
    console.error("Failed to update generated script", error);
    return NextResponse.json({ error: "Failed to update generated script" }, { status: 500 });
  }
}
