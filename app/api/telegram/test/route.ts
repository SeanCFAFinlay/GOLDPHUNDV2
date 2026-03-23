import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

export async function POST() {
  const t = process.env.TELEGRAM_BOT_TOKEN || "", c = process.env.TELEGRAM_CHAT_ID || "";
  if (!t || !c) return NextResponse.json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel env vars" });
  const r = await sendTelegram(t, c, "✅ *Phund.ca Telegram Test*\nConnection successful. Alerts will appear here.\n\n_OX Securities | Gold Intelligence_");
  return NextResponse.json(r);
}
