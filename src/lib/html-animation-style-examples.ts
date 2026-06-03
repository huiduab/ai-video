import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AnimationStyle } from "@/lib/html-animation-styles";

export async function readHtmlAnimationStyleExample(style: AnimationStyle) {
  const publicDir = path.join(process.cwd(), "public", "html-animation-styles");
  const filePath = path.join(publicDir, style.exampleFile);
  const resolvedPublicDir = path.resolve(publicDir);
  const resolvedFilePath = path.resolve(filePath);

  if (!resolvedFilePath.startsWith(resolvedPublicDir + path.sep)) {
    throw new Error("Invalid HTML animation style example path");
  }

  return readFile(resolvedFilePath, "utf8");
}
