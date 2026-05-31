import Link from "next/link";
import { Globe2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Logo } from "@/components/common/Logo";

const navItems = ["首页", "功能", "解决方案", "模板中心", "定价", "帮助中心"];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link href="/" aria-label="MotionWeave AI 首页">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-9 text-sm text-slate-600 lg:flex" aria-label="主导航">
          {navItems.map((item) => (
            <a
              key={item}
              href={item === "首页" ? "/" : `#${item}`}
              className={item === "首页" ? "relative font-medium text-[#1554ff] after:absolute after:-bottom-6 after:left-0 after:h-0.5 after:w-full after:bg-[#1554ff]" : "transition hover:text-[#1554ff]"}
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <button className="hidden items-center gap-2 text-sm text-slate-700 transition hover:text-[#1554ff] md:flex" aria-label="语言选择">
            <Globe2 size={17} />
            简体中文
          </button>
          <Link href="/workspace">
            <Button size="sm">开始创作</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
