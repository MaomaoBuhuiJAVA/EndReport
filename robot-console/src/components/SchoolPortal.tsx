"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronRight,
  Eye,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  SquareTerminal,
  Trophy,
  X,
} from "lucide-react";
import { GooeyNav, type GooeyNavItem } from "@/components/GooeyNav";
import { SciencePet } from "@/components/SciencePet";
import { SpecularButton } from "@/components/SpecularButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type SessionUser = { id: string; email: string; name: string; role: "USER" | "ADMIN" };

type SiteData = {
  profile: {
    name: string;
    shortName: string;
    slogan: string;
    summary: string;
    address?: string | null;
    credentials?: unknown;
    highlights?: unknown;
  };
  campusPhotos: Array<{ id: string; title: string; description?: string | null; url: string; width?: number | null; height?: number | null }>;
  rooms: Array<{
    id: string;
    name: string;
    slug: string;
    summary: string;
    description: string;
    features?: unknown;
    assets: Array<{ id: string; title: string; url: string; description?: string | null }>;
  }>;
  documents: Array<{ id: string; title: string; category: string; summary: string }>;
  devices: Array<{ id: string; code?: string; name: string; classroom?: string; status?: string; mode?: string; battery?: number; temperature?: number; streamUrl?: string | null; description: string }>;
  logs: Array<{ id: string; level: string; message: string; createdAt: string }>;
};

type Props = { data: SiteData; initialUser: SessionUser | null };

const navItems: GooeyNavItem[] = [
  { key: "overview", label: "园所概览", href: "#overview" },
  { key: "growth", label: "成长照片", href: "#growth" },
  { key: "rooms", label: "功能室", href: "#rooms" },
  { key: "docs", label: "园所资料", href: "#docs" },
  { key: "yunbao", label: "云宝", href: "#yunbao" },
  { key: "lab", label: "科小贝实验室", href: "/lab" },
];

const statusCopy: Record<string, string> = { ONLINE: "在线", IDLE: "待命", OFFLINE: "离线", WARNING: "预警" };
const categoryCopy: Record<string, string> = {
  BASIC_INFO: "基本情况",
  QUALIFICATION: "资质信息",
  HONOR: "荣誉获奖",
  COURSE: "课程资料",
  STAFF: "教职工",
  SPEECH: "发言材料",
  POLICY: "政策文件",
  ARCHIVE: "园所档案",
};

const overviewFacts = [
  { label: "园所名称", value: "龙湾区国科温州第二幼儿园" },
  { label: "办园主张", value: "筑可探之境，润向美童心" },
  { label: "课程方向", value: "体验式学习、科学探究、空间课程、家园共育" },
  { label: "资料建设", value: "基本情况、资质荣誉、课程社团、教师发展资料已整理入库" },
];

const awardHighlights = [
  "2022学年：张君如、王利珍、邵路亚、陈佳丽等教师在论文、教育叙事、价值观微设计、项目公开课与专题讲座中获得省市区级荣誉。",
  "2024学年第一学期：托班环境创设评比、教育科学研究课题、书香班级评比等项目形成区级一等奖、二等奖、三等奖与书香班级成果。",
  "2024学年第二学期：托班养育照护工作评比与园级赛课持续推进，林佳佳、陈彤彤、方琦、孙依婷、林漪、张雪、陈萌芽等教师获奖。",
  "2025学年第一学期：翁梦瑶获龙湾区优秀教师，林漪获幼儿教育教学优质课评比区级一等奖，心理辅导个案、活力操舞等项目同步获奖。",
];

const textFeatures = [
  { title: "园所资质", text: "资料库收录省二相关材料、基本情况与园所档案，可用于园所概览和资质展示。" },
  { title: "课程建设", text: "围绕幼儿体验式学习、功能室课程、社团活动和科学启蒙，形成可检索的课程资料。" },
  { title: "教师发展", text: "教职工名单、教师荣誉、课题论文、公开课和教育叙事资料已整理为展示内容。" },
];

export function SchoolPortal({ data, initialUser }: Props) {
  const [user, setUser] = useState(initialUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("overview");
  const [activeRoom, setActiveRoom] = useState(data.rooms[0]);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<SiteData["documents"][number] | null>(null);
  const [docContent, setDocContent] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [showDocForm, setShowDocForm] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", category: "ARCHIVE", summary: "", content: "" });
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");

  const isAdmin = user?.role === "ADMIN";
  const heroPhoto = data.rooms[2]?.assets[0]?.url ?? data.rooms[0]?.assets[0]?.url ?? data.campusPhotos[3]?.url ?? "";
  const portraitHero = data.campusPhotos[0]?.url ?? heroPhoto;
  const visiblePhotos = data.campusPhotos;
  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const docs = data.documents.slice(0, 30);
    if (!q) return docs;
    return docs.filter((doc) => [doc.title, doc.category, categoryCopy[doc.category], doc.summary].filter(Boolean).some((item) => item.toLowerCase().includes(q)));
  }, [data.documents, query]);

  useEffect(() => {
    const sections = navItems
      .filter((item) => item.href.startsWith("#"))
      .map((item) => document.getElementById(item.key))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible?.target.id) setActiveNav(visible.target.id);
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveNav(id);
    setMenuOpen(false);
  }

  function pushToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    pushToast("已退出登录");
  }

  async function sendWasd(key: string) {
    if (!isAdmin || !data.devices[0]) return;
    const response = await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: data.devices[0].id, type: `wasd_${key}`, label: `WASD ${key}` }),
    });
    pushToast(response.ok ? `已发送 ${key.toUpperCase()} 指令` : "指令发送失败，请确认管理员权限");
  }

  async function openDocument(doc: SiteData["documents"][number]) {
    setActiveDoc(doc);
    setDocContent(doc.summary);
    setDocLoading(true);

    try {
      const response = await fetch(`/api/documents/${doc.id}`);
      const payload = (await response.json()) as { document?: { content?: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "load failed");
      setDocContent(payload.document?.content?.trim() || doc.summary);
    } catch {
      setDocContent(`${doc.summary}\n\n资料正文暂时无法读取，请稍后重试。`);
    } finally {
      setDocLoading(false);
    }
  }

  async function submitDocument() {
    if (!isAdmin) return;

    const response = await fetch("/api/admin/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(docForm),
    });

    if (!response.ok) {
      pushToast("资料保存失败，请检查标题和正文");
      return;
    }

    setDocForm({ title: "", category: "ARCHIVE", summary: "", content: "" });
    setShowDocForm(false);
    pushToast("资料已写入数据库，刷新后可查看");
  }

  return (
    <div className="min-h-screen bg-[#f8f5ed] text-[#21312e]">
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3">
        <div className="mx-auto flex max-w-7xl items-center gap-3 rounded-[8px] border border-white/72 bg-white/78 px-3 py-3 shadow-[0_14px_42px_rgba(38,58,54,0.10)] backdrop-blur-2xl">
          <Link className="flex min-w-0 items-center gap-3 rounded-[8px] px-2 py-1 transition hover:bg-[#f3efe4]" href="/auth">
            <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[#1f6f62] text-white">
              <Sparkles size={19} />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-semibold">{data.profile.shortName}</span>
              <span className="block text-xs text-[#64736f]">{user ? `${user.name} · ${user.role === "ADMIN" ? "管理员" : "普通用户"}` : "登录 / 注册"}</span>
            </span>
          </Link>

          <div className="relative hidden flex-1 md:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7b8984]" size={17} />
            <Input className="h-10 rounded-[8px] border-[#e2ddd0] bg-white/76 pl-10 text-sm shadow-none focus-visible:ring-[#1f6f62]/20" placeholder="搜索园所资料、功能室、科学实验" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>

          <div className="hidden lg:block">
            <GooeyNav
              items={navItems}
              activeKey={activeNav}
              onSelect={(item) => {
                if (item.href.startsWith("#")) scrollTo(item.key);
              }}
            />
          </div>

          {user ? (
            <Button className="rounded-[8px]" onClick={() => void logout()} size="icon" title="退出登录" type="button" variant="ghost">
              <LogOut size={17} />
            </Button>
          ) : null}
          <Button className="rounded-[8px] lg:hidden" onClick={() => setMenuOpen((value) => !value)} size="icon" type="button" variant="ghost">
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </Button>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed left-3 right-3 top-20 z-40 grid gap-1 rounded-[8px] border border-white/70 bg-white/94 p-2 shadow-xl backdrop-blur-2xl lg:hidden">
          {navItems.map((item) =>
            item.href.startsWith("#") ? (
              <Button
                className="justify-start rounded-[8px]"
                key={item.key}
                onClick={() => scrollTo(item.key)}
                type="button"
                variant="ghost"
              >
                {item.label}
              </Button>
            ) : (
              <Button asChild className="justify-start rounded-[8px]" key={item.key} variant="ghost">
                <Link href={item.href} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </Link>
              </Button>
            ),
          )}
        </div>
      ) : null}

      <main>
        <section className="relative overflow-hidden pt-24" id="overview">
          <div className="mx-auto grid min-h-[calc(100vh-32px)] max-w-7xl gap-8 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[0.94fr_1.06fr] lg:items-center lg:px-8">
            <div className="relative z-10 max-w-2xl">
              <Badge className="rounded-[8px] bg-[#e9f2ed] px-3 py-1 text-[#1f6f62]" variant="secondary">
                龙湾区国科温州第二幼儿园
              </Badge>
              <h1 className="mt-7 text-5xl font-semibold leading-tight tracking-normal text-[#1e2e2b] sm:text-7xl">{data.profile.slogan}</h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-[#5f6f6a]">{data.profile.summary}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <SpecularButton
                  icon={<ChevronRight size={16} />}
                  onClick={() => scrollTo("growth")}
                  tone="teal"
                  type="button"
                >
                  查看成长照片
                </SpecularButton>
                <SpecularButton
                  onClick={() => scrollTo("rooms")}
                  tone="gold"
                  type="button"
                >
                  走进功能室
                </SpecularButton>
              </div>
            </div>

            <div className="relative min-h-[560px]">
              <div className="absolute right-0 top-0 h-[78%] w-[82%] overflow-hidden rounded-[8px] shadow-[0_24px_80px_rgba(36,50,45,0.18)]">
                {heroPhoto ? <Image alt="幼儿园功能室环境" className="object-cover" fill priority src={heroPhoto} sizes="(min-width:1024px) 50vw, 100vw" /> : null}
              </div>
              <div className="absolute bottom-0 left-0 h-[48%] w-[48%] overflow-hidden rounded-[8px] border-[10px] border-[#f8f5ed] bg-white shadow-[0_20px_60px_rgba(36,50,45,0.16)]">
                {portraitHero ? <Image alt="幼儿成长活动照片" className="object-cover" fill src={portraitHero} sizes="30vw" /> : null}
              </div>
              <div className="absolute bottom-12 right-8 max-w-[270px] rounded-[8px] bg-white/86 p-4 shadow-xl backdrop-blur-xl">
                <p className="text-sm font-semibold text-[#1f6f62]">在真实活动中成长</p>
                <p className="mt-2 text-sm leading-6 text-[#5f6f6a]">以空间为课程，以体验为路径，让儿童在探究、表达与合作中被看见。</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-16" id="growth">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle kicker="成长影像" title="每一次探索，都值得被好好收藏" subtitle="照片来自园所成长相册，点击即可放大查看。" />
            <GrowthPhotoShowcase photos={visiblePhotos} onOpen={(url) => setActivePhoto(url)} />
          </div>
        </section>

        <section className="bg-[#f8f5ed] py-16" id="rooms">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle kicker="空间课程" title="功能室照片展示" subtitle="用照片呈现不同功能室的环境、材料与儿童活动可能。" />
            <RoomGallery activeRoom={activeRoom} rooms={data.rooms} onOpenPhoto={setActivePhoto} onSelectRoom={setActiveRoom} />
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle kicker="园所信息" title="以文字沉淀园所建设脉络" subtitle="资料内容以正式栏目呈现，减少装饰，让信息更清楚。" />
            <div className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr]">
              <div className="rounded-[8px] border border-[#e7e1d5] bg-[#fcfaf5] p-6">
                <h3 className="text-2xl font-semibold text-[#1e2e2b]">园所概览</h3>
                <p className="mt-4 text-sm leading-8 text-[#5f6f6a]">{data.profile.summary}</p>
                <Separator className="my-6 bg-[#e3dccf]" />
                <div className="grid gap-4">
                  {overviewFacts.map((item) => (
                    <div className="grid gap-1 border-l-2 border-[#d8b45f] pl-4" key={item.label}>
                      <p className="text-xs font-semibold tracking-[0.18em] text-[#8c7540]">{item.label}</p>
                      <p className="text-sm leading-7 text-[#33423e]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                {textFeatures.map((item) => (
                  <Card className="rounded-[8px] border-[#e7e1d5] bg-white shadow-none" key={item.title}>
                    <CardContent className="flex gap-4 p-5">
                      <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-[8px] bg-[#e9f2ed] text-[#1f6f62]">
                        <CheckCircle2 size={18} />
                      </span>
                      <div>
                        <h3 className="font-semibold text-[#243632]">{item.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-[#64736f]">{item.text}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f8f5ed] py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle kicker="教师发展" title="教师获奖情况" subtitle="根据获奖汇总表与教师荣誉资料整理。" />
            <div className="grid gap-4 md:grid-cols-2">
              {awardHighlights.map((item, index) => (
                <article className="rounded-[8px] border border-[#e5dccb] bg-white p-5 shadow-sm" key={item}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-[8px] bg-[#f5ead1] text-[#8c6a22]">
                      <Trophy size={18} />
                    </span>
                    <p className="text-sm font-semibold text-[#8c6a22]">荣誉记录 0{index + 1}</p>
                  </div>
                  <p className="text-sm leading-8 text-[#4f625d]">{item}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16" id="docs">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle kicker="资料库" title="园所资料" subtitle="点击资料可查看数据库正文，管理员可新增资料。" />
            {isAdmin ? (
              <div className="mb-6 rounded-[8px] border border-[#e4ddd1] bg-[#fcfaf5] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">资料库维护</h3>
                    <p className="mt-1 text-sm text-[#64736f]">新增资料会直接写入数据库，并同步生成检索分块。</p>
                  </div>
                  <Button className="rounded-[8px] bg-[#1f6f62] text-white hover:bg-[#18594f]" onClick={() => setShowDocForm((value) => !value)} type="button">
                    {showDocForm ? "收起" : "新增资料"}
                  </Button>
                </div>
                {showDocForm ? (
                  <div className="mt-4 grid gap-3">
                    <Input className="h-11 rounded-[8px] bg-white" placeholder="资料标题" value={docForm.title} onChange={(event) => setDocForm((value) => ({ ...value, title: event.target.value }))} />
                    <Select value={docForm.category} onValueChange={(category) => setDocForm((value) => ({ ...value, category }))}>
                      <SelectTrigger className="h-11 w-full rounded-[8px] bg-white">
                        <SelectValue placeholder="资料类别" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryCopy).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea className="min-h-20 rounded-[8px] bg-white" placeholder="摘要，可留空自动截取正文" value={docForm.summary} onChange={(event) => setDocForm((value) => ({ ...value, summary: event.target.value }))} />
                    <Textarea className="min-h-40 rounded-[8px] bg-white" placeholder="资料正文" value={docForm.content} onChange={(event) => setDocForm((value) => ({ ...value, content: event.target.value }))} />
                    <Button className="justify-self-start rounded-[8px] bg-[#1f6f62] text-white hover:bg-[#18594f]" onClick={() => void submitDocument()} type="button">
                      写入资料库
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredDocs.map((doc) => (
                <button className="rounded-[8px] border border-[#e4ddd1] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#1f6f62]" key={doc.id} onClick={() => void openDocument(doc)} type="button">
                  <Badge className="rounded-[8px] bg-[#e9f2ed] text-[#1f6f62]" variant="secondary">
                    {categoryCopy[doc.category] ?? doc.category}
                  </Badge>
                  <h3 className="mt-4 font-semibold text-[#253834]">{doc.title}</h3>
                  <p className="mt-2 line-clamp-4 text-sm leading-7 text-[#64736f]">{doc.summary}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f8f5ed] py-16" id="yunbao">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle kicker="云宝" title={isAdmin ? "教师端设备控制" : "小陪伴机器人"} subtitle={isAdmin ? "管理员可查看监控画面、设备状态、运行日志并用 WASD 控制。" : "普通用户展示机器人简介和公开展示画面。"} />
            <div className="grid gap-6 lg:grid-cols-[0.66fr_0.34fr]">
              <div className="overflow-hidden rounded-[8px] border border-[#e4ddd1] bg-white shadow-sm">
                <div className="relative h-[420px] bg-[#20312d]">
                  <Image alt="云宝展示画面" className="object-cover opacity-90" fill src={data.devices[0]?.streamUrl ?? heroPhoto} sizes="65vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/58 to-transparent" />
                  <Badge className="absolute left-5 top-5 rounded-[8px] bg-white/20 text-white backdrop-blur-xl">{isAdmin ? "监控画面" : "展示画面"}</Badge>
                  <div className="absolute bottom-5 left-5 right-5 text-white">
                    <h3 className="text-3xl font-semibold">{data.devices[0]?.name ?? "云宝"}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-white/82">{data.devices[0]?.description}</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-4">
                {isAdmin ? (
                  <>
                    <Panel title="设备状态" icon={Settings}>
                      <p>状态：{statusCopy[data.devices[0]?.status ?? "ONLINE"]}</p>
                      <p>电量：{data.devices[0]?.battery ?? 0}%</p>
                      <p>班级空间：{data.devices[0]?.classroom ?? "未绑定"}</p>
                    </Panel>
                    <Panel title="WASD 控制" icon={SquareTerminal}>
                      <div className="grid grid-cols-3 gap-2">
                        <span />
                        <ControlKey label="W" icon={ArrowUp} onClick={() => void sendWasd("W")} />
                        <span />
                        <ControlKey label="A" icon={ArrowLeft} onClick={() => void sendWasd("A")} />
                        <ControlKey label="S" icon={ArrowDown} onClick={() => void sendWasd("S")} />
                        <ControlKey label="D" icon={ArrowRight} onClick={() => void sendWasd("D")} />
                      </div>
                    </Panel>
                    <Panel title="运行日志" icon={SquareTerminal}>
                      <div className="space-y-2">
                        {data.logs.slice(0, 4).map((log) => (
                          <p className="rounded-[8px] bg-[#f7f3ea] px-3 py-2 text-xs leading-6" key={log.id}>
                            {log.message}
                          </p>
                        ))}
                      </div>
                    </Panel>
                  </>
                ) : (
                  <Panel title="云宝简介" icon={Bot}>
                    <p>{data.devices[0]?.description}</p>
                  </Panel>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={Boolean(activePhoto)} onOpenChange={(open) => !open && setActivePhoto(null)}>
        <DialogContent className="max-w-[min(94vw,1180px)] rounded-[8px] bg-[#111d1a]/88 p-2 text-white" showCloseButton>
          <DialogHeader className="sr-only">
            <DialogTitle>照片预览</DialogTitle>
            <DialogDescription>放大查看园所照片</DialogDescription>
          </DialogHeader>
          <div className="relative h-[84vh] overflow-hidden rounded-[8px]">
            {activePhoto ? <Image alt="照片预览" className="object-contain" fill src={activePhoto} sizes="94vw" /> : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeDoc)} onOpenChange={(open) => !open && setActiveDoc(null)}>
        <DialogContent className="max-h-[84vh] max-w-[min(92vw,820px)] overflow-y-auto rounded-[8px] bg-white p-6">
          {activeDoc ? (
            <>
              <DialogHeader>
                <Badge className="w-fit rounded-[8px] bg-[#e9f2ed] text-[#1f6f62]" variant="secondary">
                  {categoryCopy[activeDoc.category] ?? activeDoc.category}
                </Badge>
                <DialogTitle className="mt-3 text-2xl">{activeDoc.title}</DialogTitle>
                <DialogDescription>{activeDoc.summary}</DialogDescription>
              </DialogHeader>
              {docLoading ? <p className="rounded-[8px] bg-[#f7f3ea] px-4 py-3 text-sm text-[#64736f]">正在读取资料正文...</p> : null}
              <p className="whitespace-pre-wrap text-sm leading-8 text-[#4d625d]">{docContent}</p>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {toast ? <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[8px] bg-[#21312e] px-5 py-3 text-sm text-white shadow-xl">{toast}</div> : null}
      <SciencePet />
    </div>
  );
}

function SectionTitle({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="text-sm font-semibold tracking-[0.2em] text-[#8c7540]">{kicker}</p>
      <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-normal text-[#1e2e2b]">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-[#64736f]">{subtitle}</p>
    </div>
  );
}

function GrowthPhotoShowcase({ photos, onOpen }: { photos: SiteData["campusPhotos"]; onOpen: (url: string) => void }) {
  if (photos.length === 0) return <EmptyState text="暂无成长照片。" />;

  const rows = [photos.filter((_, index) => index % 3 === 0), photos.filter((_, index) => index % 3 === 1), photos.filter((_, index) => index % 3 === 2)].filter((row) => row.length);

  return (
    <div className="relative overflow-hidden rounded-[8px] border border-[#e4ddd1] bg-[#f8f5ed] py-5 shadow-[0_24px_70px_rgba(45,60,52,0.10)]">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#f8f5ed] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#f8f5ed] to-transparent" />
      <div className="grid gap-4">
        {rows.map((row, rowIndex) => {
          const loop = [...row, ...row];
          return (
            <div className="photo-river-track" data-direction={rowIndex % 2 ? "reverse" : "forward"} key={`row-${rowIndex}`} style={{ animationDuration: `${rowIndex === 1 ? 72 : 62}s` }}>
              {loop.map((photo, index) => (
                <button
                  className={`group relative mx-2 shrink-0 overflow-hidden rounded-[8px] bg-[#e7e1d5] shadow-sm transition duration-500 hover:z-20 hover:-translate-y-1 hover:scale-[1.035] ${index % 5 === 0 ? "h-52 w-72" : index % 5 === 1 ? "h-44 w-64" : index % 5 === 2 ? "h-56 w-48" : "h-48 w-60"}`}
                  key={`${photo.id}-${rowIndex}-${index}`}
                  onClick={() => onOpen(photo.url)}
                  type="button"
                >
                  <Image alt={photo.title} className="animate-gallery-kenburns object-cover transition duration-700 group-hover:scale-110" fill src={photo.url} sizes="280px" style={{ animationDelay: `${(index % row.length) * 0.28}s` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/38 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                  <span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-[8px] bg-white/24 text-white opacity-0 backdrop-blur-xl transition group-hover:opacity-100">
                    <Eye size={17} />
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoomGallery({
  activeRoom,
  rooms,
  onOpenPhoto,
  onSelectRoom,
}: {
  activeRoom?: SiteData["rooms"][number];
  rooms: SiteData["rooms"];
  onOpenPhoto: (url: string) => void;
  onSelectRoom: (room: SiteData["rooms"][number]) => void;
}) {
  const hero = activeRoom?.assets[0];
  const roomPhotos = rooms.flatMap((room) => room.assets.map((asset) => ({ ...asset, room })));
  const featureList = Array.isArray(activeRoom?.features) ? activeRoom.features.filter((item): item is string => typeof item === "string") : [];

  if (!activeRoom) return <EmptyState text="暂无功能室资料。" />;

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#e4ddd1] bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[0.58fr_0.42fr]">
        <button className="group relative min-h-[520px] overflow-hidden bg-[#e7e1d5] text-left" onClick={() => hero && onOpenPhoto(hero.url)} type="button">
          {hero ? <Image alt={hero.title} className="object-cover transition duration-700 group-hover:scale-105" fill src={hero.url} sizes="(min-width:1024px) 56vw, 100vw" /> : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/64 via-black/8 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <Badge className="rounded-[8px] bg-white/20 text-white backdrop-blur-xl">当前空间</Badge>
            <h3 className="mt-3 text-4xl font-semibold">{activeRoom.name}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/84">{activeRoom.description}</p>
          </div>
        </button>

        <div className="flex min-h-[520px] flex-col justify-between bg-[#fbfaf5] p-5">
          <div>
            <div className="flex flex-wrap gap-2">
              {rooms.map((room) => (
                <button className={`rounded-[8px] border px-3 py-2 text-sm transition ${activeRoom.id === room.id ? "border-[#1f6f62] bg-[#1f6f62] text-white shadow-sm" : "border-[#e4ddd1] bg-white text-[#40514d] hover:border-[#1f6f62]"}`} key={room.id} onClick={() => onSelectRoom(room)} type="button">
                  {room.name}
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-[8px] border border-[#e5dccb] bg-white p-5">
              <p className="text-xs font-semibold tracking-[0.18em] text-[#8c7540]">空间简介</p>
              <p className="mt-3 text-sm leading-8 text-[#4f625d]">{activeRoom.summary}</p>
              {featureList.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {featureList.map((feature) => (
                    <Badge className="rounded-[8px] bg-[#e9f2ed] text-[#1f6f62]" key={feature} variant="secondary">
                      {feature}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {roomPhotos.slice(0, 4).map((asset) => (
              <button className="group relative h-28 overflow-hidden rounded-[8px] bg-[#e7e1d5]" key={asset.id} onClick={() => onSelectRoom(asset.room)} type="button">
                <Image alt={asset.title} className="object-cover transition duration-500 group-hover:scale-105" fill src={asset.url} sizes="210px" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/42 to-transparent" />
                <span className="absolute bottom-2 left-2 text-xs font-semibold text-white">{asset.room.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[#e4ddd1] bg-[#f8f5ed] px-3 py-4">
        <div className="function-film-track">
          {[...roomPhotos, ...roomPhotos].map((asset, index) => (
            <button className="group relative mx-2 h-40 w-64 shrink-0 overflow-hidden rounded-[8px] bg-[#e7e1d5] shadow-sm transition hover:-translate-y-1 hover:shadow-md" key={`${asset.id}-${index}`} onClick={() => onOpenPhoto(asset.url)} type="button">
              <Image alt={asset.title} className="object-cover transition duration-700 group-hover:scale-105" fill src={asset.url} sizes="260px" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/44 via-transparent to-transparent" />
              <span className="absolute bottom-3 left-3 text-sm font-semibold text-white">{asset.room.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[8px] border border-[#e4ddd1] bg-white p-8 text-sm text-[#64736f]">
      {text}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Settings; children: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-[#e4ddd1] bg-white p-5 text-sm leading-7 text-[#64736f] shadow-sm">
      <div className="mb-4 flex items-center gap-3 text-[#21312e]">
        <Icon size={18} className="text-[#1f6f62]" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ControlKey({ label, icon: Icon, onClick }: { label: string; icon: typeof ArrowUp; onClick: () => void }) {
  return (
    <Button className="h-12 rounded-[8px] border-[#e4ddd1] bg-white" onClick={onClick} type="button" variant="outline">
      <Icon size={15} />
      {label}
    </Button>
  );
}
