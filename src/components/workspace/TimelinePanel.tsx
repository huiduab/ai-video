import type { ReactNode } from "react";
import { ArrowLeftRight, Plus, Volume2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/cn";

export interface TimelineItem {
  id: string;
  index: number;
  title: string;
  duration: string;
  thumbnailClass: string;
  thumbnailUrl?: string | null;
  statusLabel?: string;
  isGenerating?: boolean;
  badge?: ReactNode;
  audioUrl?: string;
  onPlayAudio?: (url: string) => void;
}

interface TimelinePanelProps {
  title: string;
  description: string;
  addLabel: string;
  items: TimelineItem[];
  selectedId: string;
  totalDuration: string;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onOpenItem?: (id: string) => void;
  actionSlot?: ReactNode;
  showAddActions?: boolean;
  hideHeading?: boolean;
}

export function TimelinePanel({
  title,
  description,
  addLabel,
  items,
  selectedId,
  totalDuration,
  onAdd,
  onSelect,
  onOpenItem,
  actionSlot,
  showAddActions = true,
  hideHeading = false,
}: TimelinePanelProps) {
  const totalDurationNode = (
    <div className="border-l border-slate-200 pl-3 text-xs text-slate-700">
      <span>总时长</span>
      <div className="mt-0.5 font-mono text-sm text-slate-950">{totalDuration}</div>
    </div>
  );

  return (
    <section className="flex h-[205px] flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-center gap-3">
        {!hideHeading && (
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="shrink-0 text-base font-semibold text-slate-950">{title}</h2>
            <p className="truncate text-xs text-slate-600">{description}</p>
          </div>
        )}
        <div className={cn("flex shrink-0 items-center gap-2", hideHeading ? "mr-auto" : "ml-auto")}>
          {actionSlot}
          {showAddActions && (
            <>
              <Button variant="secondary" onClick={onAdd}>
                <Plus size={16} />
                {addLabel}
              </Button>
              <Button variant="secondary">
                <ArrowLeftRight size={16} />
                调整顺序
              </Button>
            </>
          )}
          {!hideHeading && totalDurationNode}
        </div>
        {hideHeading && <div className="ml-auto shrink-0">{totalDurationNode}</div>}
      </div>

      <div className="mt-2 flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
            暂无分镜，点击左上方按钮添加。
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onDoubleClick={() => onOpenItem?.(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item.id);
                }
              }}
              className={cn(
                "min-w-[132px] flex-1 cursor-pointer rounded-xl border bg-[#f8faff] p-2 text-left transition",
                selectedId === item.id
                  ? "border-[#1554ff] shadow-[0_0_0_2px_rgba(21,84,255,0.2)]"
                  : "border-slate-200 hover:border-[#97b5ff]",
              )}
            >
              <h3 className="truncate text-xs font-medium text-slate-950">
                {item.index} {item.title}
              </h3>
              <div className={cn("relative mt-1.5 h-14 overflow-hidden rounded-lg", item.thumbnailClass)}>
                {item.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt={`${item.title} 画面`} className="absolute inset-0 size-full object-cover" />
                )}
                {item.statusLabel && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                    {item.statusLabel}
                  </span>
                )}
                {item.badge}
                <button
                  type="button"
                  aria-label={item.audioUrl ? `播放 ${item.title} 旁白` : `${item.title} 暂无旁白音频`}
                  disabled={!item.audioUrl}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (item.audioUrl) {
                      item.onPlayAudio?.(item.audioUrl);
                    }
                  }}
                  className={cn(
                    "absolute right-1.5 top-1.5 z-20 flex size-6 items-center justify-center rounded-full bg-white/90 shadow-sm transition",
                    item.audioUrl ? "text-[#1554ff] hover:bg-white" : "cursor-not-allowed text-slate-400",
                  )}
                >
                  <Volume2 size={13} />
                </button>
                {item.isGenerating && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/55 text-white backdrop-blur-[1px]">
                    <span className="size-6 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    <span className="mt-1 text-[10px] font-medium">生成中</span>
                  </div>
                )}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[11px] text-white">
                  {item.duration}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-1.5 px-1">
        <div className="relative h-4">
          <div className="absolute left-0 right-0 top-2 h-1 rounded-full bg-slate-200" />
          <div className="absolute left-0 top-1 size-3 rounded-full bg-[#1554ff]" />
          {[25, 50, 75, 100].map((point) => (
            <div key={point} className="absolute top-1 size-3 rounded-full bg-slate-300" style={{ left: `${point}%` }} />
          ))}
        </div>
        <div className="flex justify-between font-mono text-[11px] text-slate-600">
          <span>00:00</span>
          <span>{totalDuration}</span>
        </div>
      </div>
    </section>
  );
}
