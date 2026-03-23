import { NextRequest, NextResponse } from "next/server";
import { saveTrade } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    await saveTrade({ ...p, received_at: new Date().toISOString() });
    console.log(`[EXEC] order=${p.order_id} status=${p.status} ticket=${p.ticket}`);
    return NextResponse.json({ accepted: true });
  } catch (e: any) { return NextResponse.json({ accepted: false, errors: [e.message] }, { status: 500 }); }
}
