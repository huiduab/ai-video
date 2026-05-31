"use client";

import { Bell, ChevronDown, Globe2 } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/common/Logo";

const navItems = ["工作台", "模板中心", "素材库", "解决方案", "帮助中心"];

export function WorkspaceHeader() {
  return (
    <header className="h-16 border-b border-slate-200 bg-[#f7f9ff]">
      <div className="flex h-full items-center justify-between px-6">
        <Link href="/" aria-label="返回首页">
          <Logo />
        </Link>
        <nav className="hidden h-full items-center gap-8 text-base font-medium text-slate-800 xl:flex" aria-label="工作台导航">
          {navItems.map((item) => (
            <a
              href={item === "工作台" ? "/workspace" : `#${item}`}
              key={item}
              className={item === "工作台" ? "flex h-full items-center border-b-2 border-[#1554ff] text-[#1554ff]" : "flex h-full items-center transition hover:text-[#1554ff]"}
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <button className="hidden items-center gap-2 text-slate-800 md:flex" aria-label="语言选择">
            <Globe2 size={19} />
            简体中文
            <ChevronDown size={16} />
          </button>
          <button aria-label="通知" className="text-slate-800 transition hover:text-[#1554ff]">
            <Bell size={21} />
          </button>
          <div className="flex size-10 items-center justify-center rounded-full bg-[#dce8ff] font-semibold text-[#1554ff]">MW</div>
        </div>
      </div>
    </header>
  );
}
