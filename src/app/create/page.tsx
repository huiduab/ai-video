"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/common/Button";
import type { ProjectMode } from "@/types/project";

type CreateStatus = "creating" | "failed";

function CreateProjectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") as ProjectMode | null;
  const [status, setStatus] = useState<CreateStatus>("creating");
  const [error, setError] = useState("");

  const createProject = useCallback(
    async (signal?: AbortSignal) => {
      if (mode !== "slideshow" && mode !== "html-animation") {
        setStatus("failed");
        setError("创作模式无效，请返回首页重新选择。");
        return;
      }

      setStatus("creating");
      setError("");

      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            title: mode === "html-animation" ? "未命名 HTML 动画项目" : "未命名图片轮播项目",
          }),
          signal,
        });

        const payload = (await response.json()) as { project?: { id: string }; error?: string };

        if (!response.ok || !payload.project?.id) {
          throw new Error(payload.error ?? "项目创建失败");
        }

        router.replace(`/workspace?projectId=${payload.project.id}`);
      } catch (createError) {
        if ((createError as Error).name === "AbortError") {
          return;
        }

        setStatus("failed");
        setError(createError instanceof Error ? createError.message : "项目创建失败");
      }
    },
    [mode, router],
  );

  useEffect(() => {
    const controller = new AbortController();
    void createProject(controller.signal);
    return () => controller.abort();
  }, [createProject]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9ff] px-6 text-slate-950">
      <section className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {status === "creating" ? (
          <>
            <div className="flex items-center gap-3 text-[#1554ff]">
              <LoaderCircle className="animate-spin" size={24} />
              <span className="text-sm font-semibold">正在创建项目</span>
            </div>
            <h1 className="mt-6 text-3xl font-semibold">初始化数据库记录</h1>
            <p className="mt-4 leading-7 text-slate-600">
              正在创建项目、默认分镜、时间线轨道和初始化任务。完成后会自动进入工作台。
            </p>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-[#1554ff]" />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold">创建失败</h1>
            <p className="mt-4 leading-7 text-slate-600">{error}</p>
            <div className="mt-7 flex gap-3">
              <Button onClick={() => createProject()}>
                <RefreshCcw size={17} />
                重试
              </Button>
              <Link href="/">
                <Button variant="secondary">返回首页</Button>
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function CreateProjectPage() {
  return (
    <Suspense fallback={null}>
      <CreateProjectContent />
    </Suspense>
  );
}

