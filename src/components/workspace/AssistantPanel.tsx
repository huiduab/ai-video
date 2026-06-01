"use client";

import {
  AlertTriangle,
  FileText,
  Image,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AgentDisplay, AgentMessageItem, VideoScriptResult, VideoScriptScene } from "@/types/agent";

const MIN_WIDTH = 280;
const MAX_WIDTH = 520;

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return sameDay ? `今天 ${time}` : date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface AssistantPanelProps {
  projectId: string;
}

type LocalAgentMessage = AgentMessageItem & {
  pending?: boolean;
};

export function AssistantPanel({ projectId }: AssistantPanelProps) {
  const [messages, setMessages] = useState<LocalAgentMessage[]>([]);
  const [scriptEditor, setScriptEditor] = useState<{ messageId: string; script: VideoScriptResult } | null>(null);
  const [input, setInput] = useState("");
  const [width, setWidth] = useState(320);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    if (!projectId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/messages`, { cache: "no-store" });
      const payload = (await response.json()) as { items?: AgentMessageItem[]; error?: string };

      if (!response.ok || !payload.items) {
        throw new Error(payload.error ?? "助手消息加载失败");
      }

      setMessages(payload.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "助手消息加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!resizeStart.current) return;
      const delta = resizeStart.current.x - event.clientX;
      const nextWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStart.current.width + delta));
      setWidth(nextWidth);
    }

    function handleMouseUp() {
      resizeStart.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  function startResize(event: React.MouseEvent<HTMLButtonElement>) {
    resizeStart.current = { x: event.clientX, width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function sendMessage() {
    const value = input.trim();
    if (!value || sending || !projectId) return;

    setSending(true);
    setError("");
    setInput("");

    const now = new Date().toISOString();
    const userMessageId = `local-user-${Date.now()}`;
    const assistantMessageId = `local-assistant-${Date.now()}`;
    const optimisticUserMessage: LocalAgentMessage = {
      id: userMessageId,
      role: "user",
      content: value,
      intentType: null,
      intentJson: null,
      display: null,
      createdAt: now,
    };
    const pendingAssistantMessage: LocalAgentMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      intentType: null,
      intentJson: null,
      display: null,
      createdAt: now,
      pending: true,
    };

    setMessages((current) => [...current, optimisticUserMessage, pendingAssistantMessage]);

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      const payload = (await response.json()) as {
        userMessage?: AgentMessageItem;
        assistantMessage?: AgentMessageItem;
        display?: AgentDisplay;
        error?: string;
      };

      if (!response.ok || !payload.userMessage || !payload.assistantMessage) {
        throw new Error(payload.error ?? "消息发送失败");
      }

      const assistantMessage = payload.display
        ? { ...(payload.assistantMessage as AgentMessageItem), display: payload.display }
        : (payload.assistantMessage as AgentMessageItem);

      setMessages((current) =>
        current.map((message) => {
          if (message.id === userMessageId) {
            return payload.userMessage as AgentMessageItem;
          }

          if (message.id === assistantMessageId) {
            return assistantMessage;
          }

          return message;
        }),
      );
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "消息发送失败";
      setError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: "消息发送失败，请稍后重试。",
                display: {
                  type: "error",
                  title: "发送失败",
                  message,
                },
                pending: false,
              }
            : item,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <aside
      className="relative flex min-h-0 shrink-0 flex-col border-l border-slate-200 bg-[#f7f9ff]"
      style={{ width }}
    >
      <button
        type="button"
        aria-label="拖动调整 AI 助手宽度"
        title="拖动调整 AI 助手宽度"
        onMouseDown={startResize}
        className="absolute -left-1 top-0 z-20 h-full w-2 !cursor-col-resize bg-transparent transition hover:bg-[#1554ff]/20"
      />

      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-[#1554ff]">
          <Sparkles size={22} />
          AI 助手
        </div>
        <button
          type="button"
          aria-label="刷新助手"
          onClick={loadMessages}
          disabled={loading || !projectId}
          className="text-slate-700 transition hover:text-[#1554ff] disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <RefreshCw size={19} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!projectId && <EmptyState title="请选择项目" description="选择或创建项目后即可开始与 AI 助手交流。" />}

        {projectId && loading && messages.length === 0 && <EmptyState title="正在加载助手消息" description="正在读取当前项目的历史对话。" />}

        {projectId && !loading && messages.length === 0 && (
          <EmptyState title="开始创作" description="描述你想要的视频、分镜调整或大纲需求，AI 会先分析你的创作意图。" />
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onOpenScript={(script) => setScriptEditor({ messageId: message.id, script })} />
        ))}

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-5">
        <div className="rounded-xl border border-slate-200 bg-[#edf3ff] p-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="告诉 AI 你的想法，或输入 / 选择指令"
            className="h-16 w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
            maxLength={1000}
            disabled={!projectId || sending}
          />
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-slate-600">{input.length}/1000</span>
            <button type="button" aria-label="AI 指令" className="text-slate-700 hover:text-[#1554ff]">
              <Sparkles size={20} />
            </button>
            <button type="button" aria-label="添加图片" className="text-slate-700 hover:text-[#1554ff]">
              <Image size={20} />
            </button>
            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || !projectId || sending}
              className="ml-auto flex h-9 items-center gap-2 rounded-xl bg-[#3868ff] px-4 text-sm font-medium text-white hover:bg-[#1554ff] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {sending ? "分析中" : "发送"}
              <Send size={18} />
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">AI 生成内容仅供参考，请注意核查信息的准确性。</p>
      </div>

      {scriptEditor && (
        <ScriptEditorModal
          projectId={projectId}
          messageId={scriptEditor.messageId}
          script={scriptEditor.script}
          onClose={() => setScriptEditor(null)}
          onSaved={(updated) => {
            setMessages((current) => current.map((message) => (message.id === updated.id ? updated : message)));
            setScriptEditor(null);
          }}
        />
      )}
    </aside>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-[#edf3ff] text-[#1554ff]">
        <Sparkles size={18} />
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function MessageBubble({ message, onOpenScript }: { message: LocalAgentMessage; onOpenScript: (script: VideoScriptResult) => void }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("mb-4 flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[280px] rounded-xl p-4 text-sm leading-6 shadow-sm",
          isUser ? "bg-[#edf3ff] text-slate-900" : "bg-white text-slate-800",
        )}
      >
        {message.pending ? <LoadingBubble /> : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        {message.display && <DisplayCard display={message.display} onOpenScript={onOpenScript} />}
        <p className="mt-3 text-xs text-slate-500">{formatMessageTime(message.createdAt)}</p>
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex items-center gap-3 text-slate-600">
      <span>AI 正在分析</span>
      <span className="flex items-center gap-1" aria-label="AI 正在分析">
        <span className="size-1.5 animate-bounce rounded-full bg-[#3868ff]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[#3868ff] [animation-delay:120ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[#3868ff] [animation-delay:240ms]" />
      </span>
    </div>
  );
}

function DisplayCard({ display, onOpenScript }: { display: AgentDisplay; onOpenScript: (script: VideoScriptResult) => void }) {
  if (display.type === "outline") {
    const previewScenes = display.script?.scenes.slice(0, 3);

    return (
      <div className="mt-3 rounded-lg border border-[#d8e4ff] bg-[#f5f8ff] p-3">
        <DisplayTitle icon={<ListChecks size={16} />} title={display.title} />
        {display.script ? (
          <div className="mt-2 space-y-2 text-slate-700">
            <p className="font-medium">{display.script.title}</p>
            <p className="line-clamp-3 text-xs leading-5 text-slate-600">{display.script.summary}</p>
            <p className="line-clamp-3 text-xs leading-5 text-slate-600">逐字稿：{display.script.transcript}</p>
            <ol className="space-y-1">
              {previewScenes?.map((scene) => (
                <li key={scene.index}>
                  {scene.index}. {scene.title}
                </li>
              ))}
            </ol>
            {display.script.scenes.length > 3 && <p className="text-xs text-slate-500">还有 {display.script.scenes.length - 3} 个分镜未显示</p>}
            <button
              type="button"
              onClick={() => onOpenScript(display.script as VideoScriptResult)}
              className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-[#c9d9ff] bg-white text-xs font-medium text-[#1554ff] transition hover:bg-[#edf3ff]"
            >
              <FileText size={15} />
              查看全部并编辑
            </button>
          </div>
        ) : display.items.length > 0 ? (
          <ol className="mt-2 space-y-1 text-slate-700">
            {display.items.map((item, index) => (
              <li key={`${item}-${index}`}>
                {index + 1}. {item}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-slate-600">AI 已识别为大纲任务，等待后续生成逻辑接入。</p>
        )}
      </div>
    );
  }

  if (display.type === "scene-add") {
    return (
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <DisplayTitle icon={<Plus size={16} />} title={display.title} />
        <p className="mt-2 text-slate-700">插入位置：第 {display.sceneIndex ?? "待确认"} 个分镜之后</p>
        {display.description && <p className="mt-1 text-slate-700">描述：{display.description}</p>}
      </div>
    );
  }

  if (display.type === "scene-delete") {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <DisplayTitle icon={<Trash2 size={16} />} title={display.title} />
        <p className="mt-2 text-slate-700">目标分镜：第 {display.sceneIndex ?? "待确认"} 个</p>
      </div>
    );
  }

  if (display.type === "scene-regenerate") {
    return (
      <div className="mt-3 rounded-lg border border-[#d8e4ff] bg-[#f5f8ff] p-3">
        <DisplayTitle icon={<WandSparkles size={16} />} title={display.title} />
        <p className="mt-2 text-slate-700">目标分镜：第 {display.sceneIndex ?? "待确认"} 个</p>
        {display.description && <p className="mt-1 text-slate-700">新方向：{display.description}</p>}
      </div>
    );
  }

  return (
    <div className={cn("mt-3 rounded-lg border p-3", display.type === "error" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50")}>
      <DisplayTitle icon={<AlertTriangle size={16} />} title={display.title} />
      <p className="mt-2 text-slate-700">{display.message}</p>
    </div>
  );
}

function DisplayTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 font-medium text-slate-900">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function cloneScript(script: VideoScriptResult): VideoScriptResult {
  return {
    ...script,
    scenes: script.scenes.map((scene) => ({ ...scene })),
  };
}

function ScriptEditorModal({
  projectId,
  messageId,
  script,
  onClose,
  onSaved,
}: {
  projectId: string;
  messageId: string;
  script: VideoScriptResult;
  onClose: () => void;
  onSaved: (message: AgentMessageItem) => void;
}) {
  const [draft, setDraft] = useState(() => cloneScript(script));
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(script.scenes[0]?.index ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateScene(index: number, patch: Partial<VideoScriptScene>) {
    setDraft((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.index === index ? { ...scene, ...patch } : scene)),
    }));
  }

  async function saveScript() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}/agent/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, script: draft }),
      });
      const payload = (await response.json()) as { message?: AgentMessageItem; display?: AgentDisplay; error?: string };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "保存失败");
      }

      onSaved(payload.display ? { ...payload.message, display: payload.display } : payload.message);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div className="flex max-h-[88vh] w-[min(960px,calc(100vw-48px))] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">视频脚本与分镜</h2>
            <p className="mt-1 text-sm text-slate-500">可编辑逐字稿、旁白和画面提示词；后续会接入分镜渲染与单张图片生成。</p>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              标题
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1554ff]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              模式
              <input value={draft.mode === "html-animation" ? "HTML 动画" : "图片轮播"} readOnly className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500" />
            </label>
          </div>

          <label className="mt-3 block text-sm font-medium text-slate-700">
            摘要
            <textarea
              value={draft.summary}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
              className="mt-1 h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#1554ff]"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-slate-700">
            完整逐字稿
            <textarea
              value={draft.transcript}
              onChange={(event) => setDraft((current) => ({ ...current, transcript: event.target.value }))}
              className="mt-1 h-32 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#1554ff]"
            />
          </label>

          <ScriptSceneTimeline
            mode={draft.mode}
            scenes={draft.scenes}
            selectedSceneIndex={selectedSceneIndex}
            onSelect={setSelectedSceneIndex}
            onUpdate={updateScene}
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
          {error ? <p className="text-sm text-rose-600">{error}</p> : <p className="text-sm text-slate-500">共 {draft.scenes.length} 个分镜</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              取消
            </button>
            <button
              type="button"
              onClick={saveScript}
              disabled={saving}
              className="flex h-10 items-center gap-2 rounded-lg bg-[#3868ff] px-4 text-sm font-semibold text-white hover:bg-[#1554ff] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Save size={16} />
              {saving ? "保存中" : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSceneDuration(durationMs?: number) {
  const seconds = Math.max(1, Math.round((durationMs ?? 5000) / 1000));
  return `00:${String(seconds).padStart(2, "0")}`;
}

function ScriptSceneTimeline({
  mode,
  scenes,
  selectedSceneIndex,
  onSelect,
  onUpdate,
}: {
  mode: VideoScriptResult["mode"];
  scenes: VideoScriptScene[];
  selectedSceneIndex: number;
  onSelect: (index: number) => void;
  onUpdate: (index: number, patch: Partial<VideoScriptScene>) => void;
}) {
  const selectedScene = scenes.find((scene) => scene.index === selectedSceneIndex) ?? scenes[0];

  if (!selectedScene) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        暂无分镜。
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">分镜时间线</h3>
          <p className="mt-1 text-xs text-slate-500">点击方块切换分镜，时间线连接展示完整脚本顺序。</p>
        </div>
        <div className="shrink-0 rounded-lg bg-[#edf3ff] px-3 py-1.5 text-xs font-medium text-[#1554ff]">
          共 {scenes.length} 个分镜
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
        {scenes.map((scene) => {
          const selected = scene.index === selectedScene.index;

          return (
            <button
              key={scene.index}
              type="button"
              onClick={() => onSelect(scene.index)}
              className={cn(
                "relative min-w-[132px] flex-1 rounded-xl border bg-[#f8faff] p-2 text-left transition",
                selected ? "border-[#1554ff] shadow-[0_0_0_2px_rgba(21,84,255,0.2)]" : "border-slate-200 hover:border-[#97b5ff]",
              )}
            >
              <h4 className="truncate text-xs font-medium text-slate-950">
                {scene.index} {scene.title}
              </h4>
              <div className="media-frame relative mt-1.5 h-14 overflow-hidden rounded-lg">
                {mode === "html-animation" && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[#1554ff]">
                    HTML
                  </span>
                )}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[11px] text-white">
                  {formatSceneDuration(scene.durationMs)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-1">
        <div className="relative h-5">
          <div className="absolute left-0 right-0 top-2 h-1 rounded-full bg-slate-200" />
          {scenes.map((scene, index) => (
            <button
              key={scene.index}
              type="button"
              aria-label={`选择分镜 ${scene.index}`}
              onClick={() => onSelect(scene.index)}
              className={cn(
                "absolute top-1 size-3 rounded-full transition",
                scene.index === selectedScene.index ? "bg-[#1554ff]" : "bg-slate-300 hover:bg-[#97b5ff]",
              )}
              style={{ left: scenes.length === 1 ? "0%" : `${(index / (scenes.length - 1)) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between font-mono text-[11px] text-slate-600">
          <span>00:00</span>
          <span>{formatSceneDuration(scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 5000), 0))}</span>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-[#fbfcff] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-950">编辑分镜 {selectedScene.index}</h3>
          <div className="flex items-center gap-2">
            <button type="button" disabled className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-400">
              <Image size={14} />
              生成图片
            </button>
            <button type="button" disabled className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-400">
              <WandSparkles size={14} />
              渲染分镜
            </button>
          </div>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          标题
          <input
            value={selectedScene.title}
            onChange={(event) => onUpdate(selectedScene.index, { title: event.target.value })}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1554ff]"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          旁白
          <textarea
            value={selectedScene.narration}
            onChange={(event) => onUpdate(selectedScene.index, { narration: event.target.value })}
            className="mt-1 h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#1554ff]"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          {mode === "html-animation" ? "动画提示词" : "画面提示词"}
          <textarea
            value={mode === "html-animation" ? selectedScene.animationPrompt || selectedScene.visualPrompt : selectedScene.visualPrompt}
            onChange={(event) =>
              onUpdate(
                selectedScene.index,
                mode === "html-animation" ? { animationPrompt: event.target.value, visualPrompt: event.target.value } : { visualPrompt: event.target.value },
              )
            }
            className="mt-1 h-28 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#1554ff]"
          />
        </label>
      </div>
    </div>
  );
}
