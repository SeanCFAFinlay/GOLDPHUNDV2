// ============================================================
// GET /api/health — Health Check Endpoint
// Returns system status for monitoring and load balancers
// ============================================================

import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";

export const dynamic = "force-dynamic";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    supabase: { status: "ok" | "unavailable"; message?: string };
    telegram: { status: "ok" | "unavailable"; message?: string };
    mt5Bridge: { status: "ok" | "unavailable"; message?: string };
  };
  config: {
    tradeMode: string;
    environment: string;
  };
}

const startTime = Date.now();

export async function GET() {
  const health: HealthCheck = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    uptime: Math.round((Date.now() - startTime) / 1000),
    checks: {
      supabase: { status: "unavailable" },
      telegram: { status: "unavailable" },
      mt5Bridge: { status: "unavailable" },
    },
    config: {
      tradeMode: env.tradeMode,
      environment: process.env.NODE_ENV || "development",
    },
  };

  // Check Supabase
  if (env.hasSupabase) {
    try {
      const response = await fetch(`${env.supabaseUrl}/rest/v1/`, {
        method: "HEAD",
        headers: {
          apikey: env.supabaseKey,
        },
      });
      health.checks.supabase = response.ok
        ? { status: "ok" }
        : { status: "unavailable", message: `HTTP ${response.status}` };
    } catch (e: unknown) {
      health.checks.supabase = {
        status: "unavailable",
        message: e instanceof Error ? e.message : "Connection failed",
      };
    }
  } else {
    health.checks.supabase = { status: "unavailable", message: "Not configured" };
  }

  // Check Telegram configuration
  if (env.hasTelegram) {
    health.checks.telegram = { status: "ok" };
  } else {
    health.checks.telegram = { status: "unavailable", message: "Not configured" };
  }

  // Check MT5 Bridge configuration
  if (env.mt5ApiKey) {
    health.checks.mt5Bridge = { status: "ok" };
  } else {
    health.checks.mt5Bridge = { status: "unavailable", message: "No API key configured" };
  }

  // Determine overall status
  const criticalChecks = [health.checks.supabase];
  const hasCriticalFailure = criticalChecks.some((c) => c.status === "unavailable");
  const optionalChecks = [health.checks.telegram, health.checks.mt5Bridge];
  const hasOptionalFailure = optionalChecks.some((c) => c.status === "unavailable");

  if (hasCriticalFailure) {
    health.status = "unhealthy";
  } else if (hasOptionalFailure) {
    health.status = "degraded";
  }

  const statusCode = health.status === "unhealthy" ? 503 : 200;

  return NextResponse.json(health, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
