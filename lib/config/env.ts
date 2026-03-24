// ============================================================
// PHUND.CA — Environment Variable Validation
// Validates all required environment variables at startup
// ============================================================

import { z } from "zod";

const envSchema = z.object({
  // Supabase (required for persistence)
  SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),

  // MT5 Bridge
  MT5_BRIDGE_API_KEY: z.string().min(1).optional(),
  MT5_PAYLOAD_MAX_AGE_SEC: z.string().regex(/^\d+$/).optional().default("90"),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Trade Mode
  TRADE_MODE: z.enum(["disabled", "alert_only", "paper", "live"]).default("paper"),

  // Node environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function getEnvIssues(): string[] {
  const issues: string[] = [];

  // Check Supabase configuration
  const hasSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabaseUrl) {
    issues.push("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL - persistence will be disabled");
  }
  if (!hasSupabaseKey) {
    issues.push("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY - persistence will be disabled");
  }

  // Check Telegram configuration
  const hasTgToken = process.env.TELEGRAM_BOT_TOKEN;
  const hasTgChat = process.env.TELEGRAM_CHAT_ID;
  if (hasTgToken && !hasTgChat) {
    issues.push("TELEGRAM_BOT_TOKEN set but missing TELEGRAM_CHAT_ID - Telegram alerts disabled");
  }
  if (!hasTgToken && hasTgChat) {
    issues.push("TELEGRAM_CHAT_ID set but missing TELEGRAM_BOT_TOKEN - Telegram alerts disabled");
  }

  // Check MT5 API key in production
  if (process.env.NODE_ENV === "production" && !process.env.MT5_BRIDGE_API_KEY) {
    issues.push("MT5_BRIDGE_API_KEY not set in production - API endpoints will accept any request");
  }

  return issues;
}

let _env: Env | null = null;
let _validated = false;

export function validateEnv(): { env: Env; warnings: string[] } {
  const warnings = getEnvIssues();

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );
    console.error("[ENV] Validation failed:");
    errors.forEach((e) => console.error(`  - ${e}`));
    throw new Error(`Environment validation failed: ${errors.join("; ")}`);
  }

  _env = result.data;
  _validated = true;

  // Log warnings but don't fail
  if (warnings.length > 0) {
    console.warn("[ENV] Configuration warnings:");
    warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  }

  return { env: result.data, warnings };
}

export function getEnv(): Env {
  if (!_validated) {
    validateEnv();
  }
  return _env!;
}

// Export individual getters for common use cases
export const env = {
  get supabaseUrl(): string {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  },
  get supabaseKey(): string {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  },
  get mt5ApiKey(): string {
    return process.env.MT5_BRIDGE_API_KEY || "";
  },
  get mt5PayloadMaxAge(): number {
    return parseInt(process.env.MT5_PAYLOAD_MAX_AGE_SEC || "90", 10);
  },
  get telegramBotToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN || "";
  },
  get telegramChatId(): string {
    return process.env.TELEGRAM_CHAT_ID || "";
  },
  get tradeMode(): "disabled" | "alert_only" | "paper" | "live" {
    const mode = process.env.TRADE_MODE;
    if (mode === "disabled" || mode === "alert_only" || mode === "paper" || mode === "live") {
      return mode;
    }
    return "paper";
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  get isDevelopment(): boolean {
    return process.env.NODE_ENV === "development";
  },
  get hasTelegram(): boolean {
    return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  },
  get hasSupabase(): boolean {
    return !!(this.supabaseUrl && this.supabaseKey);
  },
};
