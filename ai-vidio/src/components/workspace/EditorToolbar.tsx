"use client";

import { Captions, ChevronDown, Download, Maximize, Music2, Volume2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ProjectMode } from "@/types/project";

interface EditorToolbarProps {
  activeMode: ProjectMode;
  onModeChange: (mode: ProjectMode) => void;
}

export function EditorToolbar({ activeMode, onModeChange }: EditorToolbarProps) {
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [volume, setVolume] = useState(62);

  void activeMode;
  void onModeChange;

  return (
    <div className="flex h-[72px] items-center gap-3 border-b border-slate-200 bg-[#f7f9ff] px-5 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
        <label className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm">
          <Captions size={18} />
          字幕
          <button
            type="button"
            aria-label={captionsEnabled ? "关闭字幕" : "开启字幕"}
            onClick={() => setCaptionsEnabled((value) => !value)}
            className={cn("relative h-6 w-11 rounded-full transition", captionsEnabled ? "bg-[#1554ff]" : "bg-slate-300")}
          >
            <span className={cn("absolute top-1 size-4 rounded-full bg-white shadow-sm transition", captionsEnabled ? "left-6" : "left-1")} />
          </button>
        </label>

        <button className="flex h-12 min-w-56 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-[#1554ff] hover:text-[#1554ff]">
          <Music2 size={18} />
          <span>背景音乐</span>
          <div className="h-6 w-px bg-slate-200" />
          <span className="text-slate-500">轻松舒缓</span>
          <ChevronDown size={16} className="ml-auto" />
        </button>

        <div className="flex h-12 min-w-56 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm">
          <Volume2 size={18} />
          <input
            aria-label="音量"
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[#1554ff]"
          />
          <ChevronDown size={16} className="text-slate-500" />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <button className="flex h-12 min-w-28 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-[#1554ff] hover:text-[#1554ff]">
          <Maximize size={18} />
          全屏
        </button>

        <button className="flex h-12 min-w-36 items-center justify-center gap-2 rounded-xl bg-[#3868ff] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1554ff]">
          <Download size={19} />
          导出视频
        </button>
      </div>
    </div>
  );
}
