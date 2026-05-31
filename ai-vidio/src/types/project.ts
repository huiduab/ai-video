export type ProjectMode = "slideshow" | "html-animation";

export interface ProjectItem {
  id: string;
  title: string;
  mode: ProjectMode;
  updatedAt: string;
  duration: string;
  thumbnailClass: string;
}
