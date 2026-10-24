import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

export function SiteFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="site-footer border-t border-[#dce9e4] bg-white py-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 text-xs leading-6 text-[#66807a] sm:px-6 lg:px-8">
        <a className="inline-flex w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4" href="/" aria-label="科小贝首页"><BrandLogo variant="wordmark" size={50} /></a>
        {children ? <div>{children}</div> : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>龙湾区国科温州第二幼儿园 · 科小贝资源库</span>
          <span>guokeey.cn</span>
          <a className="font-medium underline-offset-4 hover:underline" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2026086562号-1</a>
        </div>
      </div>
    </footer>
  );
}
