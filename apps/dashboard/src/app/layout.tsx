import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conclave 작업공간",
  description: "아이디어를 제품으로 만드는 과정을 한 화면에서",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
