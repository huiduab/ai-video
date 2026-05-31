"use client";

import { useState } from "react";
import { mockStoryboard } from "@/data/mockStoryboard";
import { TimelinePanel } from "@/components/workspace/TimelinePanel";
import type { StoryboardFrame } from "@/types/storyboard";

export function StoryboardTimeline() {
  const [frames, setFrames] = useState<StoryboardFrame[]>(mockStoryboard.slice(0, 5));
  const [selectedId, setSelectedId] = useState(frames[0]?.id ?? "");

  function addFrame() {
    const next = mockStoryboard[frames.length % mockStoryboard.length];
    const frame = {
      ...next,
      id: `${next.id}-${Date.now()}`,
      index: frames.length + 1,
      startTime: `00:${String(frames.length * 6).padStart(2, "0")}`,
    };
    setFrames((current) => [...current, frame]);
    setSelectedId(frame.id);
  }

  return (
    <TimelinePanel
      title="分镜时间轴"
      description="点击分镜可精确修改时长片段"
      addLabel="添加分镜"
      items={frames}
      selectedId={selectedId}
      onAdd={addFrame}
      onSelect={setSelectedId}
    />
  );
}
