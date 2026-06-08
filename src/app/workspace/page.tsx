"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AssistantPanel } from "@/components/workspace/AssistantPanel";
import { EditorCanvas } from "@/components/workspace/EditorCanvas";
import { ProjectSidebar } from "@/components/workspace/ProjectSidebar";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import type { ProjectItem, ProjectMode } from "@/types/project";

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T & { error?: string }> {
  try {
    return (await response.json()) as T & { error?: string };
  } catch {
    return { error: fallbackMessage } as T & { error?: string };
  }
}

function WorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeProjectId = searchParams.get("projectId");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [activeMode, setActiveMode] = useState<ProjectMode>("slideshow");
  const [storyboardRefreshKey, setStoryboardRefreshKey] = useState(0);
  const [videoGenerationRequestKey, setVideoGenerationRequestKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedId = selectedProject?.id ?? routeProjectId ?? "";

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/projects?limit=50", { cache: "no-store" });
      const payload = await readJsonResponse<{ items?: ProjectItem[] }>(response, "项目列表响应为空或格式错误，请刷新重试");

      if (!response.ok || !payload.items) {
        throw new Error(payload.error ?? "项目列表加载失败");
      }

      setProjects(payload.items);

      const nextProject = payload.items.find((project) => project.id === routeProjectId) ?? payload.items[0] ?? null;
      setSelectedProject(nextProject);

      if (nextProject) {
        setActiveMode(nextProject.mode);

        if (!routeProjectId || routeProjectId !== nextProject.id) {
          router.replace(`/workspace?projectId=${nextProject.id}`);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "项目列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [routeProjectId, router]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleSelectProject = useCallback(
    (project: ProjectItem) => {
      setSelectedProject(project);
      setActiveMode(project.mode);
      router.push(`/workspace?projectId=${project.id}`);
    },
    [router],
  );

  const handleDurationChange = useCallback(
    (durationMs: number) => {
      if (!selectedProject || durationMs <= 0) {
        return;
      }

      setSelectedProject((current) => (current && current.id === selectedProject.id && current.durationMs !== durationMs ? { ...current, durationMs } : current));
      setProjects((items) => items.map((item) => (item.id === selectedProject.id && item.durationMs !== durationMs ? { ...item, durationMs } : item)));
    },
    [selectedProject],
  );

  const content = useMemo(() => {
    if (loading) {
      return <div className="flex flex-1 items-center justify-center text-slate-600">正在加载项目...</div>;
    }

    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">项目加载失败</h2>
            <p className="mt-3 text-sm text-slate-600">{error}</p>
            <button className="mt-5 rounded-full bg-[#1554ff] px-5 py-2 text-sm font-medium text-white" onClick={loadProjects}>
              重试
            </button>
          </div>
        </div>
      );
    }

    if (!selectedProject) {
      return (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">还没有项目</h2>
            <p className="mt-3 text-sm text-slate-600">返回首页选择一个创作模式，系统会创建数据库项目。</p>
            <Link className="mt-5 inline-flex rounded-full bg-[#1554ff] px-5 py-2 text-sm font-medium text-white" href="/#modes">
              去创建
            </Link>
          </div>
        </div>
      );
    }

    return (
      <EditorCanvas
        activeMode={activeMode}
        projectId={selectedProject.id}
        storyboardRefreshKey={storyboardRefreshKey}
        videoGenerationRequestKey={videoGenerationRequestKey}
        onProjectsChange={loadProjects}
        onDurationChange={handleDurationChange}
      />
    );
  }, [activeMode, error, handleDurationChange, loadProjects, loading, selectedProject, storyboardRefreshKey, videoGenerationRequestKey]);

  return (
    <div className="flex h-screen min-w-[1080px] flex-col overflow-hidden bg-[#f7f9ff] text-[14px]">
      <WorkspaceHeader />
      <div className="flex min-h-0 flex-1">
        <ProjectSidebar
          projects={projects}
          selectedId={selectedId}
          loading={loading}
          onRefresh={loadProjects}
          onSelect={handleSelectProject}
        />
        {content}
        <AssistantPanel
          projectId={selectedProject?.id ?? ""}
          onStartVideoGeneration={() => setVideoGenerationRequestKey((key) => key + 1)}
          onStoryboardChange={() => {
            setStoryboardRefreshKey((key) => key + 1);
            void loadProjects();
          }}
        />
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceContent />
    </Suspense>
  );
}
