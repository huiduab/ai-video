import { randomUUID } from "node:crypto";
import { logAiConversation } from "@/lib/agent/ai-conversation-log";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function callIntentModel(messages: ChatMessage[]) {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "gemini-3-flash-preview";

  if (!baseUrl || !apiKey) {
    throw new Error("Missing AI_BASE_URL or AI_API_KEY");
  }

  return callOpenAiCompatibleChat({
    stage: "intent",
    baseUrl,
    apiKey,
    model,
    messages,
    temperature: 0.2,
    responseFormatJson: true,
    timeoutMs: toPositiveInt(process.env.AI_INTENT_REQUEST_TIMEOUT_MS, toPositiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 30000)),
  });
}

export async function callDirectorModel(messages: ChatMessage[]) {
  const baseUrl = process.env.DIRECTOR_API_BASE_URL || process.env.AI_DIRECTOR_BASE_URL || process.env.AI_BASE_URL;
  const apiKey = process.env.DIRECTOR_API_KEY || process.env.AI_DIRECTOR_API_KEY || process.env.AI_API_KEY;
  const model = process.env.DIRECTOR_MODEL || process.env.AI_DIRECTOR_MODEL || "deepseek-v4-pro";

  if (!baseUrl || !apiKey) {
    throw new Error("Missing DIRECTOR_API_BASE_URL or DIRECTOR_API_KEY");
  }

  return callOpenAiCompatibleChat({
    stage: "director",
    baseUrl,
    apiKey,
    model,
    messages,
    temperature: 0.15,
    responseFormatJson: true,
    timeoutMs: toPositiveInt(process.env.DIRECTOR_REQUEST_TIMEOUT_MS, toPositiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 90000)),
  });
}

export async function callHtmlLayoutModel(messages: ChatMessage[]) {
  const baseUrl = process.env.HTML_LAYOUT_API_BASE_URL || process.env.DIRECTOR_API_BASE_URL || process.env.AI_DIRECTOR_BASE_URL || process.env.AI_BASE_URL;
  const apiKey = process.env.HTML_LAYOUT_API_KEY || process.env.DIRECTOR_API_KEY || process.env.AI_DIRECTOR_API_KEY || process.env.AI_API_KEY;
  const model = process.env.HTML_LAYOUT_MODEL || process.env.DIRECTOR_MODEL || process.env.AI_DIRECTOR_MODEL || "deepseek-v4-pro";

  if (!baseUrl || !apiKey) {
    throw new Error("Missing HTML_LAYOUT_API_BASE_URL or HTML_LAYOUT_API_KEY");
  }

  return callOpenAiCompatibleChat({
    stage: "html-layout",
    baseUrl,
    apiKey,
    model,
    messages,
    temperature: 0.2,
    responseFormatJson: true,
    timeoutMs: toPositiveInt(process.env.HTML_LAYOUT_REQUEST_TIMEOUT_MS, toPositiveInt(process.env.DIRECTOR_REQUEST_TIMEOUT_MS, toPositiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 90000))),
  });
}

export function getHtmlLayoutModelName() {
  return process.env.HTML_LAYOUT_MODEL || process.env.DIRECTOR_MODEL || process.env.AI_DIRECTOR_MODEL || "deepseek-v4-pro";
}

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function callOpenAiCompatibleChat({
  stage,
  baseUrl,
  apiKey,
  model,
  messages,
  temperature,
  responseFormatJson,
  timeoutMs,
}: {
  stage: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  responseFormatJson: boolean;
  timeoutMs: number;
}) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const requestBody = {
    model,
    messages,
    temperature,
    ...(responseFormatJson ? { response_format: { type: "json_object" } } : {}),
  };

  await logAiConversation({
    requestId,
    stage,
    event: "request",
    model,
    baseUrl: baseUrl.replace(/\/$/, ""),
    payload: requestBody,
  });
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";

    await logAiConversation({
      requestId,
      stage,
      event: "error",
      model,
      baseUrl: baseUrl.replace(/\/$/, ""),
      payload: {
        durationMs: Date.now() - startedAt,
        timeoutMs,
        message: isAbort ? `AI request timed out after ${timeoutMs}ms` : error instanceof Error ? error.message : String(error),
      },
    });

    throw new Error(isAbort ? `AI request timed out after ${timeoutMs}ms` : `AI request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    await logAiConversation({
      requestId,
      stage,
      event: "error",
      model,
      baseUrl: baseUrl.replace(/\/$/, ""),
      payload: {
        durationMs: Date.now() - startedAt,
        status: response.status,
        body: errorText,
      },
    });
    throw new Error(`AI request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;

  await logAiConversation({
    requestId,
    stage,
    event: "response",
    model,
    baseUrl: baseUrl.replace(/\/$/, ""),
    payload: {
      durationMs: Date.now() - startedAt,
      content,
    },
  });

  return content;
}
