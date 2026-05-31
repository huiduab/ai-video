import type { StoryboardFrame } from "@/types/storyboard";

export const mockStoryboard: StoryboardFrame[] = [
  {
    id: "s1",
    index: 1,
    title: "开场：星球全景",
    duration: "00:04",
    startTime: "00:00",
    thumbnailClass: "planet-frame",
  },
  {
    id: "s2",
    index: 2,
    title: "航行：穿越云层",
    duration: "00:06",
    startTime: "00:06",
    thumbnailClass: "media-frame",
  },
  {
    id: "s3",
    index: 3,
    title: "降落：未来都市",
    duration: "00:06",
    startTime: "00:12",
    thumbnailClass: "city-frame",
  },
  {
    id: "s4",
    index: 4,
    title: "人物特写：情绪",
    duration: "00:06",
    startTime: "00:18",
    thumbnailClass: "portal-frame",
  },
  {
    id: "s5",
    index: 5,
    title: "未来之门：结尾",
    duration: "00:08",
    startTime: "00:24",
    thumbnailClass: "media-frame",
  },
];
