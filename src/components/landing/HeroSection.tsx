import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/common/Button";

export function HeroSection() {
  return (
    <section className="mx-auto grid min-h-[520px] max-w-[1200px] grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-[1fr_550px]">
      <div>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#cddcff] bg-[#eef4ff] px-4 py-2 text-sm font-medium text-[#1554ff]">
          <Sparkles size={16} />
          AI 驱动的视频创作工作台
        </div>
        <h1 className="text-5xl font-bold leading-tight tracking-normal text-slate-950 md:text-6xl">
          让创意流动，
          <br />
          让视频成片
        </h1>
        <p className="mt-7 max-w-[580px] text-base leading-8 text-slate-700">
          motionweave-ai 将创作模式、项目历史和分镜参数写入 PostgreSQL，让每一次创作都可以保存、恢复和扩展。
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Link href="#modes">
            <Button size="lg">选择创作模式</Button>
          </Link>
          <Button variant="secondary" size="lg">
            <Play size={18} fill="currentColor" />
            查看演示
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-[#eaf1ff] p-8 shadow-sm">
        <div className="soft-grid relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-300 bg-slate-200">
          <div className="absolute inset-0 bg-white/58" />
          <div className="absolute left-[12%] top-[26%] h-[16%] w-[18%] rounded-t-full bg-white/80 shadow" />
          <div className="absolute left-[28%] top-[18%] h-[58%] w-[40%] rounded-2xl border border-white/70 bg-white/45 shadow-lg backdrop-blur" />
          <div className="absolute left-[36%] top-[30%] h-[44%] w-[28%] rounded-2xl border border-cyan-100 bg-white/50 shadow-[0_0_35px_rgba(94,234,212,0.5)]" />
          <div className="absolute bottom-[18%] left-[15%] h-[8%] w-[70%] skew-x-[-18deg] rounded bg-white/75 shadow" />
          <div className="absolute right-[13%] top-[15%] size-16 rounded-full border border-white/70 bg-white/40 shadow-inner" />
          <div className="absolute left-1/2 top-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#1554ff] text-white shadow-xl">
            <Play size={38} fill="currentColor" />
          </div>
        </div>
      </div>
    </section>
  );
}
