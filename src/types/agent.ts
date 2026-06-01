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
  durationMs?: number;
}

export interface VideoScriptResult {
  title: string;
  summary: string;
  mode: "slideshow" | "html-animation";
  transcript: string;
  scenes: VideoScriptScene[];
}
