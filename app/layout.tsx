import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GOLDPHUNDV2 — Gold Dashboard V2",
  description: "Advanced XAUUSD market intelligence platform with Gold Logic AI 30-indicator stack, multi-timeframe analysis, and real-time MT5 bridge integration",
  keywords: ["gold", "xauusd", "trading", "mt5", "dashboard", "technical analysis", "gold logic ai"],
  authors: [{ name: "GOLDPHUNDV2" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#080c14" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#080c14" }}>{children}</body>
    </html>
  );
}
