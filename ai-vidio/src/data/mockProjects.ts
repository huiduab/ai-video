import type { ProjectItem } from "@/types/project";

export const mockProjects: ProjectItem[] = [
  {
    id: "p1",
    title: "星际探险：新纪元",
    mode: "slideshow",
    updatedAt: "今天 14:20",
    duration: "00:30",
    thumbnailClass: "planet-frame",
  },
  {
    id: "p2",
    title: "未来之城：黎明",
    mode: "html-animation",
    updatedAt: "今天 11:45",
    duration: "00:45",
    thumbnailClass: "city-frame",
  },
  {
    id: "p3",
    title: "产品发布会开场",
    mode: "slideshow",
    updatedAt: "今天 10:20",
    duration: "00:28",
    thumbnailClass: "portal-frame",
  },
];
