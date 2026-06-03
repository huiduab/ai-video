"use client";

import { useCallback, useState } from "react";
import { VideoPreview } from "@/components/common/VideoPreview";
import { EditorToolbar } from "@/components/workspace/EditorToolbar";
import { StoryboardTimeline } from "@/components/workspace/StoryboardTimeline";
import { formatDuration } from "@/lib/project-mappers";
import { getScriptDurationMs } from "@/lib/storyboard-playback";
import type { ProjectMode } from "@/types/project";
import type { GeneratedStoryboardOption, StoryboardFrame } from "@/types/storyboard";

interface EditorCanvasProps {
  projectId: string;
  activeMode: ProjectMode;
  storyboardRefreshKey: number;
  onProjectsChange?: () => void;
  onDurationChange?: (durationMs: number) => void;
}

export function EditorCanvas({ projectId, activeMode, storyboardRefreshKey, onProjectsChange, onDurationChange }: EditorCanvasProps) {
  const [activeFrame, setActiveFrame] = useState<StoryboardFrame | null>(null);
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [activeStoryboard, setActiveStoryboard] = useState<GeneratedStoryboardOption | null>(null);
  const [subtitlesVisible, setSubtitlesVisible] = useState(true);
  const handleActiveFrameChange = useCallback((frame: StoryboardFrame | null, storyboard: GeneratedStoryboardOption | null, nextFrames: StoryboardFrame[]) => {
    setActiveFrame(frame);
    setFrames(nextFrames);
    setActiveStoryboard(storyboard);
  }, []);
  const totalDurationMs = activeStoryboard ? getScriptDurationMs(activeStoryboard.script) : 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <EditorToolbar
        captionsEnabled={subtitlesVisible}
        onCaptionsEnabledChange={setSubtitlesVisible}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
        <VideoPreview
          large
          className="min-h-[260px] flex-1 rounded-xl"
          title={activeFrame?.title ?? activeStoryboard?.title}
          narration={activeFrame?.narration ?? activeStoryboard?.summary}
          prompt={activeFrame?.prompt}
          imageUrl={activeFrame?.imageUrl}
          imageStatus={activeFrame?.imageStatus}
          currentTime={formatDuration(activeFrame?.startMs ?? 0)}
          totalTime={formatDuration(totalDurationMs)}
          frames={frames}
          subtitlesVisible={subtitlesVisible}
          onSubtitlesVisibleChange={setSubtitlesVisible}
          seekToMs={activeFrame?.startMs ?? 0}
        />
        <div className="shrink-0">
          <StoryboardTimeline
            projectId={projectId}
            mode={activeMode}
            refreshKey={storyboardRefreshKey}
            onActiveFrameChange={handleActiveFrameChange}
            onProjectsChange={onProjectsChange}
            onDurationChange={onDurationChange}
          />
        </div>
      </div>
    </main>
  );
}
