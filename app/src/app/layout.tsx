import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIVERZ Work",
  description: "다이버즈 내부 협업 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
