export type SessionRole = "user" | "assistant" | "tool";

export interface SessionEvent {
  role: SessionRole;
  content: string;
  ts: string;
  contentBlocks?: unknown;
  isError?: boolean;
  toolName?: string;
  toolUseId?: string;
  toolInput?: unknown;
  toolResult?: unknown;
}

export interface SpikeContext {
  problem: string;
  persona: string;
  journey: string;
  decisions: string;
  fileTree: string;
}
