import type { AgentIntentResult, AgentIntentType } from "@/types/agent";

const allowedTypes: AgentIntentType[] = [
  "GENERATE_OUTLINE",
  "REGENERATE_OUTLINE",
  "ADD_SCENE",
  "DELETE_SCENE",
  "REGENERATE_SCENE",
  "OTHER_REJECTED",
];

export function parseAgentJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  return JSON.parse(cleaned);
}

export function validateAgentIntent(value: unknown): AgentIntentResult {
  if (!value || typeof value !== "object") {
    throw new Error("Intent result must be an object");
  }

  const item = value as Partial<AgentIntentResult>;

  if (!item.type || !allowedTypes.includes(item.type)) {
    throw new Error("Invalid intent type");
  }

  if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) {
    throw new Error("Invalid confidence");
  }

  if (typeof item.reason !== "string") {
    throw new Error("Invalid reason");
  }

  if (typeof item.assistantReply !== "string") {
    throw new Error("Invalid assistantReply");
  }

  if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
    throw new Error("Invalid payload");
  }

  return item as AgentIntentResult;
}
