import { Logo } from "@/components/common/Logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-[#f3f6fc]">
      <div className="mx-auto flex min-h-24 max-w-[1200px] flex-col items-center justify-between gap-5 px-6 py-8 text-sm text-slate-600 md:flex-row">
        <Logo compact />
        <nav className="flex flex-wrap items-center justify-center gap-7" aria-label="页脚导航">
          <a href="#privacy" className="hover:text-[#1554ff]">隐私政策</a>
          <a href="#terms" className="hover:text-[#1554ff]">服务条款</a>
          <a href="#contact" className="hover:text-[#1554ff]">联系我们</a>
          <a href="#docs" className="hover:text-[#1554ff]">文档中心</a>
        </nav>
        <p className="text-[#1554ff]">© 2024 motionweave-ai. 保留所有权利。</p>
      </div>
    </footer>
  );
}
