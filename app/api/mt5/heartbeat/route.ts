import { NextRequest, NextResponse } from "next/server";
import { saveHeartbeat } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    if (!p.terminal_id) return NextResponse.json({ accepted: false, errors: ["Missing terminal_id"] }, { status: 400 });
    await saveHeartbeat(p.terminal_id, p);
    return NextResponse.json({ accepted: true });
  } catch (e: any) { return NextResponse.json({ accepted: false, errors: [e.message] }, { status: 500 }); }
}
