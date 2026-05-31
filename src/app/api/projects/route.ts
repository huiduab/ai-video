import { ProjectStatus, TaskStatus, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isProjectMode, mapProject, toDbProjectMode } from "@/lib/project-mappers";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: Number.isFinite(limit) && limit > 0 ? limit : 50,
    });

    return NextResponse.json({ items: projects.map(mapProject) });
  } catch (error) {
    console.error("Failed to load projects", error);
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      mode?: unknown;
      title?: unknown;
    };

    if (!isProjectMode(body.mode)) {
      return NextResponse.json({ error: "Invalid project mode" }, { status: 400 });
    }

    const mode = body.mode;
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "未命名项目";
    const durationMs = 5000;

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title,
          mode: toDbProjectMode(mode),
          status: ProjectStatus.INITIALIZING,
          durationMs,
        },
      });

      await tx.projectSetting.create({
        data: {
          projectId: created.id,
          aspectRatio: "16:9",
          width: 1920,
          height: 1080,
          fps: 30,
          defaultSceneDurationMs: durationMs,
        },
      });

      const scene = await tx.storyboardScene.create({
        data: {
          projectId: created.id,
          sceneIndex: 1,
          title: mode === "html-animation" ? "HTML 动画场景 1" : "图片分镜 1",
          startMs: 0,
          durationMs,
          visualConfig: {
            placeholder: true,
            mode,
          },
          animationConfig: {
            transition: mode === "html-animation" ? "keyframes" : "pan-and-zoom",
          },
        },
      });

      const sceneTrack = await tx.timelineTrack.create({
        data: {
          projectId: created.id,
          name: "Scene",
          trackType: "scene",
          trackIndex: 1,
        },
      });

      await tx.timelineTrack.createMany({
        data: [
          {
            projectId: created.id,
            name: "Audio",
            trackType: "audio",
            trackIndex: 2,
          },
          {
            projectId: created.id,
            name: "Caption",
            trackType: "caption",
            trackIndex: 3,
          },
        ],
      });

      await tx.timelineClip.create({
        data: {
          projectId: created.id,
          trackId: sceneTrack.id,
          sceneId: scene.id,
          startMs: 0,
          durationMs,
          clipIndex: 1,
        },
      });

      await tx.generationTask.create({
        data: {
          projectId: created.id,
          type: TaskType.INITIALIZE_PROJECT,
          status: TaskStatus.SUCCEEDED,
          progress: 100,
          startedAt: new Date(),
          finishedAt: new Date(),
          input: { mode },
          output: { sceneId: scene.id },
        },
      });

      return tx.project.update({
        where: { id: created.id },
        data: { status: ProjectStatus.DRAFT },
      });
    });

    return NextResponse.json({ project: mapProject(project) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
