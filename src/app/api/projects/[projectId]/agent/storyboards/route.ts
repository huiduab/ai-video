import { access, stat } from "node:fs/promises";
import path from "node:path";
import { AgentMessageRole, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { validateAgentIntent } from "@/lib/agent/intent-validator";
import { prisma } from "@/lib/db";
import type { VideoScriptResult } from "@/types/agent";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

interface GeneratedStoryboard {
  messageId: string;
  title: string;
  summary: string;
  createdAt: string;
  script: VideoScriptResult;
}

function getActiveMessageId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = (metadata as { activeGeneratedStoryboardMessageId?: unknown }).activeGeneratedStoryboardMessageId;
  return typeof value === "string" ? value : "";
}

function mergeActiveMessageId(metadata: unknown, messageId: string): Prisma.InputJsonValue {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return {
    ...base,
    activeGeneratedStoryboardMessageId: messageId,
  } as Prisma.InputJsonValue;
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

async function collectGeneratedStoryboards(messages: Array<{ id: string; createdAt: Date; intentJson: unknown }>) {
  const storyboards: GeneratedStoryboard[] = [];

  for (const message of messages) {
    try {
      const intent = validateAgentIntent(message.intentJson);
      const script = intent.payload.generatedScript;

      if (!script) {
        continue;
      }

      storyboards.push({
        messageId: message.id,
        title: script.title,
        summary: script.summary,
        createdAt: message.createdAt.toISOString(),
        script: await normalizeMissingGeneratedAssets(script),
      });
    } catch {
      // Ignore malformed historical records; workspace only uses validated generated scripts.
    }
  }

  return storyboards;
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, metadata: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const messages = await prisma.agentMessage.findMany({
      where: {
        projectId,
        role: AgentMessageRole.ASSISTANT,
        intentJson: { not: Prisma.JsonNull },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const storyboards = await collectGeneratedStoryboards(messages);
    const configuredActiveId = getActiveMessageId(project.metadata);
    const activeMessageId = storyboards.some((storyboard) => storyboard.messageId === configuredActiveId)
      ? configuredActiveId
      : storyboards[0]?.messageId ?? "";
    const active = storyboards.find((storyboard) => storyboard.messageId === activeMessageId) ?? null;

    return NextResponse.json({ items: storyboards, activeMessageId, active });
  } catch (error) {
    console.error("Failed to load generated storyboards", error);
    return NextResponse.json({ error: "Failed to load generated storyboards" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as { activeMessageId?: unknown };
    const activeMessageId = typeof body.activeMessageId === "string" ? body.activeMessageId : "";

    if (!activeMessageId) {
      return NextResponse.json({ error: "Active storyboard id is required" }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, metadata: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const message = await prisma.agentMessage.findFirst({
      where: {
        id: activeMessageId,
        projectId,
        role: AgentMessageRole.ASSISTANT,
        intentJson: { not: Prisma.JsonNull },
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Generated storyboard not found" }, { status: 404 });
    }

    const intent = validateAgentIntent(message.intentJson);

    if (!intent.payload.generatedScript) {
      return NextResponse.json({ error: "Message does not contain generated storyboard" }, { status: 400 });
    }

    await prisma.project.update({
      where: { id: project.id },
      data: { metadata: mergeActiveMessageId(project.metadata, activeMessageId) },
    });

    return NextResponse.json({ ok: true, activeMessageId });
  } catch (error) {
    console.error("Failed to select generated storyboard", error);
    return NextResponse.json({ error: "Failed to select generated storyboard" }, { status: 500 });
  }
}
