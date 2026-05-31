import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapStoryboardScene } from "@/lib/project-mappers";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const scenes = await prisma.storyboardScene.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { sceneIndex: "asc" },
    });

    return NextResponse.json({ items: scenes.map(mapStoryboardScene) });
  } catch (error) {
    console.error("Failed to load storyboard", error);
    return NextResponse.json({ error: "Failed to load storyboard" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      durationMs?: unknown;
    };

    const lastScene = await prisma.storyboardScene.findFirst({
      where: { projectId, deletedAt: null },
      orderBy: { sceneIndex: "desc" },
    });

    const sceneIndex = (lastScene?.sceneIndex ?? 0) + 1;
    const startMs = lastScene ? lastScene.startMs + lastScene.durationMs : 0;
    const durationMs = typeof body.durationMs === "number" && body.durationMs > 0 ? body.durationMs : 5000;

    const scene = await prisma.$transaction(async (tx) => {
      const created = await tx.storyboardScene.create({
        data: {
          projectId,
          sceneIndex,
          title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : `分镜 ${sceneIndex}`,
          startMs,
          durationMs,
        },
      });

      const sceneTrack = await tx.timelineTrack.findFirst({
        where: { projectId, trackType: "scene" },
        orderBy: { trackIndex: "asc" },
      });

      if (sceneTrack) {
        await tx.timelineClip.create({
          data: {
            projectId,
            trackId: sceneTrack.id,
            sceneId: created.id,
            startMs,
            durationMs,
            clipIndex: sceneIndex,
          },
        });
      }

      await tx.project.update({
        where: { id: projectId },
        data: { durationMs: startMs + durationMs },
      });

      return created;
    });

    return NextResponse.json({ scene: mapStoryboardScene(scene) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create storyboard scene", error);
    return NextResponse.json({ error: "Failed to create storyboard scene" }, { status: 500 });
  }
}

