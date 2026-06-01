"use client";

import { useCallback, useState } from "react";
import { VideoPreview } from "@/components/common/VideoPreview";
import { EditorToolbar } from "@/components/workspace/EditorToolbar";
import { StoryboardTimeline } from "@/components/workspace/StoryboardTimeline";
import { formatDuration } from "@/lib/project-mappers";
import type { ProjectMode } from "@/types/project";
import type { GeneratedStoryboardOption, StoryboardFrame } from "@/types/storyboard";

interface EditorCanvasProps {
  projectId: string;
  activeMode: ProjectMode;
  onModeChange: (mode: ProjectMode) => void;
}

export function EditorCanvas({ projectId, activeMode, onModeChange }: EditorCanvasProps) {
  const [activeFrame, setActiveFrame] = useState<StoryboardFrame | null>(null);
  const [activeStoryboard, setActiveStoryboard] = useState<GeneratedStoryboardOption | null>(null);
  const handleActiveFrameChange = useCallback((frame: StoryboardFrame | null, storyboard: GeneratedStoryboardOption | null) => {
    setActiveFrame(frame);
    setActiveStoryboard(storyboard);
  }, []);
  const totalDurationMs = activeStoryboard?.script.scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 5000), 0) ?? 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <EditorToolbar activeMode={activeMode} onModeChange={onModeChange} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
        <VideoPreview
          large
          className="min-h-[260px] flex-1 rounded-xl"
          title={activeFrame?.title ?? activeStoryboard?.title}
          narration={activeFrame?.narration ?? activeStoryboard?.summary}
          prompt={activeFrame?.prompt}
          currentTime={formatDuration(activeFrame?.startMs ?? 0)}
          totalTime={formatDuration(totalDurationMs)}
        />
        <div className="shrink-0">
          <StoryboardTimeline projectId={projectId} mode={activeMode} onActiveFrameChange={handleActiveFrameChange} />
        </div>
      </div>
    </main>
  );
}
