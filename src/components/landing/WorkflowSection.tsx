import { Play } from "lucide-react";
import { cn } from "@/lib/cn";

const steps = ["输入创意", "创建数据库项目", "生成分镜", "编辑时间线", "导出视频"];

const demoFrames = [
  { id: "demo-1", index: 1, title: "开场画面", className: "planet-frame" },
  { id: "demo-2", index: 2, title: "主体推进", className: "media-frame" },
  { id: "demo-3", index: 3, title: "场景转场", className: "city-frame" },
  { id: "demo-4", index: 4, title: "重点特写", className: "portal-frame" },
  { id: "demo-5", index: 5, title: "结尾收束", className: "media-frame" },
];

export function WorkflowSection() {
  return (
    <section id="workflow" className="mx-auto max-w-[1200px] px-6 py-14">
      <div className="rounded-2xl border border-slate-200 bg-white p-9 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-slate-950">从模式选择到成片保存</h2>
          <a href="#modes" className="text-sm font-medium text-[#1554ff] hover:underline">
            选择创作模式
          </a>
        </div>

        <div className="mt-11 grid grid-cols-5 gap-4">
          {steps.map((step, index) => (
            <div key={step} className="relative text-center">
              {index < steps.length - 1 && <div className="absolute left-[58%] top-4 hidden h-px w-[86%] bg-slate-200 md:block" />}
              <div className={cn("relative mx-auto flex size-8 items-center justify-center rounded-full text-sm font-semibold", index === 0 ? "bg-[#1554ff] text-white" : "bg-[#dce8f7] text-slate-600")}>
                {index + 1}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-950">{step}</h3>
              <p className="mt-2 hidden text-xs text-slate-500 md:block">
                {index === 0 ? "主题 / 文案 / 脚本" : index === 1 ? "PostgreSQL 持久化" : index === 2 ? "镜头 / 时长 / 参数" : index === 3 ? "轨道与片段" : "导出记录"}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="mb-5 text-sm text-slate-600">分镜示例</p>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-5">
              {demoFrames.map((frame) => (
                <div key={frame.id}>
                  <div className={cn("relative aspect-square overflow-hidden rounded-md shadow-sm", frame.className)}>
                    <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-xs text-white">{frame.index}</span>
                  </div>
                  <p className="mt-3 truncate text-center text-xs text-slate-600">
                    {frame.index}. {frame.title}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-5 text-sm text-slate-600">成片预览</p>
            <div className="media-frame relative aspect-video overflow-hidden rounded-xl shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <button aria-label="播放成片预览" className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur">
                <Play size={24} fill="currentColor" />
              </button>
              <div className="absolute inset-x-5 bottom-4 flex items-center gap-3 text-white">
                <Play size={15} fill="currentColor" />
                <span className="font-mono text-xs">00:00 / 00:30</span>
                <div className="h-1 flex-1 rounded-full bg-white/25" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

