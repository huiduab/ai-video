export interface StoryboardFrame {
  id: string;
  index: number;
  title: string;
  startMs: number;
  durationMs: number;
  holdAfterMs?: number;
  thumbnailUrl: string | null;
  imageUrl?: string;
  htmlUrl?: string;
  audioUrl?: string;
  imageStatus?: import("@/types/agent").SceneAssetStatus;
  htmlStatus?: import("@/types/agent").SceneAssetStatus;
  audioStatus?: import("@/types/agent").SceneAssetStatus;
  prompt: string;
  narration: string;
  playbackEffect?: import("@/types/agent").PlaybackEffect;
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
