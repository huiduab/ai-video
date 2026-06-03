import type { GeneratedSceneAsset, SceneGenerationState, VideoScriptResult, VideoScriptScene, VideoStyleConsistency } from "@/types/agent";
import { normalizePlaybackEffect } from "@/lib/storyboard-playback";

const validAssetStatuses = new Set(["idle", "queued", "generating", "succeeded", "failed", "cancelled"]);

function validateGeneratedAsset(value: unknown): GeneratedSceneAsset | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const asset = value as Partial<GeneratedSceneAsset>;
  const status = typeof asset.status === "string" && validAssetStatuses.has(asset.status) ? asset.status : "idle";

  return {
    status: status as GeneratedSceneAsset["status"],
    assetId: typeof asset.assetId === "string" ? asset.assetId : undefined,
    url: typeof asset.url === "string" ? asset.url : undefined,
    prompt: typeof asset.prompt === "string" ? asset.prompt : undefined,
    error: typeof asset.error === "string" ? asset.error : undefined,
    generatedAt: typeof asset.generatedAt === "string" ? asset.generatedAt : undefined,
    durationMs: typeof asset.durationMs === "number" && asset.durationMs > 0 ? Math.round(asset.durationMs) : undefined,
  };
}

function validateGenerationState(value: unknown): SceneGenerationState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const generation = value as Partial<SceneGenerationState>;
  const image = validateGeneratedAsset(generation.image);
  const audio = validateGeneratedAsset(generation.audio);

  if (!image && !audio) {
    return undefined;
  }

  return { image, audio };
}

function validateScene(value: unknown, fallbackIndex: number): VideoScriptScene {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Script scene must be an object");
  }

  const scene = value as Partial<VideoScriptScene>;

  if (typeof scene.title !== "string" || !scene.title.trim()) {
    throw new Error("Script scene title is required");
  }

  if (typeof scene.narration !== "string" || !scene.narration.trim()) {
    throw new Error("Script scene narration is required");
  }

  if (typeof scene.visualPrompt !== "string" || !scene.visualPrompt.trim()) {
    throw new Error("Script scene visualPrompt is required");
  }

  return {
    index: typeof scene.index === "number" && scene.index > 0 ? scene.index : fallbackIndex,
    title: scene.title.trim(),
    narration: scene.narration.trim(),
    visualPrompt: scene.visualPrompt.trim(),
    animationPrompt: typeof scene.animationPrompt === "string" ? scene.animationPrompt.trim() : undefined,
    playbackEffect: normalizePlaybackEffect(scene.playbackEffect),
    durationMs: typeof scene.durationMs === "number" && scene.durationMs > 0 ? Math.round(scene.durationMs) : undefined,
    generation: validateGenerationState(scene.generation),
  };
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validateStyleConsistency(value: unknown): VideoStyleConsistency | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const style = value as Partial<VideoStyleConsistency>;
  const visualStyle = optionalText(style.visualStyle);
  const colorPalette = optionalText(style.colorPalette);
  const lighting = optionalText(style.lighting);
  const cameraLanguage = optionalText(style.cameraLanguage);
  const renderingRules = optionalText(style.renderingRules);

  if (!visualStyle || !colorPalette || !lighting || !cameraLanguage || !renderingRules) {
    return undefined;
  }

  return {
    visualStyle,
    colorPalette,
    lighting,
    cameraLanguage,
    renderingRules,
    characterDesign: optionalText(style.characterDesign),
  };
}

export function validateVideoScript(value: unknown): VideoScriptResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Video script must be an object");
  }

  const script = value as Partial<VideoScriptResult>;

  if (typeof script.title !== "string" || !script.title.trim()) {
    throw new Error("Video script title is required");
  }

  if (typeof script.summary !== "string" || !script.summary.trim()) {
    throw new Error("Video script summary is required");
  }

  if (script.mode !== "slideshow" && script.mode !== "html-animation") {
    throw new Error("Invalid video script mode");
  }

  if (typeof script.transcript !== "string" || !script.transcript.trim()) {
    throw new Error("Video script transcript is required");
  }

  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error("Video script scenes are required");
  }

  if (script.scenes.length > 80) {
    throw new Error("Video script has too many scenes");
  }

  return {
    title: script.title.trim(),
    summary: script.summary.trim(),
    mode: script.mode,
    styleConsistency: validateStyleConsistency(script.styleConsistency),
    transcript: script.transcript.trim(),
    scenes: script.scenes.map((scene, index) => validateScene(scene, index + 1)),
  };
}
