import { AgentIntentType, AgentMessageRole, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { buildAgentDisplay } from "@/lib/agent/display";
import { mapAgentMessage } from "@/lib/agent/mappers";
import { callIntentModel } from "@/lib/agent/openai-compatible";
import { AGENT_INTENT_SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { parseAgentJson, validateAgentIntent } from "@/lib/agent/intent-validator";
import { buildVideoScriptSystemPrompt } from "@/lib/agent/script-prompt";
import { validateVideoScript } from "@/lib/agent/script-validator";
import { prisma } from "@/lib/db";
import { readHtmlAnimationStyleExample } from "@/lib/html-animation-style-examples";
import { getHtmlAnimationStyleFromMetadata, type AnimationStyle } from "@/lib/html-animation-styles";
import { getScriptDurationMs } from "@/lib/storyboard-playback";
import type { AgentDisplay, AgentIntentResult, VideoScriptResult } from "@/types/agent";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function toDbIntentType(type: AgentIntentResult["type"]): AgentIntentType {
  return AgentIntentType[type];
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
}: {
  userPrompt: string;
  mode: VideoScriptResult["mode"];
  projectTitle: string;
  intent: AgentIntentResult;
  memory: AgentMemoryItem[];
  htmlAnimationStyle: AnimationStyle;
}) {
  return JSON.stringify({
    userPrompt,
    projectTitle,
    mode,
    htmlAnimationStyle:
      mode === "html-animation"
        ? {
            id: htmlAnimationStyle.id,
            name: htmlAnimationStyle.name,
            description: htmlAnimationStyle.description,
            prompt: htmlAnimationStyle.prompt,
          }
        : null,
    memory,
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
    },
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

async function generateVideoScript({
  userPrompt,
  projectTitle,
  mode,
  intent,
  memory,
  htmlAnimationStyle,
}: {
  userPrompt: string;
  projectTitle: string;
  mode: VideoScriptResult["mode"];
  intent: AgentIntentResult;
  memory: AgentMemoryItem[];
  htmlAnimationStyle: AnimationStyle;
}) {
  const htmlAnimationStyleExample = mode === "html-animation" ? await readHtmlAnimationStyleExample(htmlAnimationStyle) : "";
  const raw =
    (await callIntentModel([
      { role: "system", content: buildVideoScriptSystemPrompt(mode) },
      ...(mode === "html-animation" ? buildHtmlAnimationStyleMessages(htmlAnimationStyle, htmlAnimationStyleExample) : []),
      {
        role: "user",
        content: buildScriptRequestContent({
          userPrompt,
          projectTitle,
          mode,
          intent,
          memory,
          htmlAnimationStyle,
        }),
      },
    ])) ?? "";

  try {
    return validateVideoScript(parseAgentJson(raw));
  } catch (error) {
    console.error("AI script JSON invalid", { raw, error });
    throw error;
  }
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

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as { content?: unknown };
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

    const storyboardContext = project.scenes.map((scene) => ({
      index: scene.sceneIndex,
      title: scene.title,
      prompt: scene.prompt,
      narration: scene.narration,
    }));
    const memory = await loadAgentMemory(projectId);
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
              memory,
            }),
          },
        ])) ?? "";
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

    if (intent.type === "GENERATE_OUTLINE" || intent.type === "REGENERATE_OUTLINE") {
      try {
        const generatedScript = await generateVideoScript({
          userPrompt: content,
          projectTitle: project.title,
          mode: toApiMode(project.mode),
          intent,
          memory,
          htmlAnimationStyle,
        });

        intent = {
          ...intent,
          assistantReply: `已生成《${generatedScript.title}》的视频逐字稿和 ${generatedScript.scenes.length} 个分镜。`,
          payload: {
            ...intent.payload,
            outline: generatedScript.scenes.map((scene) => scene.title),
            generatedScript,
          },
        };
      } catch (error) {
        const assistantMessage = await prisma.agentMessage.create({
          data: {
            projectId,
            role: AgentMessageRole.ASSISTANT,
            content: "AI 已识别为生成视频大纲，但脚本结构化生成失败，请稍后重试。",
            intentType: AgentIntentType.OTHER_REJECTED,
            errorJson: {
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
            title: "脚本生成失败",
            message: "AI 已识别为生成视频大纲，但脚本结构化生成失败，请稍后重试。",
          } satisfies AgentDisplay,
        });
      }
    }

    const display = buildAgentDisplay(intent);
    const assistantMessage = await prisma.agentMessage.create({
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

    return NextResponse.json({
      userMessage: mapAgentMessage(userMessage),
      assistantMessage: mapAgentMessage(assistantMessage),
      intent,
      display,
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
