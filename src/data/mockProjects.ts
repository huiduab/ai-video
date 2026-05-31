import type { ProjectItem } from "@/types/project";

export const mockProjects: ProjectItem[] = [
  {
    id: "p1",
    title: "示例图片轮播项目",
    mode: "slideshow",
    status: "draft",
    updatedAt: new Date().toISOString(),
    durationMs: 30000,
    thumbnailUrl: null,
  },
  {
    id: "p2",
    title: "示例 HTML 动画项目",
    mode: "html-animation",
    status: "draft",
    updatedAt: new Date().toISOString(),
    durationMs: 45000,
    thumbnailUrl: null,
  },
];

