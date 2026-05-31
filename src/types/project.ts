export type ProjectMode = "slideshow" | "html-animation";
export type ProjectStatus = "draft" | "initializing" | "generating" | "ready" | "failed" | "archived";

export interface ProjectItem {
  id: string;
  title: string;
  mode: ProjectMode;
  status: ProjectStatus;
  updatedAt: string;
  durationMs: number;
  thumbnailUrl: string | null;
}
