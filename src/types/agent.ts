export type AgentIntentType =
  | "GENERATE_OUTLINE"
  | "REGENERATE_OUTLINE"
  | "ADD_SCENE"
  | "DELETE_SCENE"
  | "REGENERATE_SCENE"
  | "OTHER_REJECTED";

export type AgentDisplay =
  | {
      type: "outline";
      title: string;
      items: string[];
      script?: VideoScriptResult;
    }
  | {
      type: "scene-add";
      title: string;
      sceneIndex?: number;
      description?: string;
    }
  | {
      type: "scene-delete";
      title: string;
      sceneIndex?: number;
    }
  | {
      type: "scene-regenerate";
      title: string;
      sceneIndex?: number;
      description?: string;
    }
  | {
      type: "rejected";
      title: string;
      message: string;
    }
  | {
      type: "error";
      title: string;
      message: string;
    };

export interface AgentIntentResult {
  type: AgentIntentType;
  confidence: number;
  reason: string;
  assistantReply: string;
  payload: {
    outline?: string[];
    insertAfterSceneIndex?: number;
    sceneIndex?: number;
    sceneBrief?: string;
    rejectedReason?: string;
    generatedScript?: VideoScriptResult;
  };
}

export interface AgentMessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  intentType: AgentIntentType | null;
  intentJson: AgentIntentResult | null;
  display: AgentDisplay | null;
  createdAt: string;
}

export interface VideoScriptScene {
  index: number;
  title: string;
  narration: string;
  visualPrompt: string;
  animationPrompt?: string;
  htmlAnimation?: HtmlAnimationBlueprint;
  playbackEffect?: PlaybackEffect;
  durationMs?: number;
  generation?: SceneGenerationState;
}

export interface VideoScriptResult {
  title: string;
  summary: string;
  mode: "slideshow" | "html-animation";
  styleConsistency?: VideoStyleConsistency;
  transcript: string;
  scenes: VideoScriptScene[];
}

export interface VideoStyleConsistency {
  visualStyle: string;
  colorPalette: string;
  lighting: string;
  cameraLanguage: string;
  renderingRules: string;
  characterDesign?: string;
}

export type HtmlAnimationTemplateId =
  | "auto"
  | "kinetic-title"
  | "data-flow-network"
  | "layered-stack"
  | "comparison-split"
  | "timeline-process"
  | "matrix-grid"
  | "three-d-card"
  | "ppt-cover-impact";

export interface HtmlAnimationBlueprint {
  templateId: HtmlAnimationTemplateId;
  visualMetaphor: string;
  directorPrompt?: string;
  layerPrompt?: {
    background: string;
    midground: string;
    foreground: string;
  };
  animationTimeline?: {
    start: string;
    middle: string;
    end: string;
  };
  cameraPrompt?: string;
  motionTechniques?: string[];
  htmlPrompt?: string;
  negativePrompt?: string[];
  revisionHints?: string[];
  motionBeats: Array<{
    timeMs: number;
    action: string;
  }>;
  focusPath: string;
  emphasisMoments: string[];
  transitionIntent: string;
}

export interface PlaybackEffect {
  imageMotion: {
    type:
      | "none"
      | "slow-zoom-in"
      | "slow-zoom-out"
      | "pan-left"
      | "pan-right"
      | "pan-up"
      | "pan-down"
      | "ken-burns-in-left"
      | "ken-burns-in-right"
      | "ken-burns-out-left"
      | "ken-burns-out-right";
    durationMs?: number;
    scaleFrom?: number;
    scaleTo?: number;
    translateFrom?: { x: number; y: number };
    translateTo?: { x: number; y: number };
  };
  transition: {
    type: "cut" | "fade" | "crossfade" | "dip-to-black" | "dip-to-white" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom-blur";
    durationMs?: number;
  };
  treatment?: {
    type: "none" | "soft-vignette" | "cinematic-contrast" | "warm-film" | "cool-documentary" | "dreamy-glow" | "subtle-grain";
    intensity?: number;
  };
}

export type SceneAssetStatus = "idle" | "queued" | "generating" | "succeeded" | "failed" | "cancelled";

export interface GeneratedSceneAsset {
  status: SceneAssetStatus;
  assetId?: string;
  url?: string;
  prompt?: string;
  error?: string;
  generatedAt?: string;
  durationMs?: number;
}

export interface SceneGenerationState {
  image?: GeneratedSceneAsset;
  html?: GeneratedSceneAsset & {
    code?: string;
  };
  audio?: GeneratedSceneAsset;
}
