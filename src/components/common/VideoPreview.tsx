"use client";

import { Captions, Maximize, Pause, Play, Settings, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/project-mappers";
import { normalizePlaybackEffect } from "@/lib/storyboard-playback";
import type { PlaybackEffect } from "@/types/agent";
import type { StoryboardFrame } from "@/types/storyboard";

interface VideoPreviewProps {
  large?: boolean;
  className?: string;
  title?: string;
  narration?: string;
  prompt?: string;
  imageUrl?: string | null;
  imageStatus?: string;
  currentTime?: string;
  totalTime?: string;
  frames?: StoryboardFrame[];
  subtitlesVisible?: boolean;
  onSubtitlesVisibleChange?: (visible: boolean) => void;
  seekToMs?: number;
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

const subtitleSplitPattern = /[。！？!?；;：:\n\r]+/u;
const subtitleSoftSplitPattern = /([，,、\s]+)/u;
const subtitlePunctuationPattern = /[\p{P}\p{S}，。！？、；：""''（）《》【】「」『』…—·￥]+/gu;
const maxSubtitleLength = 16;

interface SubtitleCue {
  text: string;
  startRatio: number;
  endRatio: number;
}

function getSubtitleWeight(text: string) {
  return text.replace(subtitlePunctuationPattern, "").replace(/\s+/g, "").length;
}

function splitLongSubtitleToken(token: string) {
  const parts: string[] = [];

  for (let index = 0; index < token.length; index += maxSubtitleLength) {
    parts.push(token.slice(index, index + maxSubtitleLength));
  }

  return parts;
}

function segmentSubtitleText(text: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    return Array.from(segmenter.segment(text), (segment) => segment.segment.trim()).filter(Boolean);
  }

  return Array.from(text);
}

function splitSubtitleByMeaning(text: string) {
  const cleanedText = text.replace(subtitlePunctuationPattern, "").replace(/\s+/g, " ").trim();

  if (!cleanedText) {
    return [];
  }

  const tokens = cleanedText
    .split(subtitleSoftSplitPattern)
    .flatMap((part) => {
      const cleanedPart = part.replace(subtitlePunctuationPattern, "").trim();

      if (!cleanedPart) {
        return [];
      }

      return segmentSubtitleText(cleanedPart);
    })
    .filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const token of tokens) {
    if (getSubtitleWeight(token) > maxSubtitleLength) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      lines.push(...splitLongSubtitleToken(token));
      continue;
    }

    const nextLine = `${currentLine}${token}`;

    if (currentLine && getSubtitleWeight(nextLine) > maxSubtitleLength) {
      lines.push(currentLine);
      currentLine = token;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function splitNarrationToSubtitleCues(narration: string | undefined): SubtitleCue[] {
  if (!narration?.trim()) {
    return [];
  }

  const rawSegments = narration
    .split(subtitleSplitPattern)
    .flatMap((segment) => splitSubtitleByMeaning(segment))
    .filter(Boolean);
  const segments = rawSegments.length > 0 ? rawSegments : splitSubtitleByMeaning(narration);
  const weights = segments.map((segment) => getSubtitleWeight(segment));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || segments.length;
  let cursor = 0;

  return segments.map((text, index) => {
    const weight = weights[index] || 1;
    const startRatio = cursor / totalWeight;
    cursor += weight;

    return {
      text: text.slice(0, maxSubtitleLength),
      startRatio,
      endRatio: cursor / totalWeight,
    };
  });
}

function getActiveSubtitle(cues: SubtitleCue[], frameProgress: number) {
  if (cues.length === 0) {
    return "";
  }

  const progress = clampProgress(frameProgress);
  return cues.find((cue) => progress >= cue.startRatio && progress < cue.endRatio)?.text ?? cues[cues.length - 1]?.text ?? "";
}

function getFramesTotalDurationMs(frames: StoryboardFrame[]) {
  const lastFrame = frames[frames.length - 1];
  return lastFrame ? lastFrame.startMs + lastFrame.durationMs : 0;
}

function getMotionDefaults(type: PlaybackEffect["imageMotion"]["type"]) {
  switch (type) {
    case "slow-zoom-out":
      return { scaleFrom: 1.1, scaleTo: 1, translateFrom: { x: 0, y: 0 }, translateTo: { x: 0, y: 0 } };
    case "pan-left":
      return { scaleFrom: 1.08, scaleTo: 1.08, translateFrom: { x: 2, y: 0 }, translateTo: { x: -2, y: 0 } };
    case "pan-right":
      return { scaleFrom: 1.08, scaleTo: 1.08, translateFrom: { x: -2, y: 0 }, translateTo: { x: 2, y: 0 } };
    case "pan-up":
      return { scaleFrom: 1.08, scaleTo: 1.08, translateFrom: { x: 0, y: 2 }, translateTo: { x: 0, y: -2 } };
    case "pan-down":
      return { scaleFrom: 1.08, scaleTo: 1.08, translateFrom: { x: 0, y: -2 }, translateTo: { x: 0, y: 2 } };
    case "ken-burns-in-left":
      return { scaleFrom: 1, scaleTo: 1.1, translateFrom: { x: 2, y: 0 }, translateTo: { x: -2, y: 0 } };
    case "ken-burns-in-right":
      return { scaleFrom: 1, scaleTo: 1.1, translateFrom: { x: -2, y: 0 }, translateTo: { x: 2, y: 0 } };
    case "ken-burns-out-left":
      return { scaleFrom: 1.12, scaleTo: 1.02, translateFrom: { x: 2, y: 0 }, translateTo: { x: -2, y: 0 } };
    case "ken-burns-out-right":
      return { scaleFrom: 1.12, scaleTo: 1.02, translateFrom: { x: -2, y: 0 }, translateTo: { x: 2, y: 0 } };
    case "none":
      return { scaleFrom: 1, scaleTo: 1, translateFrom: { x: 0, y: 0 }, translateTo: { x: 0, y: 0 } };
    case "slow-zoom-in":
    default:
      return { scaleFrom: 1, scaleTo: 1.08, translateFrom: { x: 0, y: 0 }, translateTo: { x: 0, y: 0 } };
  }
}

function getImageStyle(effect: PlaybackEffect | undefined, progress: number) {
  const normalized = normalizePlaybackEffect(effect);
  const defaults = getMotionDefaults(normalized.imageMotion.type);
  const scaleFrom = normalized.imageMotion.scaleFrom ?? defaults.scaleFrom;
  const scaleTo = normalized.imageMotion.scaleTo ?? defaults.scaleTo;
  const translateFrom = normalized.imageMotion.translateFrom ?? defaults.translateFrom;
  const translateTo = normalized.imageMotion.translateTo ?? defaults.translateTo;
  const eased = 1 - Math.pow(1 - clampProgress(progress), 3);
  const x = lerp(translateFrom.x, translateTo.x, eased);
  const y = lerp(translateFrom.y, translateTo.y, eased);
  const scale = lerp(scaleFrom, scaleTo, eased);

  return {
    transform: `translate3d(${x}%, ${y}%, 0) scale(${scale})`,
  };
}

function getTreatmentClass(effect: PlaybackEffect | undefined) {
  const treatment = normalizePlaybackEffect(effect).treatment;

  switch (treatment?.type) {
    case "soft-vignette":
      return "after:absolute after:inset-0 after:bg-[radial-gradient(circle,transparent_45%,rgba(15,23,42,0.32)_100%)]";
    case "cinematic-contrast":
      return "contrast-[1.08] saturate-[1.04]";
    case "warm-film":
      return "sepia-[0.16] saturate-[1.08]";
    case "cool-documentary":
      return "saturate-[0.92] hue-rotate-[188deg]";
    case "dreamy-glow":
      return "brightness-[1.05] saturate-[1.12] blur-0";
    case "subtle-grain":
      return "contrast-[1.04]";
    case "none":
    default:
      return "";
  }
}

export function VideoPreview({
  large = false,
  className,
  title,
  narration,
  prompt,
  imageUrl,
  imageStatus,
  currentTime = "00:00",
  totalTime = "00:00",
  frames = [],
  subtitlesVisible = true,
  onSubtitlesVisibleChange,
  seekToMs,
}: VideoPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seekRevision, setSeekRevision] = useState(0);
  const [audioError, setAudioError] = useState("");
  const previewRef = useRef<HTMLElement | null>(null);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const lastExternalSeekRef = useRef<number | undefined>(undefined);
  const previousFrameRef = useRef<StoryboardFrame | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAudioFrameIdRef = useRef<string | null>(null);
  const frameElapsedMsRef = useRef(0);
  const hasPlaybackFrames = frames.length > 0;
  const totalDurationMs = useMemo(() => getFramesTotalDurationMs(frames), [frames]);
  const playbackState = useMemo(() => {
    if (!hasPlaybackFrames || totalDurationMs <= 0) {
      return {
        frame: null as StoryboardFrame | null,
        previousFrame: null as StoryboardFrame | null,
        frameProgress: 0,
        frameElapsedMs: 0,
        transitionProgress: 1,
        inBreathGap: false,
      };
    }

    const boundedMs = Math.min(playheadMs, Math.max(totalDurationMs - 1, 0));
    const activeFrame = frames.find((item) => boundedMs >= item.startMs && boundedMs < item.startMs + item.durationMs);
    const breathFrame = activeFrame ? null : [...frames].reverse().find((item) => boundedMs >= item.startMs + item.durationMs);
    const frame = activeFrame ?? breathFrame ?? frames[0];
    const inBreathGap = Boolean(!activeFrame && breathFrame);
    const effect = normalizePlaybackEffect(frame.playbackEffect);
    const elapsedInFrame = inBreathGap ? frame.durationMs : Math.max(0, boundedMs - frame.startMs);
    const transitionDurationMs = Math.min(effect.transition.durationMs ?? 0, Math.max(frame.durationMs / 2, 0));
    const transitionProgress = inBreathGap ? 1 : transitionDurationMs > 0 ? clampProgress(elapsedInFrame / transitionDurationMs) : 1;

    return {
      frame,
      previousFrame: previousFrameRef.current,
      frameProgress: inBreathGap ? 1 : frame.durationMs > 0 ? clampProgress(elapsedInFrame / frame.durationMs) : 0,
      frameElapsedMs: elapsedInFrame,
      transitionProgress,
      inBreathGap,
    };
  }, [frames, hasPlaybackFrames, playheadMs, totalDurationMs]);
  const displayFrame = playbackState.frame;
  const displayTitle = displayFrame?.title ?? title;
  const displayNarration = displayFrame?.narration ?? narration;
  const displayPrompt = displayFrame?.prompt ?? prompt;
  const displayImageUrl = displayFrame?.imageUrl ?? imageUrl;
  const displayImageStatus = displayFrame?.imageStatus ?? imageStatus;
  const subtitleCues = useMemo(() => splitNarrationToSubtitleCues(displayFrame?.narration), [displayFrame?.narration]);
  const activeSubtitle = playbackState.inBreathGap ? "" : getActiveSubtitle(subtitleCues, playbackState.frameProgress);
  const displayedCurrentTime = hasPlaybackFrames ? formatDuration(playheadMs) : currentTime;
  const displayedTotalTime = hasPlaybackFrames ? formatDuration(totalDurationMs) : totalTime;
  const progressPercent = totalDurationMs > 0 ? clampProgress(playheadMs / totalDurationMs) * 100 : 0;
  const hasGeneratedContent = Boolean(displayTitle || displayNarration || displayPrompt);
  const hasImage = Boolean(displayImageUrl);

  frameElapsedMsRef.current = playbackState.frameElapsedMs;

  useEffect(() => {
    if (!playing || !hasPlaybackFrames) {
      return;
    }

    let animationId = 0;
    startedAtRef.current = performance.now() - pausedAtRef.current;

    function tick(now: number) {
      const nextPlayheadMs = now - startedAtRef.current;

      if (nextPlayheadMs >= totalDurationMs) {
        setPlayheadMs(totalDurationMs);
        pausedAtRef.current = 0;
        setPlaying(false);
        return;
      }

      setPlayheadMs(nextPlayheadMs);
      pausedAtRef.current = nextPlayheadMs;
      animationId = requestAnimationFrame(tick);
    }

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [hasPlaybackFrames, playing, totalDurationMs]);

  useEffect(() => {
    if (displayFrame && displayFrame.id !== previousFrameRef.current?.id) {
      previousFrameRef.current = displayFrame;
    }
  }, [displayFrame]);

  useEffect(() => {
    return () => {
      playbackAudioRef.current?.pause();
      playbackAudioRef.current = null;
      playbackAudioFrameIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement && previewRef.current && document.fullscreenElement === previewRef.current));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof seekToMs !== "number" || seekToMs === lastExternalSeekRef.current) {
      return;
    }

    const nextMs = Math.min(Math.max(seekToMs, 0), totalDurationMs);
    lastExternalSeekRef.current = seekToMs;
    playbackAudioRef.current?.pause();
    setPlaying(false);
    setPlayheadMs(nextMs);
    pausedAtRef.current = nextMs;
    setSeekRevision((value) => value + 1);
  }, [seekToMs, totalDurationMs]);

  useEffect(() => {
    if (playbackAudioRef.current) {
      playbackAudioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audioUrl = displayFrame?.audioUrl;

    if (!playing || !audioUrl || !displayFrame || playbackState.inBreathGap) {
      playbackAudioRef.current?.pause();
      return;
    }

    if (!playbackAudioRef.current || playbackAudioFrameIdRef.current !== displayFrame.id) {
      playbackAudioRef.current?.pause();
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      audio.volume = volume;
      playbackAudioRef.current = audio;
      playbackAudioFrameIdRef.current = displayFrame.id;
    }

    const audio = playbackAudioRef.current;
    const targetSeconds = frameElapsedMsRef.current / 1000;

    try {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(targetSeconds, Math.max(audio.duration - 0.05, 0));
      } else {
        audio.currentTime = targetSeconds;
      }
    } catch {
      audio.currentTime = 0;
    }

    void audio.play().then(() => {
      setAudioError("");
    }).catch((playError) => {
      setAudioError(playError instanceof Error ? playError.message : "总视频旁白播放失败");
    });
  }, [displayFrame?.audioUrl, displayFrame?.id, playbackState.inBreathGap, playing, seekRevision, volume]);

  function handleSeek(nextMs: number, pause = false) {
    const boundedMs = Math.min(Math.max(nextMs, 0), totalDurationMs);
    setPlayheadMs(boundedMs);
    pausedAtRef.current = boundedMs;
    setSeekRevision((value) => value + 1);

    if (pause) {
      playbackAudioRef.current?.pause();
      setPlaying(false);
    }
  }

  function handleTogglePlayback() {
    if (!hasPlaybackFrames) {
      setPlaying((value) => !value);
      return;
    }

    if (playing) {
      playbackAudioRef.current?.pause();
      setPlaying(false);
      return;
    }

    if (playheadMs >= totalDurationMs || playheadMs === 0) {
      pausedAtRef.current = 0;
      previousFrameRef.current = null;
      playbackAudioRef.current?.pause();
      playbackAudioRef.current = null;
      playbackAudioFrameIdRef.current = null;
      setPlayheadMs(0);
    }

    setAudioError("");
    setPlaying(true);
  }

  async function handleToggleFullscreen() {
    if (!previewRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await previewRef.current.requestFullscreen();
      }
    } catch (fullscreenError) {
      setAudioError(fullscreenError instanceof Error ? fullscreenError.message : "全屏切换失败");
    }
  }

  function handlePreviewClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("button,input")) {
      return;
    }

    handleTogglePlayback();
  }

  const transitionType = normalizePlaybackEffect(displayFrame?.playbackEffect).transition.type;
  const transitionProgress = playbackState.transitionProgress;
  const previousVisible =
    playbackState.previousFrame &&
    playbackState.previousFrame.id !== displayFrame?.id &&
    transitionType !== "cut" &&
    transitionProgress < 1;

  return (
    <section
      ref={previewRef}
      onClick={handlePreviewClick}
      className={cn(
        "media-frame relative overflow-hidden rounded-2xl border border-slate-800/10 shadow-sm",
        large ? "aspect-auto" : "aspect-[16/9]",
        className,
      )}
      aria-label="视频预览"
    >
      {hasImage ? (
        <>
          {previousVisible && playbackState.previousFrame?.imageUrl && (
            <div
              className={cn("absolute inset-0 overflow-hidden", getTreatmentClass(playbackState.previousFrame.playbackEffect))}
              style={{
                opacity: transitionType === "crossfade" || transitionType === "fade" ? 1 - transitionProgress : 1,
                transform:
                  transitionType === "slide-left"
                    ? `translateX(${-transitionProgress * 100}%)`
                    : transitionType === "slide-right"
                      ? `translateX(${transitionProgress * 100}%)`
                      : transitionType === "slide-up"
                        ? `translateY(${-transitionProgress * 100}%)`
                        : transitionType === "slide-down"
                          ? `translateY(${transitionProgress * 100}%)`
                          : undefined,
                filter: transitionType === "zoom-blur" ? `blur(${transitionProgress * 8}px)` : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={playbackState.previousFrame.imageUrl}
                alt={`${playbackState.previousFrame.title} 生成画面`}
                className="absolute inset-0 size-full object-cover will-change-transform"
                style={getImageStyle(playbackState.previousFrame.playbackEffect, 1)}
              />
            </div>
          )}
          <div
            className={cn("absolute inset-0 overflow-hidden", getTreatmentClass(displayFrame?.playbackEffect))}
            style={{
              opacity: transitionType === "crossfade" || transitionType === "fade" ? transitionProgress : 1,
              transform:
                transitionType === "slide-left"
                  ? `translateX(${(1 - transitionProgress) * 100}%)`
                  : transitionType === "slide-right"
                    ? `translateX(${-(1 - transitionProgress) * 100}%)`
                    : transitionType === "slide-up"
                      ? `translateY(${(1 - transitionProgress) * 100}%)`
                      : transitionType === "slide-down"
                        ? `translateY(${-(1 - transitionProgress) * 100}%)`
                        : transitionType === "zoom-blur"
                          ? `scale(${1.04 - transitionProgress * 0.04})`
                          : undefined,
              filter: transitionType === "zoom-blur" ? `blur(${(1 - transitionProgress) * 8}px)` : undefined,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImageUrl ?? ""}
              alt={displayTitle ? `${displayTitle} 生成画面` : "生成画面"}
              className="absolute inset-0 size-full object-cover will-change-transform"
              style={getImageStyle(displayFrame?.playbackEffect, playbackState.frameProgress)}
            />
          </div>
          {transitionType === "dip-to-black" && <div className="absolute inset-0 bg-black" style={{ opacity: Math.sin(transitionProgress * Math.PI) }} />}
          {transitionType === "dip-to-white" && <div className="absolute inset-0 bg-white" style={{ opacity: Math.sin(transitionProgress * Math.PI) }} />}
        </>
      ) : (
        <>
          <div className="absolute left-[9%] top-[18%] h-[68%] w-[10%] rounded-t-full bg-black/25" />
          <div className="absolute left-[23%] top-[10%] h-[82%] w-[4%] rounded-t-full bg-black/25" />
          <div className="absolute right-[20%] top-[14%] h-[76%] w-[7%] rounded-t-full bg-black/25" />
          <div className="absolute right-[8%] top-[20%] h-[70%] w-[5%] rounded-t-full bg-black/25" />
          <div className="absolute left-1/2 top-[2%] h-[58%] w-[30%] -translate-x-1/2 rounded-full border border-white/15 bg-teal-100/20 blur-[1px]" />
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/62 via-black/10 to-white/5" />

      {playing && subtitlesVisible && activeSubtitle && (
        <div className="pointer-events-none absolute inset-x-4 bottom-14 z-10 flex justify-center px-4 text-center">
          <p
            className="max-w-[86%] whitespace-nowrap text-xl font-semibold leading-none text-white lg:text-2xl"
            style={{
              textShadow: "0 3px 10px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.95)",
            }}
          >
            {activeSubtitle}
          </p>
        </div>
      )}

      {!hasImage && hasGeneratedContent && (
        <div className="absolute left-5 top-5 z-10 max-w-[58%] rounded-xl bg-slate-950/58 p-4 text-white backdrop-blur">
          <h2 className="text-lg font-semibold">{displayTitle}</h2>
          {displayNarration && <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/86">{displayNarration}</p>}
          {displayPrompt && <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/62">画面：{displayPrompt}</p>}
          {!hasImage && displayImageStatus !== "succeeded" && <p className="mt-2 text-xs text-white/62">画面尚未生成</p>}
          {audioError && <p className="mt-2 text-xs text-rose-100">旁白播放失败：{audioError}</p>}
        </div>
      )}

      <button
        aria-label={playing ? "暂停预览" : "播放预览"}
        onClick={handleTogglePlayback}
        className="absolute left-1/2 top-1/2 z-10 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/55 text-white backdrop-blur transition hover:bg-[#1554ff]"
      >
        {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
      </button>

      <div className="absolute inset-x-5 bottom-4 z-10 flex items-center gap-3 text-white">
        <button type="button" aria-label={playing ? "暂停视频" : "播放视频"} onClick={handleTogglePlayback} className="rounded-full p-1 transition hover:bg-white/15">
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <span className="font-mono text-xs">{displayedCurrentTime} / {displayedTotalTime}</span>
        <input
          aria-label="播放进度"
          type="range"
          min={0}
          max={Math.max(totalDurationMs, 1)}
          step={50}
          value={Math.min(playheadMs, Math.max(totalDurationMs, 0))}
          onInput={(event) => handleSeek(Number(event.currentTarget.value))}
          onChange={(event) => handleSeek(Number(event.target.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#1554ff]"
          style={{
            background: `linear-gradient(to right, #1554ff ${progressPercent}%, rgba(255,255,255,0.24) ${progressPercent}%)`,
          }}
        />
        <Volume2 size={19} />
        <input
          aria-label="视频音量"
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onInput={(event) => setVolume(Number(event.currentTarget.value) / 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          className="h-1.5 w-20 cursor-pointer accent-white"
        />
        <button
          type="button"
          aria-label={subtitlesVisible ? "隐藏字幕" : "显示字幕"}
          aria-pressed={subtitlesVisible}
          onClick={() => onSubtitlesVisibleChange?.(!subtitlesVisible)}
          className={cn(
            "rounded-full p-1 transition hover:bg-white/15",
            subtitlesVisible ? "bg-white/18 text-white" : "text-white/58",
          )}
        >
          <Captions size={19} />
        </button>
        <Settings size={19} />
        <button
          type="button"
          aria-label={isFullscreen ? "退出全屏" : "全屏播放"}
          aria-pressed={isFullscreen}
          onClick={handleToggleFullscreen}
          className="rounded-full p-1 transition hover:bg-white/15"
        >
          <Maximize size={19} />
        </button>
      </div>
    </section>
  );
}
