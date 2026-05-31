import Link from "next/link";
import { ArrowRight, Code2, Image, PenLine, Sparkle, SlidersHorizontal, Table2 } from "lucide-react";
import type { ProjectMode } from "@/types/project";

const principles = [
  { title: "化繁为简", desc: "清晰流程让创作回到内容本身。", icon: PenLine },
  { title: "可控可调", desc: "从分镜、节奏到画面细节都能继续编辑。", icon: SlidersHorizontal },
  { title: "模块化生成", desc: "分镜、素材、动画和导出任务都可复用扩展。", icon: Table2 },
  { title: "AI 辅助创意", desc: "从灵感到脚本再到画面，逐步生成并保留控制权。", icon: Sparkle },
];

export function ConceptCards() {
  return (
    <section id="modes" className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-6 py-10 lg:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-9 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">设计原则</h2>
        <p className="mt-3 text-sm text-slate-600">以人为本、AI 增强、数据可追踪。</p>
        <div className="mt-8 grid grid-cols-2 gap-7">
          {principles.map((item) => (
            <div key={item.title}>
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-[#eaf1ff] text-[#1554ff]">
                <item.icon size={19} />
              </div>
              <h3 className="font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </article>

      <ModeCard
        mode="slideshow"
        icon={<Image size={24} />}
        tone="bg-[#ded8ff] text-[#1554ff]"
        title="图片轮播模式"
        subtitle="Image Slideshow Mode"
        desc="创建数据库项目后，以分镜图片、平移缩放和转场快速生成视频。"
      />
      <ModeCard
        mode="html-animation"
        icon={<Code2 size={26} />}
        tone="bg-emerald-300 text-emerald-950"
        title="HTML 动画模式"
        subtitle="HTML Animation Mode"
        desc="创建数据库项目后，用 HTML/CSS 动画片段组合更自由的视觉表达。"
        glow
      />
    </section>
  );
}

function ModeCard({
  mode,
  icon,
  tone,
  title,
  subtitle,
  desc,
  glow = false,
}: {
  mode: ProjectMode;
  icon: React.ReactNode;
  tone: string;
  title: string;
  subtitle: string;
  desc: string;
  glow?: boolean;
}) {
  return (
    <Link
      href={`/create?mode=${mode}`}
      className="group relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-9 shadow-sm transition hover:-translate-y-0.5 hover:border-[#97b5ff] hover:shadow-md"
    >
      {glow && <div className="absolute -bottom-20 -right-12 size-64 rounded-full bg-cyan-200/50 blur-3xl" />}
      <div className={`relative flex size-14 items-center justify-center rounded-2xl ${tone}`}>{icon}</div>
      <div className="relative mt-28">
        <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        <p className="mt-5 max-w-[250px] text-sm leading-7 text-slate-600">{desc}</p>
      </div>
      <span className="absolute bottom-8 right-8 flex size-11 items-center justify-center rounded-full bg-[#dbe8ff] text-[#1554ff] transition group-hover:bg-[#1554ff] group-hover:text-white">
        <ArrowRight size={21} />
      </span>
    </Link>
  );
}

