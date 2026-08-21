"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BookOpenText,
  Clapperboard,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import { SciencePet } from "@/components/SciencePet";
import { GardenSeal } from "@/components/GardenSeal";
import { MobileAppNav, type MobileAppNavItem } from "@/components/MobileAppNav";
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
    title: "匹配科学资源库",
    description: "按年龄段查找实验、故事和科学诗，并进入对应详情。",
  },
];

const homeCategoryItems: MobileAppNavItem[] = [
  { key: "科学诗", label: "科学诗", href: "#lab", icon: BookOpen },
  { key: "科学故事", label: "科学故事", href: "#lab", icon: Clapperboard },
  { key: "科学实验", label: "科学实验", href: "#lab", icon: FlaskConical },
];

const HOME_MOBILE_MODULE_FADE_DELAY_MS = 150;
const HOME_MOBILE_MODULE_ROUTE_DELAY_MS = 380;
const HOME_MOBILE_MODULE_LAYOUT_DURATION_S = 0.28;

export function AgentHome({ data }: AgentHomeProps) {
  const router = useRouter();
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [homeFade, setHomeFade] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);
  const routeTimerRef = useRef<number | null>(null);
  const secondaryHeroIndex = (activeHeroIndex + 1) % homeHeroImages.length;
  const secondaryHeroImage = homeHeroImages[secondaryHeroIndex];

  function navigateToCategory(category: string) {
    if (pendingCategory) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobileViewport = window.matchMedia("(max-width: 720px)").matches;
    if (reducedMotion || !isMobileViewport) {
      router.push(`/lab?type=${encodeURIComponent(category)}`);
      return;
    }

    setPendingCategory(category);

    fadeTimerRef.current = window.setTimeout(() => {
      setHomeFade(true);
    }, HOME_MOBILE_MODULE_FADE_DELAY_MS);
    routeTimerRef.current = window.setTimeout(() => {
      router.push(`/lab?type=${encodeURIComponent(category)}`);
    }, HOME_MOBILE_MODULE_ROUTE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      if (routeTimerRef.current !== null) window.clearTimeout(routeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveHeroIndex((current) => (current + 1) % homeHeroImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <LayoutGroup id="home-module-transition">
      <div className={`home-page min-h-screen bg-[#f7f7f2] text-[#173b42]${pendingCategory ? " home-page--navigating" : ""}${homeFade ? " home-page--fading" : ""}`}>
      <header className="home-site-header sticky top-0 z-30 border-b border-[#dce8e2]/90 bg-[#f7f7f2]/92 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3" href="/" aria-label="科小贝智能体首页">
            <GardenSeal glyph="贝" tone="teal" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-[#173b42]">科小贝智能体</span>
              <span className="block truncate text-xs text-[#6c817c]">幼儿科学教育助手</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link className="hidden h-10 items-center rounded-[6px] border border-[#c8ddd5] px-3.5 text-[#176b5d] transition hover:bg-[#e6f2ec] sm:inline-flex" href="/works">
              科学作品
            </Link>
            <Link className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#176b5d] px-3.5 text-white transition hover:bg-[#12594d]" href="/lab">
              进入资源库
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-72 bg-[#e6f2ec]" aria-hidden="true" />
          <div className="home-hero__ambient-gallery" aria-hidden="true">
            {homeHeroImages.map((image, index) => (
              <div className={`home-hero__ambient-fragment home-hero__ambient-fragment--${index + 1}`} key={`ambient-${image.src}`}>
                <Image
                  alt=""
                  className="home-hero__ambient-image object-cover"
                  fill
                  loading="lazy"
                  sizes="(min-width: 1280px) 240px, 18vw"
                  src={image.src}
                />
              </div>
            ))}
          </div>
          <div className="home-hero__inner relative mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-20">
            <div className="home-hero__copy max-w-2xl">
              <p className="home-hero__eyebrow inline-flex items-center gap-2 rounded-full border border-[#c5ded5] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#176b5d] shadow-sm">
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

              <div className="home-category-actions mt-8 grid gap-2 sm:grid-cols-3">
                {pendingCategory
                  ? null
                  : homeCategoryItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <motion.button
                          aria-label={`进入${item.label}模块`}
                          className="home-category-actions__item"
                          key={item.key}
                          layoutId={`home-module-${item.key}`}
                          onClick={() => navigateToCategory(item.key)}
                          transition={{ layout: { duration: HOME_MOBILE_MODULE_LAYOUT_DURATION_S, ease: [0.22, 1, 0.36, 1] } }}
                          type="button"
                        >
                          {Icon ? <Icon aria-hidden="true" size={18} /> : null}
                          <span>{item.label}</span>
                          <ArrowRight aria-hidden="true" size={15} />
                        </motion.button>
                      );
                    })}
              </div>

              <div className="home-hero__support-points mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#59736d]">
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#176b5d]" />教案与活动支持</span>
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#e2ac32]" />实验资源直达</span>
                <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#d66e50]" />园所资料检索</span>
              </div>
            </div>

            <div className="home-hero__media relative mx-auto w-full max-w-xl pb-16 sm:pb-20 lg:mx-0">
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
            <div className="mt-9 grid gap-4 md:grid-cols-2">
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

      <div className="home-page__bottom-anchor" aria-hidden="true" />

      {pendingCategory ? (
        <MobileAppNav
          items={homeCategoryItems}
          activeKey={pendingCategory}
          layoutIdPrefix="home-module"
          layoutDuration={HOME_MOBILE_MODULE_LAYOUT_DURATION_S}
          onSelect={(item) => navigateToCategory(item.key)}
        />
      ) : null}

      <footer className="border-t border-[#dce9e4] bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-sm text-[#66807a] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>{data.profile.shortName} · 科小贝智能体</span>
          <Link className="font-semibold text-[#176b5d] hover:text-[#12594d]" href="/lab">浏览科学资源</Link>
        </div>
      </footer>

      <SciencePet />
      </div>
    </LayoutGroup>
  );
}
