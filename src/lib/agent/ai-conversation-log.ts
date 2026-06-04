import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type AiConversationLogEvent = "request" | "response" | "error";

interface LogAiConversationParams {
  stage: string;
  event: AiConversationLogEvent;
  model?: string;
  baseUrl?: string;
  payload: unknown;
  requestId?: string;
}

const defaultLogPath = "logs/ai-conversations.log";
const defaultMaxChars = 20000;

function isLogEnabled() {
  return process.env.AI_CONVERSATION_LOG_ENABLED !== "false";
}

function isConsoleLogEnabled() {
  return process.env.AI_CONVERSATION_LOG_TO_CONSOLE !== "false";
}

function getLogPath() {
  const configured = process.env.AI_CONVERSATION_LOG_PATH?.trim() || defaultLogPath;
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function getMaxChars() {
  const parsed = Number.parseInt(process.env.AI_CONVERSATION_LOG_MAX_CHARS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMaxChars;
}

function truncateString(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

function sanitizeForLog(value: unknown, maxChars: number): unknown {
  if (typeof value === "string") {
    return truncateString(value, maxChars);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, maxChars));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/api[_-]?key|authorization|token|secret|password/i.test(key)) {
        return [key, "[redacted]"];
      }

      return [key, sanitizeForLog(item, maxChars)];
    }),
  );
}

export async function logAiConversation({ stage, event, model, baseUrl, payload, requestId }: LogAiConversationParams) {
  if (!isLogEnabled()) {
    return;
  }

  const logPath = getLogPath();
  const maxChars = getMaxChars();
  const record = {
    timestamp: new Date().toISOString(),
    requestId,
    stage,
    event,
    model,
    baseUrl,
    payload: sanitizeForLog(payload, maxChars),
  };
  const line = JSON.stringify(record);

  if (isConsoleLogEnabled()) {
    console.log(`[ai:${stage}:${event}] ${line}`);
  }

  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${line}\n`, "utf8");
  } catch (error) {
    console.warn("Failed to write AI conversation log", error);
  }
}
