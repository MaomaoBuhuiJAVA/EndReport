import type { ReactNode } from "react";

const filingQueryUrl = "https://beian.miit.gov.cn/";

export function SiteFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="site-footer border-t border-[#dce9e4] bg-white py-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 text-xs leading-6 text-[#66807a] sm:px-6 lg:px-8">
        {children ? <div>{children}</div> : null}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <span>qyfck.icu，已备案，</span>
          <a
            className="font-semibold text-[#176b5d] underline-offset-2 hover:text-[#12594d] hover:underline"
            href={filingQueryUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            浙ICP备2025213299号-1
          </a>
          <span>，阿里云备案域名</span>
        </div>
      </div>
    </footer>
  );
}
