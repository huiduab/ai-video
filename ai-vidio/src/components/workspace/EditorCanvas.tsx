"use client";

import { VideoPreview } from "@/components/common/VideoPreview";
import { EditorToolbar } from "@/components/workspace/EditorToolbar";
import { HtmlAnimationPanel } from "@/components/workspace/HtmlAnimationPanel";
import { StoryboardTimeline } from "@/components/workspace/StoryboardTimeline";
import type { ProjectMode } from "@/types/project";

interface EditorCanvasProps {
  activeMode: ProjectMode;
  onModeChange: (mode: ProjectMode) => void;
}

export function EditorCanvas({ activeMode, onModeChange }: EditorCanvasProps) {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <EditorToolbar />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
        <VideoPreview large className="min-h-[260px] flex-1 rounded-xl" />
        <div className="shrink-0">
          {activeMode === "slideshow" ? <StoryboardTimeline /> : <HtmlAnimationPanel />}
        </div>
      </div>
    </main>
  );
}
