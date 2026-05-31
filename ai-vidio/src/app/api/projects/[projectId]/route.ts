import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
    };

    const data: {
      title?: string;
      mode?: ReturnType<typeof toDbProjectMode>;
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

