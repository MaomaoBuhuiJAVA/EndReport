import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://guokeey.cn"),
  title: "龙湾区国科温州第二幼儿园",
  description: "龙湾区国科温州第二幼儿园官方网站，展示园所概览、成长照片、功能室、园所资料与科小贝实验室。",
  openGraph: { type: "website", locale: "zh_CN", siteName: "科小贝资源库", title: "龙湾区国科温州第二幼儿园 · 科小贝资源库", description: "探索园所科学教育资源，与科小贝一起发现、实践和成长。" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full scroll-smooth antialiased"
    >
      <body className="min-h-full flex flex-col">
        <div className="flex min-h-screen flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
