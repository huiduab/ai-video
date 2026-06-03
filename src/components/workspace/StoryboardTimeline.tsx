"use client";

import { Code2, RefreshCw, Square, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/common/Button";
import { TimelinePanel, type TimelineItem } from "@/components/workspace/TimelinePanel";
import { formatDuration, formatRelativeTime } from "@/lib/project-mappers";
import { getSceneDurationMs, normalizePlaybackEffect } from "@/lib/storyboard-playback";
import type { ProjectMode } from "@/types/project";
import type { GeneratedStoryboardOption, StoryboardFrame } from "@/types/storyboard";

const sceneBreathGapMs = 1000;

interface StoryboardTimelineProps {
  projectId: string;
  mode: ProjectMode;
  refreshKey?: number;
  onActiveFrameChange?: (frame: StoryboardFrame | null, storyboard: GeneratedStoryboardOption | null, frames: StoryboardFrame[]) => void;
  onProjectsChange?: () => void;
  onDurationChange?: (durationMs: number) => void;
}

function readAudioMetadataDurationMs(url: string) {
  return new Promise<number | null>((resolve) => {
    const audio = new Audio();
    let settled = false;
    const finish = (durationMs: number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve(durationMs);
    };
    const timeoutId = window.setTimeout(() => finish(null), 4000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

async function readAudioDurationMs(url: string) {
  const metadataDurationMs = await readAudioMetadataDurationMs(url);

  if (metadataDurationMs) {
    return metadataDurationMs;
  }

  try {
    const AudioContextConstructor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const audioContext = new AudioContextConstructor();
    const audioBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    await audioContext.close();
    return Number.isFinite(audioBuffer.duration) && audioBuffer.duration > 0 ? Math.round(audioBuffer.duration * 1000) : null;
  } catch {
    return null;
  }
}

function getFramesTotalDurationMs(frames: StoryboardFrame[]) {
  const lastFrame = frames[frames.length - 1];
  return lastFrame ? lastFrame.startMs + lastFrame.durationMs : 0;
}

function sceneToFrame(
  scene: GeneratedStoryboardOption["script"]["scenes"][number],
  startMs: number,
  audioDurationByUrl: Record<string, number>,
  holdAfterMs: number,
): StoryboardFrame {
  const audioUrl = scene.generation?.audio?.url;
  const durationMs = audioUrl ? audioDurationByUrl[audioUrl] ?? getSceneDurationMs(scene) : getSceneDurationMs(scene);

  return {
    id: `generated-scene-${scene.index}`,
    index: scene.index,
    title: scene.title,
    startMs,
    durationMs,
    holdAfterMs,
    thumbnailUrl: scene.generation?.image?.url ?? null,
    imageUrl: scene.generation?.image?.url,
    audioUrl,
    imageStatus: scene.generation?.image?.status ?? "idle",
    audioStatus: scene.generation?.audio?.status ?? "idle",
    prompt: scene.visualPrompt,
    narration: scene.narration,
    playbackEffect: normalizePlaybackEffect(scene.playbackEffect),
    visualConfig: {
      generated: true,
      visualPrompt: scene.visualPrompt,
      image: scene.generation?.image,
    },
    animationConfig: {
      generated: true,
      animationPrompt: scene.animationPrompt ?? "",
      audio: scene.generation?.audio,
    },
  };
}

function storyboardToFrames(storyboard: GeneratedStoryboardOption | null, audioDurationByUrl: Record<string, number>): StoryboardFrame[] {
  if (!storyboard) {
    return [];
  }

  let startMs = 0;

  return storyboard.script.scenes.map((scene, index) => {
    const holdAfterMs = index < storyboard.script.scenes.length - 1 ? sceneBreathGapMs : 0;
    const frame = sceneToFrame(scene, startMs, audioDurationByUrl, holdAfterMs);
    startMs += frame.durationMs + holdAfterMs;
    return frame;
  });
}

export function StoryboardTimeline({ projectId, mode, refreshKey = 0, onActiveFrameChange, onProjectsChange, onDurationChange }: StoryboardTimelineProps) {
  const [storyboards, setStoryboards] = useState<GeneratedStoryboardOption[]>([]);
  const [activeMessageId, setActiveMessageId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [audioDurationByUrl, setAudioDurationByUrl] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingSceneIndex, setGeneratingSceneIndex] = useState<number | null>(null);
  const [generationStatus, setGenerationStatus] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeStoryboard = useMemo(
    () => storyboards.find((storyboard) => storyboard.messageId === activeMessageId) ?? storyboards[0] ?? null,
    [activeMessageId, storyboards],
  );
  const frames = useMemo(() => storyboardToFrames(activeStoryboard, audioDurationByUrl), [activeStoryboard, audioDurationByUrl]);
  const selectedFrame = frames.find((frame) => frame.id === selectedId) ?? frames[0] ?? null;
  const generatedCount = frames.filter((frame) => frame.imageStatus === "succeeded").length;
  const audioGeneratedCount = frames.filter((frame) => frame.audioStatus === "succeeded" && frame.audioUrl).length;

  const loadGeneratedStoryboards = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/storyboards`, { cache: "no-store" });
      const payload = (await response.json()) as {
        items?: GeneratedStoryboardOption[];
        activeMessageId?: string;
        error?: string;
      };

      if (!response.ok || !payload.items) {
        throw new Error(payload.error ?? "生成分镜加载失败");
      }

      setStoryboards(payload.items);
      setActiveMessageId(payload.activeMessageId ?? payload.items[0]?.messageId ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "生成分镜加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setSelectedId("");
    void loadGeneratedStoryboards();
  }, [loadGeneratedStoryboards, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const audioUrls = Array.from(
      new Set(activeStoryboard?.script.scenes.map((scene) => scene.generation?.audio?.url).filter((url): url is string => Boolean(url)) ?? []),
    ).filter((url) => !audioDurationByUrl[url]);

    if (audioUrls.length === 0) {
      return;
    }

    void Promise.all(
      audioUrls.map(async (url) => {
        const durationMs = await readAudioDurationMs(url);
        return durationMs ? [url, durationMs] as const : null;
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      const validEntries = entries.filter((entry): entry is readonly [string, number] => Boolean(entry));

      if (validEntries.length > 0) {
        setAudioDurationByUrl((current) => ({
          ...current,
          ...Object.fromEntries(validEntries),
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeStoryboard, audioDurationByUrl]);

  useEffect(() => {
    const nextFrame = frames.find((frame) => frame.id === selectedId) ?? frames[0] ?? null;

    if (nextFrame && nextFrame.id !== selectedId) {
      setSelectedId(nextFrame.id);
    }

    onActiveFrameChange?.(nextFrame, activeStoryboard, frames);
  }, [activeStoryboard, frames, onActiveFrameChange, selectedId]);

  useEffect(() => {
    if (frames.length > 0) {
      onDurationChange?.(getFramesTotalDurationMs(frames));
    }
  }, [frames, onDurationChange]);

  async function selectStoryboard(messageId: string) {
    setActiveMessageId(messageId);
    setSelectedId("");

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/storyboards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeMessageId: messageId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "切换分镜失败");
      }
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "切换分镜失败");
    }
  }

  function handleSelectFrame(id: string) {
    setSelectedId(id);
    onActiveFrameChange?.(frames.find((frame) => frame.id === id) ?? null, activeStoryboard, frames);
  }

  function handleOpenFrame(id: string) {
    handleSelectFrame(id);
    setDetailOpen(true);
  }

  function patchSceneInActiveStoryboard(scene: GeneratedStoryboardOption["script"]["scenes"][number]) {
    if (!activeStoryboard) {
      return;
    }

    setStoryboards((current) =>
      current.map((storyboard) =>
        storyboard.messageId === activeStoryboard.messageId
          ? {
              ...storyboard,
              script: {
                ...storyboard.script,
                scenes: storyboard.script.scenes.map((item) => (item.index === scene.index ? scene : item)),
              },
            }
          : storyboard,
      ),
    );
  }

  function handlePlayAudio(url: string) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play().catch((playError) => {
      setError(playError instanceof Error ? playError.message : "旁白音频播放失败");
    });
  }

  async function handleGenerateImages() {
    if (!activeStoryboard || generating) {
      return;
    }

    const pendingScenes = activeStoryboard.script.scenes.filter(
      (scene) => scene.generation?.image?.status !== "succeeded" || scene.generation?.audio?.status !== "succeeded",
    );

    if (pendingScenes.length === 0) {
      setGenerationStatus("所有分镜画面和旁白已生成");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    setGeneratingSceneIndex(null);
    setError("");

    try {
      for (const scene of pendingScenes) {
        if (controller.signal.aborted) {
          break;
        }

        let currentScene = scene;

        if (currentScene.generation?.image?.status !== "succeeded") {
          setGenerationStatus(`正在生成第 ${scene.index} 个分镜画面`);
          setGeneratingSceneIndex(scene.index);
          const response = await fetch(`/api/projects/${projectId}/agent/storyboards/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messageId: activeStoryboard.messageId,
              sceneIndex: scene.index,
              kind: "image",
            }),
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => ({}))) as {
            scene?: GeneratedStoryboardOption["script"]["scenes"][number];
            error?: string;
          };

          if (!response.ok || !payload.scene) {
            throw new Error(payload.error ?? "分镜画面生成失败");
          }

          currentScene = payload.scene;
          patchSceneInActiveStoryboard(payload.scene);
        }

        if (controller.signal.aborted) {
          break;
        }

        if (currentScene.generation?.audio?.status !== "succeeded") {
          setGenerationStatus(`正在生成第 ${scene.index} 个分镜旁白`);
          setGeneratingSceneIndex(scene.index);
          const response = await fetch(`/api/projects/${projectId}/agent/storyboards/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messageId: activeStoryboard.messageId,
              sceneIndex: scene.index,
              kind: "audio",
            }),
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => ({}))) as {
            scene?: GeneratedStoryboardOption["script"]["scenes"][number];
            error?: string;
          };

          if (!response.ok || !payload.scene) {
            throw new Error(payload.error ?? "分镜旁白生成失败");
          }

          patchSceneInActiveStoryboard(payload.scene);
        }
      }

      setGenerationStatus(controller.signal.aborted ? "已中断生成，已完成的画面和旁白会保留" : "分镜画面和旁白生成完成");
      if (!controller.signal.aborted) {
        onProjectsChange?.();
      }
    } catch (generateError) {
      if (generateError instanceof DOMException && generateError.name === "AbortError") {
        setGenerationStatus("已中断生成，已完成的画面和旁白会保留");
      } else {
        setError(generateError instanceof Error ? generateError.message : "分镜画面或旁白生成失败");
      }
    } finally {
      abortControllerRef.current = null;
      setGenerating(false);
      setGeneratingSceneIndex(null);
      void loadGeneratedStoryboards();
    }
  }

  function handleStopGeneration() {
    abortControllerRef.current?.abort();
    setGenerationStatus("正在中断当前生成请求");
  }

  const items: TimelineItem[] = useMemo(
    () =>
      frames.map((frame) => ({
        id: frame.id,
        index: frame.index,
        title: frame.title,
        duration: formatDuration(frame.durationMs),
        thumbnailClass: "media-frame",
        thumbnailUrl: frame.imageUrl,
        audioUrl: frame.audioUrl,
        onPlayAudio: handlePlayAudio,
        statusLabel: frame.index === generatingSceneIndex ? "生成中" : frame.imageStatus === "succeeded" ? "已生成" : generating ? "待生成" : "未生成",
        isGenerating: frame.index === generatingSceneIndex,
        badge:
          mode === "html-animation" ? (
            <>
              <div className="absolute inset-0 bg-slate-950/20" />
              <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[#1554ff]">
                <Code2 size={11} />
                HTML
              </div>
            </>
          ) : undefined,
      })),
    [frames, generating, generatingSceneIndex, mode],
  );

  if (loading) {
    return <div className="flex h-[205px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600">正在加载 Agent 生成分镜...</div>;
  }

  if (error) {
    return (
      <div className="flex h-[205px] items-center justify-center rounded-xl border border-slate-200 bg-white text-center text-sm text-slate-600">
        <div>
          <p>{error}</p>
          <button className="mt-3 rounded-full bg-[#1554ff] px-4 py-1.5 text-white" onClick={loadGeneratedStoryboards}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!activeStoryboard) {
    return (
      <div className="flex h-[205px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-600">
        <div>
          <p className="font-medium text-slate-900">暂无 Agent 生成分镜</p>
          <p className="mt-2">在右侧 AI 助手中输入“生成视频大纲”，生成后这里会显示真实分镜。</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <TimelinePanel
        title={mode === "html-animation" ? "当前 HTML 动画分镜" : "当前图片轮播分镜"}
        description={`来自 Agent：${activeStoryboard.title}`}
        addLabel="刷新"
        items={items}
        selectedId={selectedId}
        totalDuration={formatDuration(getFramesTotalDurationMs(frames))}
        onAdd={loadGeneratedStoryboards}
        onSelect={handleSelectFrame}
        onOpenItem={handleOpenFrame}
        showAddActions={false}
        hideHeading
        actionSlot={
          <div className="flex items-center gap-2">
            <div className="hidden text-xs text-slate-500 md:block">
              画面 {generatedCount}/{frames.length} · 旁白 {audioGeneratedCount}/{frames.length}
              {generationStatus ? <span className="ml-2 text-slate-700">{generationStatus}</span> : null}
            </div>
            <Button
              variant={generating ? "secondary" : "primary"}
              size="md"
              onClick={generating ? handleStopGeneration : () => void handleGenerateImages()}
              disabled={!generating && frames.length === 0}
            >
              {generating ? <Square size={13} /> : <WandSparkles size={14} />}
              {generating ? "中断生成" : "AI 生成"}
            </Button>
            {storyboards.length > 1 && (
              <select
                aria-label="选择 Agent 生成分镜"
                value={activeStoryboard.messageId}
                onChange={(event) => void selectStoryboard(event.target.value)}
                className="h-9 max-w-56 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-[#1554ff]"
              >
                {storyboards.map((storyboard) => (
                  <option key={storyboard.messageId} value={storyboard.messageId}>
                    {storyboard.title} · {formatRelativeTime(storyboard.createdAt)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={loadGeneratedStoryboards}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:border-[#1554ff] hover:text-[#1554ff]"
            >
              <RefreshCw size={14} />
              刷新
            </button>
          </div>
        }
      />
      {detailOpen && selectedFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="relative grid max-h-[84vh] w-full max-w-5xl grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-xl bg-white shadow-2xl">
            <button
              type="button"
              aria-label="关闭分镜详情"
              onClick={() => setDetailOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-lg bg-white/90 p-1.5 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-950"
            >
              <X size={18} />
            </button>
            <div className="border-r border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center">
                <h2 className="text-sm font-semibold text-slate-950">全部分镜</h2>
              </div>
              <div className="mt-3 space-y-2 overflow-y-auto pr-1">
                {frames.map((frame) => (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => handleSelectFrame(frame.id)}
                    className={`w-full rounded-lg border p-2 text-left text-xs transition ${
                      frame.id === selectedFrame.id ? "border-[#1554ff] bg-white shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-white"
                    }`}
                  >
                    <div className="truncate font-medium text-slate-950">
                      {frame.index} {frame.title}
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                      <span>{frame.imageStatus === "succeeded" ? "画面已生成" : "画面未生成"}</span>
                      <span>{formatDuration(frame.durationMs)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 overflow-y-auto p-5">
              <div className="media-frame relative aspect-video overflow-hidden rounded-xl">
                {selectedFrame.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedFrame.imageUrl} alt={`${selectedFrame.title} 生成画面`} className="absolute inset-0 size-full object-cover" />
                )}
                {selectedFrame.index === generatingSceneIndex && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/55 text-white backdrop-blur-[1px]">
                    <span className="size-10 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    <span className="mt-3 text-sm font-medium">正在生成第 {selectedFrame.index} 个分镜画面</span>
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {selectedFrame.index} {selectedFrame.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selectedFrame.narration}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">{formatDuration(selectedFrame.durationMs)}</span>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">画面提示词</p>
                <p className="mt-1 text-sm leading-6 text-slate-800">{selectedFrame.prompt}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="rounded-lg border border-slate-200 p-3">画面状态：{selectedFrame.imageStatus === "succeeded" ? "已生成" : "未生成"}</div>
                <div className="rounded-lg border border-slate-200 p-3">
                  声音状态：{selectedFrame.audioStatus === "succeeded" ? "已生成" : "未生成"}
                  {selectedFrame.audioUrl ? (
                    <button type="button" className="ml-2 font-medium text-[#1554ff]" onClick={() => handlePlayAudio(selectedFrame.audioUrl!)}>
                      播放
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
