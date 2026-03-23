import { NextResponse } from "next/server";
import { getMarket } from "@/lib/store";
import { runSpectreEngine } from "@/lib/spectre-engine";

export const runtime = "edge";
export const revalidate = 0;

export async function GET() {
  const mkt = await getMarket("XAUUSD") as any;
  if (!mkt) return NextResponse.json({ error: "No market data" }, { status: 404 });
  const result = runSpectreEngine(mkt.bars_10m || [], mkt.bars_1h, mkt.bars_4h);
  return NextResponse.json(result);
}
