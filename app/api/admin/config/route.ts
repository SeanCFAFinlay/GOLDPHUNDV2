import { NextRequest, NextResponse } from "next/server";
import { setState, getState } from "@/lib/store";

export async function GET() {
  const cfg = await getState("admin_config");
  return NextResponse.json(cfg || { trade_mode: process.env.TRADE_MODE || "paper" });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const key = req.headers.get("X-Admin-Key") || "";
  const expected = process.env.MT5_BRIDGE_API_KEY || ""; // Reuse bridge key for admin
  if (expected && key !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await setState("admin_config", body);
  return NextResponse.json({ ok: true });
}
