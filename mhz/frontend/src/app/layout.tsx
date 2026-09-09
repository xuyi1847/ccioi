import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "MHz — 发现你的下一首喜欢", description: "A personal radio that learns what you love next." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
