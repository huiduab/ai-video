import { parseAgentJson } from "@/lib/agent/intent-validator";
import { callHtmlLayoutModel, getHtmlLayoutModelName } from "@/lib/agent/openai-compatible";
import { ensureHtmlAnimationDirectorDetail, validateVideoScript } from "@/lib/agent/script-validator";
import { buildStrictVisualPromptAppendix } from "@/lib/agent/visual-prompt-standards";
import { chooseHtmlAnimationTemplate } from "@/lib/html-animation-templates";
import type { AnimationStyle } from "@/lib/html-animation-styles";
import type { HtmlAnimationBlueprint, VideoScriptResult, VideoScriptScene } from "@/types/agent";

const DEFAULT_HTML_LAYOUT_CONCURRENCY = 4;

interface HtmlLayoutPlanResult {
  sceneIndex: number;
  animationPrompt?: string;
  htmlAnimation?: HtmlAnimationBlueprint;
}

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildHtmlLayoutSystemPrompt() {
  return `
你是 HTML 视频动画编排师，不写最终 HTML 代码。
你的任务是只为一个分镜生成可交给 HTML 执行器的视觉编排方案。
必须只返回合法 JSON，不要 Markdown，不要解释文字。

职责边界：
1. 不生成 <!doctype html>、HTML、CSS、JS 代码。
2. 只决定当前分镜的布局结构、视觉层次、动效节奏、字幕安全区、模板选择和执行提示。
3. 当前分镜必须独立完整，但要遵循全片 styleConsistency 和 htmlAnimationStyle。
4. 关键信息、主视觉、图形节点和重要文字必须位于画面上方约 72% 区域；底部 18-22% 保持为字幕安全区。
5. 画面不能是单一大标题页，至少包含标题/关键词、主体图形、辅助信息或数据节点三类内容。
6. animationPrompt 要面向 HTML 执行器，描述结构和动效，但不要输出代码。

返回 JSON 格式：
{
  "sceneIndex": 1,
  "animationPrompt": "当前分镜的 HTML 动画执行提示",
  "htmlAnimation": {
    "templateId": "data-flow-network",
    "visualMetaphor": "图形隐喻",
    "directorPrompt": "2-3 句导演说明",
    "layerPrompt": {
      "background": "背景层说明",
      "midground": "中景主体层说明",
      "foreground": "前景强调层说明"
    },
    "animationTimeline": {
      "start": "开场动效",
      "middle": "中段动效",
      "end": "收束动效"
    },
    "cameraPrompt": "镜头和安全区说明",
    "motionTechniques": ["technique 1", "technique 2", "technique 3"],
    "htmlPrompt": "给 HTML 执行器的单镜头详细提示，不写完整故事，不写代码",
    "negativePrompt": ["禁止项 1", "禁止项 2", "禁止项 3", "禁止项 4", "禁止项 5"],
    "revisionHints": ["修改建议 1", "修改建议 2", "修改建议 3"],
    "motionBeats": [
      { "timeMs": 0, "action": "开场动作" },
      { "timeMs": 800, "action": "主体出现" },
      { "timeMs": 1800, "action": "关键运动" },
      { "timeMs": 3200, "action": "收束定格" }
    ],
    "focusPath": "观众视线移动路径",
    "emphasisMoments": ["关键词"],
    "transitionIntent": "与前后分镜的衔接意图"
  }
}
`;
}

function buildHtmlLayoutUserContent({
  script,
  scene,
  htmlAnimationStyle,
}: {
  script: VideoScriptResult;
  scene: VideoScriptScene;
  htmlAnimationStyle: AnimationStyle;
}) {
  const template = chooseHtmlAnimationTemplate(scene);
  const previousScene = script.scenes.find((item) => item.index === scene.index - 1);
  const nextScene = script.scenes.find((item) => item.index === scene.index + 1);

  return JSON.stringify({
    video: {
      title: script.title,
      summary: script.summary,
      mode: script.mode,
      styleConsistency: script.styleConsistency,
    },
    htmlAnimationStyle: {
      id: htmlAnimationStyle.id,
      name: htmlAnimationStyle.name,
      description: htmlAnimationStyle.description,
      prompt: htmlAnimationStyle.prompt,
    },
    currentScene: {
      index: scene.index,
      title: scene.title,
      narration: scene.narration,
      visualPrompt: scene.visualPrompt,
      durationMs: scene.durationMs,
    },
    neighboringScenes: {
      previous: previousScene
        ? {
            index: previousScene.index,
            title: previousScene.title,
            narration: previousScene.narration,
            visualPrompt: previousScene.visualPrompt,
          }
        : null,
      next: nextScene
        ? {
            index: nextScene.index,
            title: nextScene.title,
            narration: nextScene.narration,
            visualPrompt: nextScene.visualPrompt,
          }
        : null,
    },
    selectedTemplate: template,
    strictVisualPromptAppendix: buildStrictVisualPromptAppendix("html-animation"),
    outputRequirements: {
      sceneIndex: scene.index,
      noCode: "不要输出 HTML/CSS/JS 代码，只输出 JSON 编排方案。",
      concurrencyNote: "这是单分镜并发编排请求，不能依赖其他分镜先完成。",
      subtitleSafeZone: "底部 18-22% 留给外层字幕和播放器，不放核心内容。",
    },
  });
}

async function planSingleSceneHtmlLayout({
  script,
  scene,
  htmlAnimationStyle,
  signal,
}: {
  script: VideoScriptResult;
  scene: VideoScriptScene;
  htmlAnimationStyle: AnimationStyle;
  signal?: AbortSignal;
}) {
  const raw = await callHtmlLayoutModel([
    { role: "system", content: buildHtmlLayoutSystemPrompt() },
    { role: "user", content: buildHtmlLayoutUserContent({ script, scene, htmlAnimationStyle }) },
  ], { signal });
  const parsed = parseAgentJson(raw ?? "") as Partial<HtmlLayoutPlanResult>;

  if (typeof parsed.sceneIndex !== "number" || parsed.sceneIndex !== scene.index) {
    throw new Error(`HTML layout scene index mismatch: expected ${scene.index}, received ${String(parsed.sceneIndex)}`);
  }

  return parsed;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

export async function planHtmlAnimationLayouts({
  script,
  htmlAnimationStyle,
  concurrency = toPositiveInt(process.env.HTML_LAYOUT_CONCURRENCY, DEFAULT_HTML_LAYOUT_CONCURRENCY),
  signal,
}: {
  script: VideoScriptResult;
  htmlAnimationStyle: AnimationStyle;
  concurrency?: number;
  signal?: AbortSignal;
}) {
  if (script.mode !== "html-animation") {
    return script;
  }

  const startedAt = Date.now();
  console.info("[ai:html-layout:batch:start]", {
    model: getHtmlLayoutModelName(),
    sceneCount: script.scenes.length,
    concurrency,
  });

  const plannedScenes = await mapWithConcurrency(script.scenes, concurrency, async (scene) => {
    if (signal?.aborted) {
      throw new Error("HTML layout planning aborted");
    }

    try {
      const plan = await planSingleSceneHtmlLayout({ script, scene, htmlAnimationStyle, signal });

      return {
        ...scene,
        animationPrompt: typeof plan.animationPrompt === "string" && plan.animationPrompt.trim() ? plan.animationPrompt.trim() : scene.animationPrompt,
        htmlAnimation: plan.htmlAnimation ?? scene.htmlAnimation,
      };
    } catch (error) {
      console.error("[ai:html-layout:scene:fallback]", {
        sceneIndex: scene.index,
        message: error instanceof Error ? error.message : String(error),
      });

      const fallbackScene = { ...scene };
      ensureHtmlAnimationDirectorDetail(fallbackScene);
      return fallbackScene;
    }
  });

  const plannedScript = validateVideoScript({
    ...script,
    scenes: plannedScenes,
  });

  console.info("[ai:html-layout:batch:complete]", {
    sceneCount: script.scenes.length,
    concurrency,
    durationMs: Date.now() - startedAt,
  });

  return plannedScript;
}

export async function planSingleHtmlAnimationLayoutInScript({
  script,
  sceneIndex,
  htmlAnimationStyle,
  signal,
}: {
  script: VideoScriptResult;
  sceneIndex: number;
  htmlAnimationStyle: AnimationStyle;
  signal?: AbortSignal;
}) {
  if (script.mode !== "html-animation") {
    return script;
  }

  const scene = script.scenes.find((item) => item.index === sceneIndex);

  if (!scene) {
    return script;
  }

  try {
    const plan = await planSingleSceneHtmlLayout({ script, scene, htmlAnimationStyle, signal });
    const nextScenes = script.scenes.map((item) =>
      item.index === sceneIndex
        ? {
            ...item,
            animationPrompt: typeof plan.animationPrompt === "string" && plan.animationPrompt.trim() ? plan.animationPrompt.trim() : item.animationPrompt,
            htmlAnimation: plan.htmlAnimation ?? item.htmlAnimation,
          }
        : item,
    );

    return validateVideoScript({
      ...script,
      scenes: nextScenes,
    });
  } catch (error) {
    console.error("[ai:html-layout:scene:fallback]", {
      sceneIndex,
      message: error instanceof Error ? error.message : String(error),
    });

    const nextScenes = script.scenes.map((item) => {
      if (item.index !== sceneIndex) {
        return item;
      }

      const fallbackScene = { ...item };
      ensureHtmlAnimationDirectorDetail(fallbackScene);
      return fallbackScene;
    });

    return validateVideoScript({
      ...script,
      scenes: nextScenes,
    });
  }
}
