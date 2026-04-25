import Anthropic from "@anthropic-ai/sdk";

import { HunchError } from "../utils/errors.js";

export interface AnthropicClientOptions {
  apiKey?: string;
  model: string;
}

export function createAnthropicClient(
  options: AnthropicClientOptions,
): Anthropic {
  if (!options.apiKey) {
    throw new HunchError(
      "Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure api_key_env.",
    );
  }

  return new Anthropic({ apiKey: options.apiKey });
}
