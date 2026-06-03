import type { PlaybackEffect, VideoScriptResult, VideoScriptScene } from "@/types/agent";

export const fallbackSceneDurationMs = 3000;

const imageMotionTypes = new Set<PlaybackEffect["imageMotion"]["type"]>([
  "none",
  "slow-zoom-in",
  "slow-zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "ken-burns-in-left",
  "ken-burns-in-right",
  "ken-burns-out-left",
  "ken-burns-out-right",
]);

const transitionTypes = new Set<PlaybackEffect["transition"]["type"]>([
  "cut",
  "fade",
  "crossfade",
  "dip-to-black",
  "dip-to-white",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-blur",
]);

const treatmentTypes = new Set<NonNullable<PlaybackEffect["treatment"]>["type"]>([
  "none",
  "soft-vignette",
  "cinematic-contrast",
  "warm-film",
  "cool-documentary",
  "dreamy-glow",
  "subtle-grain",
]);

export function getSceneDurationMs(scene: Pick<VideoScriptScene, "generation">) {
  return scene.generation?.audio?.durationMs ?? fallbackSceneDurationMs;
}

export function getScriptDurationMs(script: VideoScriptResult) {
  return script.scenes.reduce((sum, scene) => sum + getSceneDurationMs(scene), 0);
}

export function getScriptCoverImage(script: VideoScriptResult) {
  return script.scenes.find((scene) => scene.generation?.image?.url)?.generation?.image ?? null;
}

export function getDefaultPlaybackEffect(): PlaybackEffect {
  return {
    imageMotion: {
      type: "slow-zoom-in",
      durationMs: fallbackSceneDurationMs,
      scaleFrom: 1,
      scaleTo: 1.08,
      translateFrom: { x: 0, y: 0 },
      translateTo: { x: 0, y: 0 },
    },
    transition: {
      type: "crossfade",
      durationMs: 600,
    },
    treatment: {
      type: "none",
      intensity: 0,
    },
  };
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function point(value: unknown, fallback: { x: number; y: number }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as { x?: unknown; y?: unknown };
  return {
    x: numberInRange(candidate.x, fallback.x, -12, 12),
    y: numberInRange(candidate.y, fallback.y, -12, 12),
  };
}

export function normalizePlaybackEffect(value: unknown): PlaybackEffect {
  const fallback = getDefaultPlaybackEffect();

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const effect = value as Partial<PlaybackEffect>;
  const imageMotion =
    effect.imageMotion && typeof effect.imageMotion === "object" ? effect.imageMotion : ({} as Partial<PlaybackEffect["imageMotion"]>);
  const transition = effect.transition && typeof effect.transition === "object" ? effect.transition : ({} as Partial<PlaybackEffect["transition"]>);
  const treatment = effect.treatment && typeof effect.treatment === "object" ? effect.treatment : ({} as Partial<NonNullable<PlaybackEffect["treatment"]>>);
  const imageMotionType = imageMotionTypes.has(imageMotion.type as PlaybackEffect["imageMotion"]["type"])
    ? (imageMotion.type as PlaybackEffect["imageMotion"]["type"])
    : fallback.imageMotion.type;
  const transitionType = transitionTypes.has(transition.type as PlaybackEffect["transition"]["type"])
    ? (transition.type as PlaybackEffect["transition"]["type"])
    : fallback.transition.type;
  const treatmentType = treatmentTypes.has(treatment.type as NonNullable<PlaybackEffect["treatment"]>["type"])
    ? (treatment.type as NonNullable<PlaybackEffect["treatment"]>["type"])
    : fallback.treatment?.type ?? "none";

  return {
    imageMotion: {
      type: imageMotionType,
      durationMs: numberInRange(imageMotion.durationMs, fallback.imageMotion.durationMs ?? fallbackSceneDurationMs, 500, 60000),
      scaleFrom: numberInRange(imageMotion.scaleFrom, fallback.imageMotion.scaleFrom ?? 1, 0.8, 1.5),
      scaleTo: numberInRange(imageMotion.scaleTo, fallback.imageMotion.scaleTo ?? 1.08, 0.8, 1.5),
      translateFrom: point(imageMotion.translateFrom, fallback.imageMotion.translateFrom ?? { x: 0, y: 0 }),
      translateTo: point(imageMotion.translateTo, fallback.imageMotion.translateTo ?? { x: 0, y: 0 }),
    },
    transition: {
      type: transitionType,
      durationMs: numberInRange(transition.durationMs, fallback.transition.durationMs ?? 600, 0, 2000),
    },
    treatment: {
      type: treatmentType,
      intensity: numberInRange(treatment.intensity, treatmentType === "none" ? 0 : 0.35, 0, 1),
    },
  };
}
