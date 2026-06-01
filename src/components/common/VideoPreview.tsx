"use client";

import { Maximize, Pause, Play, Settings, Volume2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

interface VideoPreviewProps {
  large?: boolean;
  className?: string;
  title?: string;
  narration?: string;
  prompt?: string;
  currentTime?: string;
  totalTime?: string;
}

export function VideoPreview({ large = false, className, title, narration, prompt, currentTime = "00:00", totalTime = "00:00" }: VideoPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const hasGeneratedContent = Boolean(title || narration || prompt);

  return (
    <section
      className={cn(
        "media-frame relative overflow-hidden rounded-2xl border border-slate-800/10 shadow-sm",
        large ? "aspect-auto" : "aspect-[16/9]",
        className,
      )}
      aria-label="视频预览"
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/62 via-black/10 to-white/5" />
      <div className="absolute left-[9%] top-[18%] h-[68%] w-[10%] rounded-t-full bg-black/25" />
      <div className="absolute left-[23%] top-[10%] h-[82%] w-[4%] rounded-t-full bg-black/25" />
      <div className="absolute right-[20%] top-[14%] h-[76%] w-[7%] rounded-t-full bg-black/25" />
      <div className="absolute right-[8%] top-[20%] h-[70%] w-[5%] rounded-t-full bg-black/25" />
      <div className="absolute left-1/2 top-[2%] h-[58%] w-[30%] -translate-x-1/2 rounded-full border border-white/15 bg-teal-100/20 blur-[1px]" />

      {hasGeneratedContent && (
        <div className="absolute left-5 top-5 z-10 max-w-[58%] rounded-xl bg-slate-950/58 p-4 text-white backdrop-blur">
          <h2 className="text-lg font-semibold">{title}</h2>
          {narration && <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/86">{narration}</p>}
          {prompt && <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/62">画面：{prompt}</p>}
        </div>
      )}

      <button
        aria-label={playing ? "暂停预览" : "播放预览"}
        onClick={() => setPlaying((value) => !value)}
        className="absolute left-1/2 top-1/2 z-10 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/55 text-white backdrop-blur transition hover:bg-[#1554ff]"
      >
        {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
      </button>

      <div className="absolute inset-x-5 bottom-4 z-10 flex items-center gap-3 text-white">
        <Play size={18} fill="currentColor" />
        <span className="font-mono text-xs">{currentTime} / {totalTime}</span>
        <div className="h-1.5 flex-1 rounded-full bg-white/24">
          <div className="h-full w-[38%] rounded-full bg-[#1554ff]" />
        </div>
        <Volume2 size={19} />
        <Settings size={19} />
        <Maximize size={19} />
      </div>
    </section>
  );
}
