import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETF 成份股篩選器",
  description: "追蹤高股息 ETF 成份股估值與買賣訊號",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
