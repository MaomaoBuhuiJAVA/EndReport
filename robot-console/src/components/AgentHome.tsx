"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  BotMessageSquare,
  FileText,
  FlaskConical,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { SciencePet } from "@/components/SciencePet";
import { GardenSeal } from "@/components/GardenSeal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cleanDocumentText, cleanDocumentTitle } from "@/lib/document-text";
import type { SiteData } from "@/lib/site-data";

type AgentHomeProps = {
  data: Pick<SiteData, "profile" | "campusPhotos" | "rooms" | "documents">;
};

type HomeDocument = AgentHomeProps["data"]["documents"][number];

const categoryNames: Record<string, string> = {
  BASIC_INFO: "基本情况",
  QUALIFICATION: "资质信息",
  HONOR: "荣誉获奖",
  COURSE: "课程资料",
  STAFF: "教职工",
  SPEECH: "发言材料",
  POLICY: "政策文件",
  ARCHIVE: "园所档案",
};

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
  const [activeDocument, setActiveDocument] = useState<HomeDocument | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [documentLoading, setDocumentLoading] = useState(false);

  const heroImage =
    data.rooms.find((room) => room.assets[0])?.assets[0]?.url ??
    data.campusPhotos[0]?.url ??
    "/gallery/campus-01.webp";
  const documents = data.documents.slice(0, 3);

  async function openDocument(document: HomeDocument) {
    setActiveDocument(document);
    setDocumentText(cleanDocumentText(document.summary));
    setDocumentLoading(true);

    try {
      const response = await fetch(`/api/documents/${document.id}`);
      const payload = (await response.json()) as {
        document?: { content?: string };
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "document unavailable");
      setDocumentText(cleanDocumentText(payload.document?.content?.trim() || document.summary));
    } catch {
      setDocumentText(`${cleanDocumentText(document.summary)}\n\n资料正文暂时无法读取，请稍后重试。`);
    } finally {
      setDocumentLoading(false);
    }
  }

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
            <Link className="hidden rounded-[6px] px-3 py-2 text-[#46635e] transition hover:bg-[#e8f2ed] hover:text-[#176b5d] sm:inline-flex" href="#school-documents">
              园所资料
            </Link>
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

            <div className="relative mx-auto w-full max-w-xl lg:mx-0">
              <div className="absolute -right-5 -top-5 size-28 rounded-full border-[18px] border-[#f0ce64]/55" aria-hidden="true" />
              <div className="relative aspect-[5/4] overflow-hidden rounded-[8px] border border-white/80 bg-[#d8e8e1] shadow-[0_24px_62px_rgba(27,67,61,0.18)]">
                <Image alt="科小贝服务的幼儿园科学活动环境" className="object-cover" fill priority sizes="(min-width: 1024px) 46vw, 92vw" src={heroImage} />
                <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-[#173b42]/85 via-[#173b42]/25 to-transparent p-5 pb-20 text-white sm:p-6">
                  <p className="text-xs font-semibold text-[#e8d78a]">科小贝正在准备</p>
                  <p className="mt-1 text-lg font-semibold">今天的科学探索</p>
                </div>
              </div>
              <div className="relative -mt-10 ml-5 w-[min(286px,calc(100%_-_20px))] rounded-[8px] border border-white/80 bg-white p-4 shadow-[0_18px_38px_rgba(27,67,61,0.18)] sm:ml-8 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-[#e8f4ef] text-[#176b5d]"><BotMessageSquare size={19} /></span>
                  <div>
                    <p className="text-sm font-bold text-[#173b42]">可以这样问科小贝</p>
                    <p className="mt-0.5 text-xs text-[#6a817b]">“生成《玩转纸片》完整教案”</p>
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

        <section className="bg-[#f7f7f2] py-14 sm:py-16" id="school-documents">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#176b5d]">园所资料</p>
                <h2 className="mt-3 text-3xl font-bold text-[#173b42]">需要时，再打开资料库</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#607872]">首页仅保留常用资料入口，让科小贝始终成为访问的第一焦点。</p>
              </div>
              <Link className="inline-flex items-center gap-2 self-start rounded-[6px] border border-[#c8ddd5] bg-white px-4 py-2.5 text-sm font-semibold text-[#176b5d] transition hover:border-[#176b5d] hover:bg-[#eef8f4] sm:self-auto" href="/auth">
                管理员入口
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>

            {documents.length ? (
              <div className="mt-8 grid gap-3 md:grid-cols-3">
                {documents.map((document) => (
                  <button className="group flex min-h-32 flex-col items-start rounded-[8px] border border-[#dce9e4] bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-[#96c5b8] hover:shadow-[0_12px_26px_rgba(31,83,73,0.1)]" key={document.id} onClick={() => void openDocument(document)} type="button">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#176b5d]"><FileText aria-hidden="true" size={15} />{categoryNames[document.category] ?? "园所资料"}</span>
                    <span className="mt-3 line-clamp-2 text-base font-bold leading-6 text-[#173b42]">{cleanDocumentTitle(document.title)}</span>
                    <span className="mt-auto pt-3 text-xs font-semibold text-[#618078] transition group-hover:text-[#176b5d]">查看资料</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-[8px] border border-dashed border-[#bfd7ce] bg-white px-5 py-8 text-sm leading-7 text-[#607872]">园所资料正在同步，完成后可在此查看常用档案。</div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dce9e4] bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-sm text-[#66807a] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>{data.profile.shortName} · 科小贝智能体</span>
          <Link className="font-semibold text-[#176b5d] hover:text-[#12594d]" href="/lab">浏览科学资源</Link>
        </div>
      </footer>

      <Dialog open={Boolean(activeDocument)} onOpenChange={(open) => !open && setActiveDocument(null)}>
        <DialogContent className="max-h-[82vh] max-w-2xl overflow-y-auto rounded-[8px] border-[#dce9e4] bg-white p-0">
          <DialogHeader className="border-b border-[#e5efeb] px-6 py-5">
            <DialogDescription className="text-[#176b5d]">{activeDocument ? categoryNames[activeDocument.category] ?? "园所资料" : "园所资料"}</DialogDescription>
            <DialogTitle className="pr-8 text-xl leading-8 text-[#173b42]">{activeDocument ? cleanDocumentTitle(activeDocument.title) : ""}</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap px-6 py-5 text-sm leading-8 text-[#49635d]">
            {documentLoading ? "正在读取资料..." : documentText}
          </div>
        </DialogContent>
      </Dialog>

      <SciencePet />
    </div>
  );
}
