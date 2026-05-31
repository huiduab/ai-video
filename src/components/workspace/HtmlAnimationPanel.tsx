"use client";

import { Code2 } from "lucide-react";
import { useState } from "react";
import { TimelinePanel, type TimelineItem } from "@/components/workspace/TimelinePanel";

const demoScenes: TimelineItem[] = [
  { id: "h1", index: 1, title: "Logo 入场动画", duration: "00:04", thumbnailClass: "planet-frame" },
  { id: "h2", index: 2, title: "标题文字动效", duration: "00:06", thumbnailClass: "media-frame" },
  { id: "h3", index: 3, title: "图形路径运动", duration: "00:08", thumbnailClass: "city-frame" },
];

export function HtmlAnimationPanel() {
  const [scenes, setScenes] = useState<TimelineItem[]>(demoScenes);
  const [selectedId, setSelectedId] = useState(scenes[0]?.id ?? "");

  function addScene() {
    const scene = {
      id: `html-${Date.now()}`,
      index: scenes.length + 1,
      title: `HTML 动画场景 ${scenes.length + 1}`,
      duration: "00:05",
      thumbnailClass: "media-frame",
    };
    setScenes((current) => [...current, scene]);
    setSelectedId(scene.id);
  }

  const items = scenes.map((scene) => ({
    ...scene,
    badge: (
      <>
        <div className="absolute inset-0 bg-slate-950/20" />
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[#1554ff]">
          <Code2 size={11} />
          HTML
        </div>
      </>
    ),
  }));

  return (
    <TimelinePanel
      title="HTML 动画时间线"
      description="演示组件。工作台当前使用数据库分镜时间线。"
      addLabel="添加场景"
      items={items}
      selectedId={selectedId}
      totalDuration="00:18"
      onAdd={addScene}
      onSelect={setSelectedId}
    />
  );
}

