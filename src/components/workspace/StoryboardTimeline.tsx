"use client";

import { Code2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TimelinePanel, type TimelineItem } from "@/components/workspace/TimelinePanel";
import { formatDuration, formatRelativeTime } from "@/lib/project-mappers";
import type { ProjectMode } from "@/types/project";
import type { GeneratedStoryboardOption, StoryboardFrame } from "@/types/storyboard";

interface StoryboardTimelineProps {
  projectId: string;
  mode: ProjectMode;
  onActiveFrameChange?: (frame: StoryboardFrame | null, storyboard: GeneratedStoryboardOption | null) => void;
}

function sceneToFrame(scene: GeneratedStoryboardOption["script"]["scenes"][number], startMs: number): StoryboardFrame {
  const durationMs = scene.durationMs ?? 5000;

  return {
    id: `generated-scene-${scene.index}`,
    index: scene.index,
    title: scene.title,
    startMs,
    durationMs,
    thumbnailUrl: null,
    prompt: scene.visualPrompt,
    narration: scene.narration,
    visualConfig: {
      generated: true,
      visualPrompt: scene.visualPrompt,
    },
    animationConfig: {
      generated: true,
      animationPrompt: scene.animationPrompt ?? "",
    },
  };
}

function storyboardToFrames(storyboard: GeneratedStoryboardOption | null): StoryboardFrame[] {
  if (!storyboard) {
    return [];
  }

  let startMs = 0;

  return storyboard.script.scenes.map((scene) => {
    const frame = sceneToFrame(scene, startMs);
    startMs += frame.durationMs;
    return frame;
  });
}

export function StoryboardTimeline({ projectId, mode, onActiveFrameChange }: StoryboardTimelineProps) {
  const [storyboards, setStoryboards] = useState<GeneratedStoryboardOption[]>([]);
  const [activeMessageId, setActiveMessageId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeStoryboard = useMemo(
    () => storyboards.find((storyboard) => storyboard.messageId === activeMessageId) ?? storyboards[0] ?? null,
    [activeMessageId, storyboards],
  );
  const frames = useMemo(() => storyboardToFrames(activeStoryboard), [activeStoryboard]);

  const loadGeneratedStoryboards = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/storyboards`, { cache: "no-store" });
      const payload = (await response.json()) as {
        items?: GeneratedStoryboardOption[];
        activeMessageId?: string;
        error?: string;
      };

      if (!response.ok || !payload.items) {
        throw new Error(payload.error ?? "生成分镜加载失败");
      }

      setStoryboards(payload.items);
      setActiveMessageId(payload.activeMessageId ?? payload.items[0]?.messageId ?? "");
      setSelectedId("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "生成分镜加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setSelectedId("");
    void loadGeneratedStoryboards();
  }, [loadGeneratedStoryboards]);

  useEffect(() => {
    const nextFrame = frames.find((frame) => frame.id === selectedId) ?? frames[0] ?? null;

    if (nextFrame && nextFrame.id !== selectedId) {
      setSelectedId(nextFrame.id);
    }

    onActiveFrameChange?.(nextFrame, activeStoryboard);
  }, [activeStoryboard, frames, onActiveFrameChange, selectedId]);

  async function selectStoryboard(messageId: string) {
    setActiveMessageId(messageId);
    setSelectedId("");

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/storyboards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeMessageId: messageId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "切换分镜失败");
      }
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "切换分镜失败");
    }
  }

  function handleSelectFrame(id: string) {
    setSelectedId(id);
    onActiveFrameChange?.(frames.find((frame) => frame.id === id) ?? null, activeStoryboard);
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
    return <div className="flex h-[205px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600">正在加载 Agent 生成分镜...</div>;
  }

  if (error) {
    return (
      <div className="flex h-[205px] items-center justify-center rounded-xl border border-slate-200 bg-white text-center text-sm text-slate-600">
        <div>
          <p>{error}</p>
          <button className="mt-3 rounded-full bg-[#1554ff] px-4 py-1.5 text-white" onClick={loadGeneratedStoryboards}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!activeStoryboard) {
    return (
      <div className="flex h-[205px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-600">
        <div>
          <p className="font-medium text-slate-900">暂无 Agent 生成分镜</p>
          <p className="mt-2">在右侧 AI 助手中输入“生成视频大纲”，生成后这里会显示真实分镜。</p>
        </div>
      </div>
    );
  }

  return (
    <TimelinePanel
      title={mode === "html-animation" ? "当前 HTML 动画分镜" : "当前图片轮播分镜"}
      description={`来自 Agent：${activeStoryboard.title}`}
      addLabel="刷新"
      items={items}
      selectedId={selectedId}
      totalDuration={formatDuration(frames.reduce((sum, frame) => sum + frame.durationMs, 0))}
      onAdd={loadGeneratedStoryboards}
      onSelect={handleSelectFrame}
      showAddActions={false}
      actionSlot={
        <div className="flex items-center gap-2">
          {storyboards.length > 1 && (
            <select
              aria-label="选择 Agent 生成分镜"
              value={activeStoryboard.messageId}
              onChange={(event) => void selectStoryboard(event.target.value)}
              className="h-9 max-w-56 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-[#1554ff]"
            >
              {storyboards.map((storyboard) => (
                <option key={storyboard.messageId} value={storyboard.messageId}>
                  {storyboard.title} · {formatRelativeTime(storyboard.createdAt)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={loadGeneratedStoryboards}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:border-[#1554ff] hover:text-[#1554ff]"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      }
    />
  );
}
