import { NextRequest, NextResponse } from "next/server";
import { addPendingInstruction } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    if (!p.action) return NextResponse.json({ ok: false, error: "Missing action" }, { status: 400 });
    const id = `PHD-M-${Date.now().toString(36).toUpperCase()}`;
    await addPendingInstruction({
      order_id: id,
      action: p.action,
      symbol: p.symbol || "XAUUSD",
      direction: p.direction,
      volume: p.volume,
      sl: p.sl,
      tp: p.tp,
      ticket: p.ticket,
      comment: "PHUND-MANUAL",
      magic_number: 88888,
    });
    return NextResponse.json({ ok: true, order_id: id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
