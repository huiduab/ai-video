"use client";

import { AlertTriangle, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/common/Button";
import { VideoPreview } from "@/components/common/VideoPreview";
import { EditorToolbar } from "@/components/workspace/EditorToolbar";
import { StoryboardTimeline } from "@/components/workspace/StoryboardTimeline";
import { formatDuration } from "@/lib/project-mappers";
import { getScriptDurationMs } from "@/lib/storyboard-playback";
import type { ProjectMode } from "@/types/project";
import type { GeneratedStoryboardOption, StoryboardFrame } from "@/types/storyboard";

interface EditorCanvasProps {
  projectId: string;
  activeMode: ProjectMode;
  storyboardRefreshKey: number;
  videoGenerationRequestKey?: number;
  onProjectsChange?: () => void;
  onDurationChange?: (durationMs: number) => void;
}

interface ExportDialogState {
  title: string;
  message: string;
  help?: string;
}

interface ExportResponsePayload {
  asset?: {
    url?: string | null;
  };
  error?: string;
  help?: string;
}

class ExportRequestError extends Error {
  help?: string;

  constructor(message: string, help?: string) {
    super(message);
    this.name = "ExportRequestError";
    this.help = help;
  }
}

function triggerBrowserDownload(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = url.split("/").pop() || "motionweave-export.mp4";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function readExportResponse(response: Response): Promise<ExportResponsePayload> {
  const fallbackMessage = response.ok ? "MP4 导出响应为空或格式错误" : "MP4 导出失败";
  const text = await response.text().catch(() => "");
  const trimmed = text.trim();

  if (!trimmed) {
    return { error: fallbackMessage };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ExportResponsePayload;
    }

    return { error: fallbackMessage };
  } catch {
    return { error: response.ok ? fallbackMessage : trimmed };
  }
}

function parseExportError(error: unknown): { message: string; help?: string } {
  const fallbackMessage = "MP4 导出失败";

  if (error instanceof ExportRequestError) {
    return { message: error.message || fallbackMessage, help: error.help };
  }

  if (!(error instanceof Error)) {
    return { message: fallbackMessage };
  }

  if (!error.message.trim()) {
    return { message: fallbackMessage };
  }

  return { message: error.message };
}

export function EditorCanvas({ projectId, activeMode, storyboardRefreshKey, videoGenerationRequestKey = 0, onProjectsChange, onDurationChange }: EditorCanvasProps) {
  const [activeFrame, setActiveFrame] = useState<StoryboardFrame | null>(null);
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [activeStoryboard, setActiveStoryboard] = useState<GeneratedStoryboardOption | null>(null);
  const [previewSeekRequestKey, setPreviewSeekRequestKey] = useState(0);
  const [subtitlesVisible, setSubtitlesVisible] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [exportDialog, setExportDialog] = useState<ExportDialogState | null>(null);
  const handleActiveFrameChange = useCallback((frame: StoryboardFrame | null, storyboard: GeneratedStoryboardOption | null, nextFrames: StoryboardFrame[]) => {
    setActiveFrame(frame);
    setFrames(nextFrames);
    setActiveStoryboard(storyboard);
    setPreviewSeekRequestKey((value) => value + 1);
  }, []);
  const totalDurationMs = activeStoryboard ? getScriptDurationMs(activeStoryboard.script) : 0;

  async function handleExportMp4() {
    if (!activeStoryboard || exporting) {
      return;
    }

    setExporting(true);
    setExportStatus("正在导出 MP4");
    setExportUrl("");
    setExportDialog(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeSubtitles: subtitlesVisible }),
      });
      const payload = await readExportResponse(response);

      if (!response.ok || !payload.asset?.url) {
        throw new ExportRequestError(payload.error ?? "MP4 导出失败", payload.help);
      }

      setExportUrl(payload.asset.url);
      setExportStatus("MP4 导出完成，已开始下载");
      triggerBrowserDownload(payload.asset.url);
      onProjectsChange?.();
    } catch (error) {
      const { message, help } = parseExportError(error);

      setExportStatus("MP4 导出失败");
      setExportDialog({
        title: "无法导出 MP4",
        message,
        help,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <EditorToolbar
        captionsEnabled={subtitlesVisible}
        onCaptionsEnabledChange={setSubtitlesVisible}
        exportDisabled={!activeStoryboard}
        exporting={exporting}
        exportUrl={exportUrl}
        exportStatus={exportStatus}
        onExport={() => void handleExportMp4()}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
        <VideoPreview
          large
          className="min-h-[260px] flex-1 rounded-xl"
          title={activeFrame?.title ?? activeStoryboard?.title}
          narration={activeFrame?.narration ?? activeStoryboard?.summary}
          prompt={activeFrame?.prompt}
          imageUrl={activeFrame?.imageUrl}
          htmlUrl={activeFrame?.htmlUrl}
          imageStatus={activeFrame?.imageStatus}
          htmlStatus={activeFrame?.htmlStatus}
          currentTime={formatDuration(activeFrame?.startMs ?? 0)}
          totalTime={formatDuration(totalDurationMs)}
          frames={frames}
          subtitlesVisible={subtitlesVisible}
          onSubtitlesVisibleChange={setSubtitlesVisible}
          seekToMs={activeFrame?.startMs ?? 0}
          seekRequestKey={previewSeekRequestKey}
        />
        <div className="shrink-0">
          <StoryboardTimeline
            projectId={projectId}
            mode={activeMode}
            refreshKey={storyboardRefreshKey}
            videoGenerationRequestKey={videoGenerationRequestKey}
            onActiveFrameChange={handleActiveFrameChange}
            onProjectsChange={onProjectsChange}
            onDurationChange={onDurationChange}
          />
        </div>
      </div>

      {exportDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <AlertTriangle size={19} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-950">{exportDialog.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{exportDialog.message}</p>
                  {exportDialog.help ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{exportDialog.help}</p> : null}
                </div>
              </div>
              <button
                type="button"
                aria-label="关闭导出说明"
                onClick={() => setExportDialog(null)}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={() => setExportDialog(null)}>
                知道了
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
