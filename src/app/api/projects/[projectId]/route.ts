import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHtmlAnimationStyle } from "@/lib/html-animation-styles";
import { isProjectMode, mapProjectDetail, toDbProjectMode } from "@/lib/project-mappers";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { settings: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project: mapProjectDetail(project) });
  } catch (error) {
    console.error("Failed to load project", error);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      mode?: unknown;
      htmlAnimationStyleId?: unknown;
    };

    const data: {
      title?: string;
      mode?: ReturnType<typeof toDbProjectMode>;
      metadata?: Prisma.InputJsonValue;
    } = {};

    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }

    if (body.mode !== undefined) {
      if (!isProjectMode(body.mode)) {
        return NextResponse.json({ error: "Invalid project mode" }, { status: 400 });
      }

      data.mode = toDbProjectMode(body.mode);
    }

    if (body.htmlAnimationStyleId !== undefined) {
      const currentProject = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { metadata: true, mode: true },
      });

      if (!currentProject) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      const targetMode = data.mode ?? currentProject.mode;

      if (targetMode === "HTML_ANIMATION") {
        const base = currentProject.metadata && typeof currentProject.metadata === "object" && !Array.isArray(currentProject.metadata) ? currentProject.metadata : {};
        data.metadata = {
          ...base,
          htmlAnimationStyleId: getHtmlAnimationStyle(body.htmlAnimationStyleId).id,
        } as Prisma.InputJsonValue;
      }
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data,
      include: { settings: true },
    });

    return NextResponse.json({ project: mapProjectDetail(project) });
  } catch (error) {
    console.error("Failed to update project", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete project", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
