"use client";

import { Code2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TimelinePanel, type TimelineItem } from "@/components/workspace/TimelinePanel";
import { formatDuration } from "@/lib/project-mappers";
import type { ProjectMode } from "@/types/project";
import type { StoryboardFrame } from "@/types/storyboard";

interface StoryboardTimelineProps {
  projectId: string;
  mode: ProjectMode;
}

export function StoryboardTimeline({ projectId, mode }: StoryboardTimelineProps) {
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFrames = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}/storyboard`, { cache: "no-store" });
      const payload = (await response.json()) as { items?: StoryboardFrame[]; error?: string };

      if (!response.ok || !payload.items) {
        throw new Error(payload.error ?? "分镜加载失败");
      }

      setFrames(payload.items);
      setSelectedId((current) => current || payload.items?.[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "分镜加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setSelectedId("");
    void loadFrames();
  }, [loadFrames]);

  async function addFrame() {
    const response = await fetch(`/api/projects/${projectId}/storyboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const payload = (await response.json()) as { scene?: StoryboardFrame; error?: string };

    if (!response.ok || !payload.scene) {
      setError(payload.error ?? "新增分镜失败");
      return;
    }

    setFrames((current) => [...current, payload.scene!]);
    setSelectedId(payload.scene.id);
  }

  const items: TimelineItem[] = useMemo(
    () =>
      frames.map((frame) => ({
        id: frame.id,
        index: frame.index,
        title: frame.title,
        duration: formatDuration(frame.durationMs),
        thumbnailClass: "media-frame",
        badge:
          mode === "html-animation" ? (
            <>
              <div className="absolute inset-0 bg-slate-950/20" />
              <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[#1554ff]">
                <Code2 size={11} />
                HTML
              </div>
            </>
          ) : undefined,
      })),
    [frames, mode],
  );

  if (loading) {
    return <div className="flex h-[205px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600">正在加载分镜...</div>;
  }

  if (error) {
    return (
      <div className="flex h-[205px] items-center justify-center rounded-xl border border-slate-200 bg-white text-center text-sm text-slate-600">
        <div>
          <p>{error}</p>
          <button className="mt-3 rounded-full bg-[#1554ff] px-4 py-1.5 text-white" onClick={loadFrames}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <TimelinePanel
      title={mode === "html-animation" ? "HTML 动画时间线" : "分镜时间线"}
      description="分镜参数来自 PostgreSQL，可刷新后继续编辑。"
      addLabel={mode === "html-animation" ? "添加场景" : "添加分镜"}
      items={items}
      selectedId={selectedId}
      totalDuration={formatDuration(frames.reduce((sum, frame) => sum + frame.durationMs, 0))}
      onAdd={addFrame}
      onSelect={setSelectedId}
    />
  );
}
