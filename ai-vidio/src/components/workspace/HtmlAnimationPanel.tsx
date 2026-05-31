"use client";

import { Code2 } from "lucide-react";
import { useState } from "react";
import { TimelinePanel, type TimelineItem } from "@/components/workspace/TimelinePanel";

interface HtmlAnimationScene extends TimelineItem {
  startTime: string;
  tag: string;
}

const mockHtmlScenes: HtmlAnimationScene[] = [
  { id: "h1", index: 1, title: "Logo 入场动画", duration: "00:04", startTime: "00:00", thumbnailClass: "planet-frame", tag: "HTML" },
  { id: "h2", index: 2, title: "标题文字动效", duration: "00:06", startTime: "00:04", thumbnailClass: "media-frame", tag: "CSS" },
  { id: "h3", index: 3, title: "图形路径运动", duration: "00:08", startTime: "00:10", thumbnailClass: "city-frame", tag: "Keyframes" },
  { id: "h4", index: 4, title: "数据卡片浮现", duration: "00:06", startTime: "00:18", thumbnailClass: "portal-frame", tag: "CSS" },
  { id: "h5", index: 5, title: "收束转场动画", duration: "00:06", startTime: "00:24", thumbnailClass: "media-frame", tag: "HTML" },
];

export function HtmlAnimationPanel() {
  const [scenes, setScenes] = useState<HtmlAnimationScene[]>(mockHtmlScenes.slice(0, 5));
  const [selectedId, setSelectedId] = useState(scenes[0]?.id ?? "");

  function addScene() {
    const next = mockHtmlScenes[scenes.length % mockHtmlScenes.length];
    const scene = {
      ...next,
      id: `${next.id}-${Date.now()}`,
      index: scenes.length + 1,
      startTime: `00:${String(scenes.length * 6).padStart(2, "0")}`,
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
          {scene.tag}
        </div>
      </>
    ),
  }));

  return (
    <TimelinePanel
      title="HTML 动画时间轴"
      description="点击动画场景可查看镜头代码与动效片段"
      addLabel="添加场景"
      items={items}
      selectedId={selectedId}
      onAdd={addScene}
      onSelect={setSelectedId}
    />
  );
}
