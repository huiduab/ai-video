export interface StoryboardFrame {
  id: string;
  index: number;
  title: string;
  startMs: number;
  durationMs: number;
  thumbnailUrl: string | null;
  prompt: string;
  narration: string;
  visualConfig: unknown;
  animationConfig: unknown;
}

export interface GeneratedStoryboardOption {
  messageId: string;
  title: string;
  summary: string;
  createdAt: string;
  script: import("@/types/agent").VideoScriptResult;
}
