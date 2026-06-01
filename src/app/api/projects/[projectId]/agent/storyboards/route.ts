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

function collectGeneratedStoryboards(messages: Array<{ id: string; createdAt: Date; intentJson: unknown }>) {
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
        script,
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

    const storyboards = collectGeneratedStoryboards(messages);
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
