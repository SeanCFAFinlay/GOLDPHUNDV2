import { NextResponse } from "next/server";
import { popPendingInstructions } from "@/lib/store";
export async function GET() {
  try { return NextResponse.json({ instructions: await popPendingInstructions() }); }
  catch (e: any) { return NextResponse.json({ instructions: [] }, { status: 500 }); }
}
