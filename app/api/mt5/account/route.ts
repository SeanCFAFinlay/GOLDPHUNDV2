import { NextRequest, NextResponse } from "next/server";
import { saveAccount } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    if (!p.account_id) return NextResponse.json({ accepted: false, errors: ["Missing account_id"] }, { status: 400 });
    await saveAccount(p.account_id, p);
    return NextResponse.json({ accepted: true });
  } catch (e: any) { return NextResponse.json({ accepted: false, errors: [e.message] }, { status: 500 }); }
}
