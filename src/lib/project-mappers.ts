import { ProjectMode as DbProjectMode, ProjectStatus as DbProjectStatus, type Project, type ProjectSetting, type StoryboardScene } from "@prisma/client";
import type { ProjectMode, ProjectStatus } from "@/types/project";

export function toDbProjectMode(mode: ProjectMode): DbProjectMode {
  return mode === "html-animation" ? DbProjectMode.HTML_ANIMATION : DbProjectMode.SLIDESHOW;
}

export function toApiProjectMode(mode: DbProjectMode): ProjectMode {
  return mode === DbProjectMode.HTML_ANIMATION ? "html-animation" : "slideshow";
}

export function toApiProjectStatus(status: DbProjectStatus): ProjectStatus {
  return status.toLowerCase() as ProjectStatus;
}

export function isProjectMode(value: unknown): value is ProjectMode {
  return value === "slideshow" || value === "html-animation";
}

function getProjectThumbnailUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as { coverImageUrl?: unknown }).coverImageUrl;
  return typeof value === "string" && value ? value : null;
}

export function mapProject(project: Project) {
  return {
    id: project.id,
    title: project.title,
    mode: toApiProjectMode(project.mode),
    status: toApiProjectStatus(project.status),
    durationMs: project.durationMs,
    thumbnailUrl: getProjectThumbnailUrl(project.metadata),
    updatedAt: project.updatedAt.toISOString(),
    createdAt: project.createdAt.toISOString(),
  };
}

export function mapProjectDetail(project: Project & { settings: ProjectSetting | null }) {
  return {
    ...mapProject(project),
    settings: project.settings
      ? {
          aspectRatio: project.settings.aspectRatio,
          width: project.settings.width,
          height: project.settings.height,
          fps: project.settings.fps,
          defaultSceneDurationMs: project.settings.defaultSceneDurationMs,
          theme: project.settings.theme,
          aiConfig: project.settings.aiConfig,
        }
      : null,
  };
}

export function mapStoryboardScene(scene: StoryboardScene) {
  return {
    id: scene.id,
    index: scene.sceneIndex,
    title: scene.title,
    startMs: scene.startMs,
    durationMs: scene.durationMs,
    thumbnailUrl: null,
    prompt: scene.prompt,
    narration: scene.narration,
    visualConfig: scene.visualConfig,
    animationConfig: scene.animationConfig,
  };
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (sameDay) {
    return `今天 ${time}`;
  }

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
