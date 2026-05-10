function required(name: string, value: string | undefined): string {
  if (!value || value.startsWith("<")) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
};

export const serverEnv = {
  llmApiKey:
    process.env.ANTHROPIC_API_KEY ?? process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL || "claude-haiku-4-5-20251001",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};
