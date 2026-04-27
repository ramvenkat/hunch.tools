import Anthropic from "@anthropic-ai/sdk";

import { HunchError } from "../utils/errors.js";
import type { AgentProviderClient } from "./client.js";

export interface AnthropicClientOptions {
  apiKey?: string;
  model: string;
}

export function createAnthropicClient(
  options: AnthropicClientOptions,
): AgentProviderClient {
  if (!options.apiKey) {
    throw new HunchError(
      "Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure api_key_env.",
    );
  }

  const client = new Anthropic({ apiKey: options.apiKey });
  return {
    provider: "anthropic",
    model: options.model,
    messages: {
      create: async (params) => {
        const response = await client.messages.create({
          model: params.model,
          max_tokens: params.max_tokens,
          system: params.system,
          tools: params.tools as never,
          messages: params.messages,
        });

        return {
          content: response.content,
          stop_reason: response.stop_reason,
        };
      },
    },
  };
}
