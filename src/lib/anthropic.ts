import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: serverEnv.llmApiKey });
  }
  return client;
}

export const LLM_MODEL = serverEnv.llmModel;
