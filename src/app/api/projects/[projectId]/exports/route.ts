import { spawn } from "node:child_process";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AgentMessageRole, AssetType, Prisma, TaskStatus, TaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { validateAgentIntent } from "@/lib/agent/intent-validator";
import { prisma } from "@/lib/db";
import { fallbackSceneDurationMs, getSceneDurationMs } from "@/lib/storyboard-playback";
import type { VideoScriptResult, VideoScriptScene } from "@/types/agent";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

interface ExportSceneTiming {
  sceneIndex: number;
  sceneDurationMs: number;
  holdAfterMs: number;
  totalDurationMs: number;
  audioDurationMs: number | null;
  audioDurationSource: "ffprobe" | "metadata" | "fallback" | "none";
}

const sceneBreathGapMs = 1000;
const subtitleMaxLength = 16;
const exportRightBottomWatermarkCropRatio = 0.1;

function getActiveMessageId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = (metadata as { activeGeneratedStoryboardMessageId?: unknown }).activeGeneratedStoryboardMessageId;
  return typeof value === "string" ? value : "";
}

function publicUrlToFilePath(url: string | undefined) {
  if (!url || !url.startsWith("/generated/")) {
    return "";
  }

  const relativePath = url.replace(/^\/+/, "").split(/[?#]/)[0];
  return path.join(process.cwd(), "public", relativePath);
}

async function generatedFileExists(url: string | undefined, minSizeBytes = 1) {
  const filePath = publicUrlToFilePath(url);

  if (!filePath) {
    return false;
  }

  try {
    await access(filePath);
    const fileStat = await stat(filePath);
    return fileStat.size >= minSizeBytes;
  } catch {
    return false;
  }
}

function seconds(valueMs: number) {
  return Math.max(0.05, valueMs / 1000).toFixed(3);
}

function escapeConcatPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function escapeFilterPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`${command} 启动失败：${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || `${command} 退出码 ${code}`));
    });
  });
}

async function runFfmpeg(args: string[]) {
  await runProcess("ffmpeg", args);
}

async function probeAudioDurationMs(filePath: string) {
  try {
    const { stdout } = await runProcess("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const durationSeconds = Number(stdout.trim());

    return Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : null;
  } catch {
    return null;
  }
}

function getMetadataAudioDurationMs(scene: VideoScriptScene) {
  const value = scene.generation?.audio?.durationMs;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

async function getSceneTiming(scene: VideoScriptScene, holdAfterMs: number): Promise<ExportSceneTiming> {
  const audioPath = publicUrlToFilePath(scene.generation?.audio?.url);
  const hasAudio = audioPath && (await generatedFileExists(scene.generation?.audio?.url, 128));

  if (hasAudio) {
    const probedDurationMs = await probeAudioDurationMs(audioPath);

    if (probedDurationMs) {
      return {
        sceneIndex: scene.index,
        sceneDurationMs: probedDurationMs,
        holdAfterMs,
        totalDurationMs: probedDurationMs + holdAfterMs,
        audioDurationMs: probedDurationMs,
        audioDurationSource: "ffprobe",
      };
    }

    const metadataDurationMs = getMetadataAudioDurationMs(scene);

    if (metadataDurationMs) {
      return {
        sceneIndex: scene.index,
        sceneDurationMs: metadataDurationMs,
        holdAfterMs,
        totalDurationMs: metadataDurationMs + holdAfterMs,
        audioDurationMs: metadataDurationMs,
        audioDurationSource: "metadata",
      };
    }

    return {
      sceneIndex: scene.index,
      sceneDurationMs: fallbackSceneDurationMs,
      holdAfterMs,
      totalDurationMs: fallbackSceneDurationMs + holdAfterMs,
      audioDurationMs: null,
      audioDurationSource: "fallback",
    };
  }

  const sceneDurationMs = getSceneDurationMs(scene);
  return {
    sceneIndex: scene.index,
    sceneDurationMs,
    holdAfterMs,
    totalDurationMs: sceneDurationMs + holdAfterMs,
    audioDurationMs: null,
    audioDurationSource: "none",
  };
}

function assTime(valueMs: number) {
  const centiseconds = Math.max(0, Math.round(valueMs / 10));
  const cs = centiseconds % 100;
  const totalSeconds = Math.floor(centiseconds / 100);
  const secondsValue = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secondsValue).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function cleanSubtitleText(text: string) {
  return text.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function splitSubtitleText(text: string) {
  const cleaned = cleanSubtitleText(text);

  if (!cleaned) {
    return [];
  }

  const roughParts = cleaned.split(/[。！？!?；;\n\r]+/u).flatMap((part) => part.split(/[，,、：:]+/u)).map((part) => part.trim()).filter(Boolean);
  const lines: string[] = [];

  for (const part of roughParts.length > 0 ? roughParts : [cleaned]) {
    let cursor = "";

    for (const char of Array.from(part)) {
      if (cursor.length >= subtitleMaxLength) {
        lines.push(cursor);
        cursor = "";
      }

      cursor += char;
    }

    if (cursor) {
      lines.push(cursor);
    }
  }

  return lines;
}

async function writeSceneAssFile(scene: VideoScriptScene, sceneDurationMs: number, outputPath: string) {
  const lines = splitSubtitleText(scene.narration);
  const totalWeight = lines.reduce((sum, line) => sum + Math.max(line.length, 1), 0) || lines.length || 1;
  let cursorMs = 0;
  const events = lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const lineDurationMs = isLast ? sceneDurationMs - cursorMs : Math.max(400, Math.round((Math.max(line.length, 1) / totalWeight) * sceneDurationMs));
    const startMs = cursorMs;
    const endMs = isLast ? sceneDurationMs : Math.min(sceneDurationMs, cursorMs + lineDurationMs);
    cursorMs = endMs;
    return `Dialogue: 0,${assTime(startMs)},${assTime(endMs)},Default,,0,0,0,,${line}`;
  });
  const content = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Microsoft YaHei,58,&H00FFFFFF,&H000000FF,&HCC000000,&H99000000,1,0,0,0,100,100,0,0,1,4,1,2,120,120,90,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");

  await writeFile(outputPath, content, "utf8");
}

async function renderSceneSegment({
  scene,
  index,
  timing,
  outputPath,
  width,
  height,
  fps,
  includeSubtitles,
  scratchRoot,
}: {
  scene: VideoScriptScene;
  index: number;
  timing: ExportSceneTiming;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  includeSubtitles: boolean;
  scratchRoot: string;
}) {
  const imagePath = publicUrlToFilePath(scene.generation?.image?.url);
  const audioPath = publicUrlToFilePath(scene.generation?.audio?.url);
  const hasAudio = audioPath && (await generatedFileExists(scene.generation?.audio?.url, 128));
  const args = ["-y", "-loop", "1", "-t", seconds(timing.totalDurationMs), "-i", imagePath];

  if (hasAudio) {
    args.push("-i", audioPath);
  }

  args.push("-f", "lavfi", "-t", seconds(timing.totalDurationMs), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");

  const silentInputIndex = hasAudio ? 2 : 1;
  const filterComplex = hasAudio
    ? `[${silentInputIndex}:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]`
    : `[${silentInputIndex}:a]anull[a]`;
  const watermarkCropPercent = (exportRightBottomWatermarkCropRatio * 100).toFixed(2);
  let videoFilter = `crop=iw*(1-${watermarkCropPercent}/100):ih*(1-${watermarkCropPercent}/100):0:0,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;

  if (includeSubtitles && scene.narration.trim()) {
    const assPath = path.join(scratchRoot, `subtitle-${String(index).padStart(3, "0")}.ass`);
    await writeSceneAssFile(scene, timing.sceneDurationMs, assPath);
    videoFilter += `,ass='${escapeFilterPath(assPath)}'`;
  }

  videoFilter += ",format=yuv420p";

  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-vf",
    videoFilter,
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  );

  await runFfmpeg(args);

  return {
    segmentIndex: index,
    imagePath,
    audioPath: hasAudio ? audioPath : null,
    ...timing,
  };
}

async function renderSlideshowMp4({
  projectId,
  script,
  width,
  height,
  fps,
  taskId,
  includeSubtitles,
}: {
  projectId: string;
  script: VideoScriptResult;
  width: number;
  height: number;
  fps: number;
  taskId: string;
  includeSubtitles: boolean;
}) {
  const exportRoot = path.join(process.cwd(), "public", "generated", "storyboards", projectId, "exports");
  const scratchRoot = path.join(exportRoot, ".tmp", taskId);
  await mkdir(scratchRoot, { recursive: true });

  const timings = await Promise.all(
    script.scenes.map((scene, index) => getSceneTiming(scene, index < script.scenes.length - 1 ? sceneBreathGapMs : 0)),
  );
  const segmentOutputs: string[] = [];
  const segmentMetadata = [];

  for (const [index, scene] of script.scenes.entries()) {
    const segmentPath = path.join(scratchRoot, `segment-${String(index + 1).padStart(3, "0")}.mp4`);
    const metadata = await renderSceneSegment({
      scene,
      index: index + 1,
      timing: timings[index],
      outputPath: segmentPath,
      width,
      height,
      fps,
      includeSubtitles,
      scratchRoot,
    });

    segmentOutputs.push(segmentPath);
    segmentMetadata.push(metadata);

    await prisma.generationTask.update({
      where: { id: taskId },
      data: { progress: Math.round(((index + 1) / script.scenes.length) * 85) },
    });
  }

  const listPath = path.join(scratchRoot, "concat.txt");
  await writeFile(listPath, segmentOutputs.map((filePath) => `file '${escapeConcatPath(filePath)}'`).join("\n"), "utf8");

  const outputFileName = `export-${Date.now()}.mp4`;
  const outputPath = path.join(exportRoot, outputFileName);
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outputPath]);

  const outputStat = await stat(outputPath);
  const outputUrl = `/generated/storyboards/${projectId}/exports/${outputFileName}`;

  return {
    outputPath,
    outputUrl,
    outputFileName,
    sizeBytes: outputStat.size,
    durationMs: timings.reduce((sum, timing) => sum + timing.totalDurationMs, 0),
    segmentMetadata,
  };
}

async function loadActiveScript(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { settings: true },
  });

  if (!project) {
    return { error: "Project not found" as const, status: 404 as const };
  }

  const activeMessageId = getActiveMessageId(project.metadata);

  if (!activeMessageId) {
    return { error: "当前项目还没有可导出的 Agent 分镜版本" as const, status: 400 as const };
  }

  const message = await prisma.agentMessage.findFirst({
    where: {
      id: activeMessageId,
      projectId,
      role: AgentMessageRole.ASSISTANT,
      intentJson: { not: Prisma.JsonNull },
    },
  });

  if (!message) {
    return { error: "当前分镜版本不存在" as const, status: 404 as const };
  }

  const intent = validateAgentIntent(message.intentJson);
  const script = intent.payload.generatedScript;

  if (!script) {
    return { error: "当前分镜版本不包含可导出的脚本" as const, status: 400 as const };
  }

  return { project, message, script };
}

function validateSlideshowAssets(script: VideoScriptResult) {
  const missingImages = script.scenes.filter((scene) => !(scene.generation?.image?.status === "succeeded" && scene.generation.image.url));

  if (missingImages.length > 0) {
    return `还有 ${missingImages.length} 个分镜画面未生成，需要先完成 AI 生成`;
  }

  return "";
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  let taskId = "";

  try {
    const body = (await request.json().catch(() => ({}))) as { includeSubtitles?: unknown };
    const includeSubtitles = body.includeSubtitles !== false;
    const loaded = await loadActiveScript(projectId);

    if ("error" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    const { project, message, script } = loaded;

    if (script.mode === "html-animation") {
      return NextResponse.json(
        {
          error: "HTML 动画 MP4 导出需要 Playwright 截帧管线，当前版本先支持图片轮播项目导出。",
          help: "你可以先创建图片轮播项目导出 MP4；HTML 动画项目后续需要逐帧捕获 iframe 动画后再合成视频。",
        },
        { status: 400 },
      );
    }

    const assetError = validateSlideshowAssets(script);

    if (assetError) {
      return NextResponse.json({ error: assetError, help: "请先点击时间线里的 AI 生成，等所有分镜画面生成完成后再导出。" }, { status: 400 });
    }

    const missingLocalImages = [];

    for (const scene of script.scenes) {
      if (!(await generatedFileExists(scene.generation?.image?.url))) {
        missingLocalImages.push(scene.index);
      }
    }

    if (missingLocalImages.length > 0) {
      return NextResponse.json(
        { error: `第 ${missingLocalImages.join("、")} 个分镜图片文件不存在，请重新生成画面`, help: "本地生成文件缺失时，重新点击 AI 生成会补齐缺失素材。" },
        { status: 400 },
      );
    }

    const width = project.settings?.width ?? 1920;
    const height = project.settings?.height ?? 1080;
    const fps = project.settings?.fps ?? 30;
    const task = await prisma.generationTask.create({
      data: {
        projectId,
        type: TaskType.EXPORT_VIDEO,
        status: TaskStatus.RUNNING,
        progress: 1,
        startedAt: new Date(),
        input: {
          messageId: message.id,
          title: script.title,
          mode: script.mode,
          width,
          height,
          fps,
          sceneCount: script.scenes.length,
          includeSubtitles,
        },
      },
    });
    taskId = task.id;

    const rendered = await renderSlideshowMp4({
      projectId,
      script,
      width,
      height,
      fps,
      taskId,
      includeSubtitles,
    });

    const asset = await prisma.asset.create({
      data: {
        projectId,
        type: AssetType.VIDEO,
        url: rendered.outputUrl,
        storageKey: path.relative(process.cwd(), rendered.outputPath).replace(/\\/g, "/"),
        mimeType: "video/mp4",
        width,
        height,
        durationMs: rendered.durationMs,
        sizeBytes: BigInt(rendered.sizeBytes),
        metadata: {
          provider: "ffmpeg",
          messageId: message.id,
          mode: script.mode,
          fps,
          includeSubtitles,
          segments: rendered.segmentMetadata,
        },
      },
    });

    await prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.SUCCEEDED,
        progress: 100,
        finishedAt: new Date(),
        output: {
          assetId: asset.id,
          url: rendered.outputUrl,
          fileName: rendered.outputFileName,
          sizeBytes: rendered.sizeBytes,
          durationMs: rendered.durationMs,
        },
      },
    });

    return NextResponse.json({
      taskId,
      asset: {
        id: asset.id,
        url: asset.url,
        mimeType: asset.mimeType,
        sizeBytes: rendered.sizeBytes,
        durationMs: rendered.durationMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MP4 导出失败";
    console.error("Failed to export MP4", error);

    if (taskId) {
      await prisma.generationTask.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          errorMessage: message,
          finishedAt: new Date(),
        },
      }).catch(() => undefined);
    }

    const help = message.includes("ffmpeg") || message.includes("ffprobe")
      ? "请先安装 FFmpeg，并确认在 PowerShell 中执行 ffmpeg -version 和 ffprobe -version 都能看到版本信息。安装后需要重启 npm run dev。"
      : undefined;

    return NextResponse.json({ error: message, help }, { status: 500 });
  }
}
