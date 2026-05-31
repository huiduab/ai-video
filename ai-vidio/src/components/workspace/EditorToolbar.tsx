"use client";

import { Captions, ChevronDown, Code2, Download, Image, Maximize } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { cn } from "@/lib/cn";
import type { ProjectMode } from "@/types/project";

interface EditorToolbarProps {
  activeMode: ProjectMode;
  onModeChange: (mode: ProjectMode) => void;
}

export function EditorToolbar({ activeMode, onModeChange }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-[#f7f9ff] px-6 py-1.5">
      <div className="grid h-14 w-[330px] grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-[#eef4ff] p-1">
        <button
          onClick={() => onModeChange("slideshow")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition",
            activeMode === "slideshow" ? "bg-white text-[#1554ff] shadow-sm" : "text-slate-700 hover:text-[#1554ff]",
          )}
        >
          <Image size={18} />
          图片轮播模式
        </button>
        <button
          onClick={() => onModeChange("html-animation")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition",
            activeMode === "html-animation" ? "bg-white text-[#1554ff] shadow-sm" : "text-slate-700 hover:text-[#1554ff]",
          )}
        >
          <Code2 size={19} />
          HTML动画模式
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <IconButton label="字幕">
          <Captions size={20} />
        </IconButton>
        <IconButton label="全屏">
          <Maximize size={20} />
        </IconButton>
        <button className="ml-1 flex h-12 min-w-40 items-center justify-center gap-2 rounded-xl bg-[#3868ff] px-5 text-base font-medium text-white transition hover:bg-[#1554ff]">
          <Download size={20} />
          导出视频
          <ChevronDown size={18} />
        </button>
      </div>
    </div>
  );
}
