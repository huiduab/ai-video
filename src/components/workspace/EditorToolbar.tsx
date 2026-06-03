"use client";

import { Captions, ChevronDown, Download, Music2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface EditorToolbarProps {
  captionsEnabled: boolean;
  onCaptionsEnabledChange: (enabled: boolean) => void;
}

export function EditorToolbar({ captionsEnabled, onCaptionsEnabledChange }: EditorToolbarProps) {
  return (
    <div className="flex h-14 items-center gap-2 overflow-hidden border-b border-slate-200 bg-[#f7f9ff] px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <label className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm">
          <Captions size={16} />
          <span>字幕</span>
          <button
            type="button"
            aria-label={captionsEnabled ? "关闭字幕" : "开启字幕"}
            aria-pressed={captionsEnabled}
            onClick={() => onCaptionsEnabledChange(!captionsEnabled)}
            className={cn("relative h-5 w-9 rounded-full transition", captionsEnabled ? "bg-[#1554ff]" : "bg-slate-300")}
          >
            <span className={cn("absolute top-1 size-3 rounded-full bg-white shadow-sm transition", captionsEnabled ? "left-5" : "left-1")} />
          </button>
        </label>

        <button className="flex h-10 min-w-0 shrink items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm transition hover:border-[#1554ff] hover:text-[#1554ff]">
          <Music2 size={16} className="shrink-0" />
          <span className="shrink-0">音乐</span>
          <span className="min-w-0 max-w-16 truncate text-slate-500">轻松舒缓</span>
          <ChevronDown size={14} className="shrink-0" />
        </button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#3868ff] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1554ff]">
          <Download size={17} />
          导出
        </button>
      </div>
    </div>
  );
}
