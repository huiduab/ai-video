"use client";

import Link from "next/link";
import { Image, Plus, RefreshCcw, Search, Trash2, Video } from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/cn";
import { formatDuration, formatRelativeTime } from "@/lib/project-mappers";
import type { ProjectItem } from "@/types/project";

interface ProjectSidebarProps {
  projects: ProjectItem[];
  selectedId: string;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (project: ProjectItem) => void;
}

export function ProjectSidebar({ projects, selectedId, loading, onRefresh, onSelect }: ProjectSidebarProps) {
  return (
    <aside className="flex min-h-0 w-[260px] shrink-0 flex-col border-r border-slate-200 bg-[#f7f9ff]">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-950">我的项目</h1>
          <Link href="/#modes">
            <Button variant="secondary" size="sm">
              <Plus size={18} />
              新建
            </Button>
          </Link>
        </div>
        <div className="mt-4 flex h-10 items-center rounded-xl border border-slate-200 bg-[#eef4ff] px-3">
          <select aria-label="项目排序" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none">
            <option>最近编辑</option>
            <option>创建时间</option>
          </select>
          <div className="mx-3 h-6 w-px bg-slate-300" />
          <Search size={18} className="text-slate-700" />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">正在加载项目...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600">
            暂无项目。点击新建选择创作模式。
          </div>
        ) : (
          projects.map((project) => {
            const active = selectedId === project.id;
            return (
              <button
                key={project.id}
                onClick={() => onSelect(project)}
                className={cn(
                  "flex w-full gap-3 rounded-xl border p-2.5 text-left transition",
                  active ? "border-[#97b5ff] bg-[#e8f0ff] shadow-sm" : "border-transparent hover:bg-white",
                )}
              >
                <div className="media-frame relative h-16 w-24 shrink-0 overflow-hidden rounded-lg">
                  <span className="absolute bottom-2 right-2 rounded bg-black/65 px-2 py-0.5 font-mono text-xs text-white">
                    {formatDuration(project.durationMs)}
                  </span>
                </div>
                <div className="min-w-0 pt-1">
                  <h2 className="truncate text-base font-medium text-slate-950">{project.title}</h2>
                  <p className="mt-1.5 flex items-center gap-2 text-xs text-[#1554ff]">
                    {project.mode === "slideshow" ? <Image size={15} /> : <Video size={15} />}
                    {project.mode === "slideshow" ? "图片轮播" : "HTML 动画"}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-600">{formatRelativeTime(project.updatedAt)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 p-4">
        <button className="flex items-center gap-3 text-slate-700 transition hover:text-[#1554ff]">
          <Trash2 size={20} />
          回收站
        </button>
        <button aria-label="刷新项目" className="text-slate-700 transition hover:text-[#1554ff]" onClick={onRefresh}>
          <RefreshCcw size={18} />
        </button>
      </div>
    </aside>
  );
}

