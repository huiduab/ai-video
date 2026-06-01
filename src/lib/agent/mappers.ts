import type { AgentMessage } from "@prisma/client";
import { buildAgentDisplay } from "@/lib/agent/display";
import { validateAgentIntent } from "@/lib/agent/intent-validator";
import type { AgentDisplay, AgentIntentResult, AgentMessageItem } from "@/types/agent";

function toApiRole(role: AgentMessage["role"]): AgentMessageItem["role"] {
  return role.toLowerCase() as AgentMessageItem["role"];
}

function parseStoredIntent(value: unknown): AgentIntentResult | null {
  if (!value) {
    return null;
  }

  try {
    return validateAgentIntent(value);
  } catch {
    return null;
  }
}

export function mapAgentMessage(message: AgentMessage): AgentMessageItem {
  const intent = parseStoredIntent(message.intentJson);
  const display: AgentDisplay | null = intent
    ? buildAgentDisplay(intent)
    : message.errorJson
      ? {
          type: "error",
          title: "AI 分析失败",
          message: message.content,
        }
      : null;

  return {
    id: message.id,
    role: toApiRole(message.role),
    content: message.content,
    intentType: intent?.type ?? null,
    intentJson: intent,
    display,
    createdAt: message.createdAt.toISOString(),
  };
}
