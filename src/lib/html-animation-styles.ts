import stylesConfig from "@/config/html-animation-styles/styles.json";

export interface AnimationStyle {
  id: string;
  name: string;
  description: string;
  prompt: string;
  imageUrl?: string;
  exampleFile: string;
  exampleUrl: string;
}

interface AnimationStyleConfig {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  prompt?: unknown;
  imageUrl?: unknown;
  exampleFile?: unknown;
}

export const DEFAULT_HTML_ANIMATION_STYLE_ID = "tech-flow";

const parsedAnimationStyles = (stylesConfig as AnimationStyleConfig[])
  .map((style): AnimationStyle | null => {
    if (
      typeof style.id !== "string" ||
      typeof style.name !== "string" ||
      typeof style.description !== "string" ||
      typeof style.prompt !== "string" ||
      typeof style.exampleFile !== "string"
    ) {
      return null;
    }

    return {
      id: style.id,
      name: style.name,
      description: style.description,
      prompt: style.prompt,
      ...(typeof style.imageUrl === "string" ? { imageUrl: style.imageUrl } : {}),
      exampleFile: style.exampleFile,
      exampleUrl: `/html-animation-styles/${style.exampleFile}`,
    };
  })
  .filter((style): style is AnimationStyle => Boolean(style));

export const ANIMATION_STYLES: AnimationStyle[] = parsedAnimationStyles;

export function getHtmlAnimationStyle(styleId: unknown) {
  if (typeof styleId === "string") {
    return ANIMATION_STYLES.find((style) => style.id === styleId) ?? getDefaultHtmlAnimationStyle();
  }

  return getDefaultHtmlAnimationStyle();
}

export function getDefaultHtmlAnimationStyle() {
  return ANIMATION_STYLES.find((style) => style.id === DEFAULT_HTML_ANIMATION_STYLE_ID) ?? ANIMATION_STYLES[0];
}

export function getHtmlAnimationStyleFromMetadata(metadata: unknown) {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as { htmlAnimationStyleId?: unknown }).htmlAnimationStyleId : undefined;
  return getHtmlAnimationStyle(value);
}
