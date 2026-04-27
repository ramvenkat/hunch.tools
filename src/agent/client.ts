import type {
  ContentBlockParam,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages/messages";

export type ProviderName = "local" | "anthropic";

export interface AgentMessageCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  tools?: unknown[];
  messages: MessageParam[];
}

export interface AgentMessageResponse {
  content: ContentBlockParam[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | null;
}

export interface AgentProviderClient {
  provider: ProviderName;
  model: string;
  messages: {
    create(params: AgentMessageCreateParams): Promise<AgentMessageResponse>;
  };
}
