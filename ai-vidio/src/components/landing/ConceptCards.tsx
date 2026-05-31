import { ArrowRight, Code2, Image, PenLine, Sparkle, SlidersHorizontal, Table2 } from "lucide-react";

const principles = [
  { title: "化繁为简", desc: "极简界面与清晰流程，让创作回归专注与高效。", icon: PenLine },
  { title: "可控可调", desc: "从分镜到镜头，从节奏到细节，精细控制每一帧呈现。", icon: SlidersHorizontal },
  { title: "模块化生成", desc: "分镜驱动，模块组合，支持复用与一致性管理。", icon: Table2 },
  { title: "AI 辅助创意", desc: "从灵感到脚本到画面，AI 助你突破创作边界。", icon: Sparkle },
];

export function ConceptCards() {
  return (
    <section id="功能" className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-6 py-10 lg:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-9 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">我们的设计理念</h2>
        <p className="mt-3 text-sm text-slate-600">以人为本 · AI 增强 · 控制在你手中</p>
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
        icon={<Image size={24} />}
        tone="bg-[#ded8ff] text-[#1554ff]"
        title="图片轮播模式"
        subtitle="Image Slideshow Mode"
        desc="AI 生成分镜图片，通过播放与平移营造动画感，快速生成富有表现力的视频。"
      />
      <ModeCard
        icon={<Code2 size={26} />}
        tone="bg-emerald-300 text-emerald-950"
        title="HTML动画模式"
        subtitle="HTML Animation Mode"
        desc="AI 基于分镜镜头生成 HTML 动画，再智能组合成完整视频，实现更自由的视觉表达。"
        glow
      />
    </section>
  );
}

function ModeCard({
  icon,
  tone,
  title,
  subtitle,
  desc,
  glow = false,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  subtitle: string;
  desc: string;
  glow?: boolean;
}) {
  return (
    <article className="relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-9 shadow-sm">
      {glow && <div className="absolute -bottom-20 -right-12 size-64 rounded-full bg-cyan-200/50 blur-3xl" />}
      <div className={`relative flex size-14 items-center justify-center rounded-2xl ${tone}`}>{icon}</div>
      <div className="relative mt-28">
        <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        <p className="mt-5 max-w-[250px] text-sm leading-7 text-slate-600">{desc}</p>
      </div>
      <button aria-label={`${title}详情`} className="absolute bottom-8 right-8 flex size-11 items-center justify-center rounded-full bg-[#dbe8ff] text-[#1554ff] transition hover:bg-[#1554ff] hover:text-white">
        <ArrowRight size={21} />
      </button>
    </article>
  );
}
