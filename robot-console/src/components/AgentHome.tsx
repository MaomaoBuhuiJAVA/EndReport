"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  FileText,
  FlaskConical,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { SciencePet } from "@/components/SciencePet";
import { GardenSeal } from "@/components/GardenSeal";
import type { SiteData } from "@/lib/site-data";

type AgentHomeProps = {
  data: Pick<SiteData, "profile">;
};

const homeHeroImages = [
  { src: "/gallery/kexiaobei-home/kexiaobei-home-01.webp", alt: "幼儿园科学活动现场" },
  { src: "/gallery/kexiaobei-home/kexiaobei-home-02.webp", alt: "幼儿园科学探索活动" },
  { src: "/gallery/kexiaobei-home/kexiaobei-home-03.webp", alt: "幼儿园科学教育场景" },
  { src: "/gallery/kexiaobei-home/kexiaobei-home-04.webp", alt: "幼儿园科学实验活动" },
  { src: "/gallery/kexiaobei-home/kexiaobei-home-05.webp", alt: "幼儿园科学学习现场" },
  { src: "/gallery/kexiaobei-home/kexiaobei-home-06.webp", alt: "幼儿园科学课堂活动" },
  { src: "/gallery/kexiaobei-home/kexiaobei-home-07.webp", alt: "幼儿园科学探索现场" },
] as const;

const capabilities = [
  {
    icon: BookOpenText,
    title: "生成活动教案",
    description: "围绕科学主题梳理活动目标、准备、过程与延伸建议。",
  },
  {
    icon: FlaskConical,
    title: "匹配实验资源",
    description: "按年龄段查找实验、故事和科学诗，并进入对应详情。",
  },
  {
    icon: FileText,
    title: "检索园所资料",
    description: "快速定位园所基本信息、资质与课程建设材料。",
  },
];

function openFloatingChat() {
  const assistantWindow = window as typeof window & {
    __kexiaobeiOpenRequested?: boolean;
  };
  assistantWindow.__kexiaobeiOpenRequested = true;
  assistantWindow.dispatchEvent(new Event("kexiaobei:open"));
}

export function AgentHome({ data }: AgentHomeProps) {
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const secondaryHeroIndex = (activeHeroIndex + 1) % homeHeroImages.length;
  const secondaryHeroImage = homeHeroImages[secondaryHeroIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveHeroIndex((current) => (current + 1) % homeHeroImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f7f2] text-[#173b42]">
      <header className="sticky top-0 z-30 border-b border-[#dce8e2]/90 bg-[#f7f7f2]/92 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3" href="/" aria-label="科小贝智能体首页">
            <GardenSeal glyph="贝" tone="teal" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-[#173b42]">科小贝智能体</span>
              <span className="block truncate text-xs text-[#6c817c]">幼儿科学教育助手</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#176b5d] px-3.5 text-white transition hover:bg-[#12594d]" href="/lab">
              进入实验室
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-72 bg-[#e6f2ec]" aria-hidden="true" />
          <div className="relative mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-20">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#c5ded5] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#176b5d] shadow-sm">
                <Sparkles aria-hidden="true" size={14} />
                面向幼儿科学教育的智能体
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-[1.15] tracking-normal text-[#173b42] sm:text-5xl md:text-5xl">
                科小贝智能体
                <span className="mt-2 block text-[#176b5d]">让科学活动更好准备</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#55706a] sm:text-lg">
                科小贝围绕幼儿园科学教育场景，协助教师生成活动思路、查找实验资源、匹配年龄段内容，并连接园所资料库。
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-[6px] bg-[#176b5d] px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(23,107,93,0.22)] transition hover:bg-[#12594d]" onClick={openFloatingChat} type="button">
                  <MessageCircle aria-hidden="true" size={18} />
                  开始对话
                </button>
                <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-[6px] border border-[#bbd5cc] bg-white px-5 text-sm font-semibold text-[#176b5d] transition hover:border-[#176b5d] hover:bg-[#eef8f4]" href="/lab">
                  <FlaskConical aria-hidden="true" size={18} />
                  进入科小贝实验室
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#59736d]">
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#176b5d]" />教案与活动支持</span>
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#e2ac32]" />实验资源直达</span>
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#d66e50]" />园所资料检索</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl pb-16 sm:pb-20 lg:mx-0">
              <div className="absolute -right-5 -top-5 size-28 rounded-full border-[18px] border-[#f0ce64]/55" aria-hidden="true" />
              <div className="home-hero__media-stage relative aspect-[5/4]">
                <div className="home-hero__primary-frame">
                {homeHeroImages.map((image, index) => (
                  <Image
                    alt={index === activeHeroIndex ? image.alt : ""}
                    className={`home-hero__primary-image object-cover ${
                      index === activeHeroIndex ? "home-hero__primary-image--active" : "home-hero__primary-image--inactive"
                    }`}
                    fill
                    key={image.src}
                    priority={index === 0}
                    sizes="(min-width: 1024px) 46vw, 92vw"
                    src={image.src}
                  />
                ))}
                </div>
                <div className="home-hero__primary-caption absolute inset-x-0 top-0 bg-gradient-to-b from-[#173b42]/85 via-[#173b42]/25 to-transparent p-5 pb-20 text-white sm:p-6">
                  <p className="text-xs font-semibold text-[#e8d78a]">科小贝正在准备</p>
                  <p className="mt-1 text-lg font-semibold">今天的科学探索</p>
                </div>
                <div className="home-hero__secondary-frame">
                  <div key={secondaryHeroImage.src} className="home-hero__secondary-image">
                    <div className="relative aspect-[4/3] h-full">
                  <Image
                    alt={secondaryHeroImage.alt}
                    className="object-cover"
                    fill
                    sizes="(min-width: 1024px) 18vw, 40vw"
                    src={secondaryHeroImage.src}
                  />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#deebe6] bg-white py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-[#176b5d]">智能体能力</p>
              <h2 className="mt-3 text-3xl font-bold text-[#173b42] sm:text-4xl">从问题到可用的活动支持</h2>
            </div>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, description }, index) => (
                <article className="rounded-[8px] border border-[#dce9e4] bg-[#fbfdfc] p-5" key={title}>
                  <span className={["grid size-11 place-items-center rounded-[6px]", index === 1 ? "bg-[#fff5d7] text-[#a46f00]" : index === 2 ? "bg-[#fff0ea] text-[#b45137]" : "bg-[#e6f4ef] text-[#176b5d]"].join(" ")}>
                    <Icon aria-hidden="true" size={21} />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-[#173b42]">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-[#617872]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-[#dce9e4] bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-sm text-[#66807a] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>{data.profile.shortName} · 科小贝智能体</span>
          <Link className="font-semibold text-[#176b5d] hover:text-[#12594d]" href="/lab">浏览科学资源</Link>
        </div>
      </footer>

      <SciencePet />
    </div>
  );
}
