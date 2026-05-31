"use client";

import { Image, RefreshCw, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const initialMessages: Message[] = [
  {
    id: "u1",
    role: "user",
    content: "想要制作一个关于未来星际探索的宣传视频，时长 30 秒，风格科幻，史诗感。",
  },
];

const MIN_WIDTH = 280;
const MAX_WIDTH = 520;

export function AssistantPanel() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [width, setWidth] = useState(320);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

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

  function sendMessage() {
    const value = input.trim();
    if (!value) return;
    setMessages((current) => [...current, { id: `m-${Date.now()}`, role: "user", content: value }]);
    setInput("");
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
        <button aria-label="刷新助手" className="text-slate-700 transition hover:text-[#1554ff]">
          <RefreshCw size={19} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.map((message) => (
          <div key={message.id} className={cn("mb-4 flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[260px] rounded-xl p-4 text-sm leading-6 shadow-sm", message.role === "user" ? "bg-[#edf3ff] text-slate-900" : "bg-white text-slate-800")}>
              <p>{message.content}</p>
              <p className="mt-3 text-xs text-slate-500">今天 14:20</p>
            </div>
          </div>
        ))}

        <div className="mb-4 flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#3868ff] text-white">
            <Sparkles size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <strong>AI 助手</strong>
              <span className="text-sm text-slate-500">14:28</span>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-700">
                <span className="size-2 rounded-full bg-[#1554ff]" />
                已生成视频大纲
              </div>
              <ol className="space-y-2 text-sm leading-6 text-slate-700">
                <li>1. 开场：星球全景，宇宙深邃</li>
                <li>2. 航行：飞船穿越云层，前往未知星系</li>
                <li>3. 降落：未来都市，科技感建筑群</li>
                <li>4. 探索：探索高科技通道遗迹</li>
                <li>5. 结尾：希望之光，展望未来</li>
              </ol>
              <button className="mt-4 h-9 w-full rounded-lg border border-[#c9d9ff] bg-[#edf3ff] text-sm text-[#1554ff] transition hover:bg-[#dbe8ff]">
                查看大纲详情
              </button>
            </div>
          </div>
        </div>

        <div className="ml-11 border-l border-slate-200 pl-5">
          <Activity status="active" title="生成分镜图像 (5/5)" time="14:29" />
          <div className="mb-3 rounded-xl bg-[#edf3ff] p-2">
            <div className="flex gap-2">
              {["planet-frame", "portal-frame", "media-frame", "city-frame", "planet-frame"].map((item, index) => (
                <div key={`${item}-${index}`} className={cn("h-7 w-9 rounded", item)} />
              ))}
            </div>
          </div>
          <Activity status="active" title="合成视频中... 进度: 80%" time="14:30" progress />
          <Activity status="done" title="视频已生成完成！" time="14:30" />
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-slate-800 p-2.5 text-white">
            <div className="planet-frame h-12 w-20 rounded-md" />
            <div className="min-w-0">
              <p className="truncate font-medium">星际探险：新纪元</p>
              <p className="mt-1 text-xs text-slate-300">图片轮播 · 00:30</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 p-5">
        <div className="rounded-xl border border-slate-200 bg-[#edf3ff] p-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="告诉 AI 你的想法，或输入 / 选择指令"
            className="h-16 w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-500"
            maxLength={1000}
          />
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-slate-600">{input.length}/1000</span>
            <button aria-label="AI 指令" className="text-slate-700 hover:text-[#1554ff]">
              <Sparkles size={20} />
            </button>
            <button aria-label="添加图片" className="text-slate-700 hover:text-[#1554ff]">
              <Image size={20} />
            </button>
            <button onClick={sendMessage} className="ml-auto flex h-9 items-center gap-2 rounded-xl bg-[#3868ff] px-4 text-sm font-medium text-white hover:bg-[#1554ff]">
              发送
              <Send size={18} />
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">AI 生成内容仅供参考，请注意核查信息的准确性。</p>
      </div>
    </aside>
  );
}

function Activity({ title, time, status, progress = false }: { title: string; time: string; status: "active" | "done"; progress?: boolean }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className={cn("font-medium", status === "done" ? "text-emerald-700" : "text-slate-800")}>{title}</span>
        <span className="text-slate-500">{time}</span>
      </div>
      {progress && (
        <div className="mt-2 h-1.5 rounded-full bg-slate-200">
          <div className="h-full w-4/5 rounded-full bg-[#3868ff]" />
        </div>
      )}
    </div>
  );
}
