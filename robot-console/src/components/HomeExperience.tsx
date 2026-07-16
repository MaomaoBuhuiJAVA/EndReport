"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BatteryCharging,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clock3,
  Eye,
  GraduationCap,
  ImageIcon,
  Leaf,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  Waves,
  WifiOff,
  X,
} from "lucide-react";
import { FloatingChat } from "@/components/FloatingChat";
import type { DeviceStatus, RobotDevice, RobotMode } from "@/lib/types";

type Overview = {
  devices: RobotDevice[];
  commands: Array<{
    id: string;
    deviceId: string;
    type: string;
    label: string;
    status: string;
    createdAt: string;
  }>;
  logs: Array<{
    id: string;
    level: "info" | "warning" | "error";
    message: string;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    schedule: string;
    progress: number;
  }>;
  stats: {
    totalDevices: number;
    onlineDevices: number;
    warningDevices: number;
    avgBattery: number;
    interactionsToday: number;
    commandSuccessRate: number;
  };
};

type GalleryImage = {
  src: string;
  width: number;
  height: number;
};

type HomeExperienceProps = {
  overview: Overview;
  gallery: GalleryImage[];
};

const navItems = [
  { id: "home", label: "首页" },
  { id: "about", label: "园所概览" },
  { id: "gallery", label: "成长影像" },
  { id: "console", label: "智慧控制" },
  { id: "safety", label: "安全运行" },
];

const statusCopy: Record<DeviceStatus, string> = {
  online: "在线",
  idle: "待命",
  offline: "离线",
  warning: "预警",
};

const modeCopy: Record<RobotMode, string> = {
  companion: "陪伴模式",
  learning: "学习模式",
  patrol: "巡航模式",
  sleep: "休眠模式",
};

const commandGroups = [
  {
    title: "移动控制",
    commands: [
      { type: "move_forward", label: "前进", icon: ArrowUp },
      { type: "move_back", label: "后退", icon: ArrowDown },
      { type: "turn_left", label: "左转", icon: ArrowLeft },
      { type: "turn_right", label: "右转", icon: ArrowRight },
      { type: "move_stop", label: "停止", icon: CircleStop },
    ],
  },
  {
    title: "课程模式",
    commands: [
      { type: "mode_learning", label: "学习", icon: GraduationCap },
      { type: "mode_companion", label: "陪伴", icon: Sparkles },
      { type: "mode_sleep", label: "休眠", icon: Moon },
      { type: "story", label: "故事", icon: BookOpen },
      { type: "song", label: "儿歌", icon: Play },
    ],
  },
];

export function HomeExperience({ overview, gallery }: HomeExperienceProps) {
  const [activeSection, setActiveSection] = useState("home");
  const [activeDeviceId, setActiveDeviceId] = useState(overview.devices[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<"overview" | "devices" | "tasks" | "logs">("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  const activeDevice =
    overview.devices.find((device) => device.id === activeDeviceId) ?? overview.devices[0];
  const featuredImages = gallery.slice(0, 8);
  const visibleGallery = gallery.slice(0, 24);

  useEffect(() => {
    if (featuredImages.length < 2 || lightboxIndex !== null) {
      return;
    }

    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % featuredImages.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [featuredImages.length, lightboxIndex]);

  useEffect(() => {
    const sectionElements = navItems
      .map((item) => document.getElementById(item.id))
      .filter((item): item is HTMLElement => Boolean(item));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);

        if (visible?.target.id) {
          setActiveSection(visible.target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );

    sectionElements.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const activityCards = useMemo(
    () => [
      {
        title: "科学阅读",
        text: "围绕自然观察、实验启蒙和绘本表达，为幼儿构建可感知的探究路径。",
        icon: BookOpen,
      },
      {
        title: "智能陪伴",
        text: "机器人接入班级场景，承担问候、故事、口令练习和安全提醒等辅助任务。",
        icon: Bot,
      },
      {
        title: "家园共育",
        text: "用影像、数据和课程记录，把孩子的成长瞬间转化为可回看、可沟通的资料。",
        icon: Leaf,
      },
    ],
    [],
  );

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
    setMenuOpen(false);
  }

  async function sendCommand(type: string, label: string) {
    if (!activeDevice) {
      return;
    }

    setToast("正在下发指令...");

    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: activeDevice.id, type, label }),
      });

      if (!response.ok) {
        throw new Error("Command failed");
      }

      setToast(`${label} 指令已发送到 ${activeDevice.name}`);
    } catch {
      setToast("指令发送失败，请检查网络后重试");
    } finally {
      window.setTimeout(() => setToast(""), 2400);
    }
  }

  function moveLightbox(direction: -1 | 1) {
    setLightboxIndex((current) => {
      if (current === null) {
        return current;
      }

      return (current + direction + visibleGallery.length) % visibleGallery.length;
    });
  }

  return (
    <div className="min-h-screen bg-[#f7f5ee] text-[#183135]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/40 bg-white/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => scrollToSection("home")}
            type="button"
          >
            <span className="grid size-11 place-items-center rounded-full bg-[#176b5d] text-white shadow-lg shadow-[#176b5d]/20">
              <Sparkles size={21} />
            </span>
            <span>
              <span className="block text-base font-semibold text-[#173b42]">国科二幼智慧成长平台</span>
              <span className="block text-xs text-[#5f746f]">CAS Kindergarten No.2</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 rounded-full border border-[#dbe5df] bg-white/70 p-1 lg:flex">
            {navItems.map((item) => (
              <button
                className={`rounded-full px-4 py-2 text-sm transition ${
                  activeSection === item.id
                    ? "bg-[#176b5d] text-white shadow-sm"
                    : "text-[#465f5b] hover:bg-[#eef5ef] hover:text-[#173b42]"
                }`}
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              className="grid size-11 place-items-center rounded-full border border-[#dbe5df] bg-white/75 text-[#176b5d] transition hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => scrollToSection("gallery")}
              title="查看成长影像"
              type="button"
            >
              <ImageIcon size={19} />
            </button>
            <button
              className="grid size-11 place-items-center rounded-full border border-[#dbe5df] bg-white/75 text-[#176b5d] transition hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => scrollToSection("console")}
              title="进入智慧控制"
              type="button"
            >
              <Radio size={19} />
            </button>
          </div>

          <button
            aria-label="打开导航"
            className="grid size-11 place-items-center rounded-full border border-[#dbe5df] bg-white/80 text-[#173b42] lg:hidden"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {menuOpen ? (
          <div className="border-t border-[#dbe5df] bg-white/95 px-4 py-3 lg:hidden">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <button
                  className="rounded-2xl px-4 py-3 text-left text-sm text-[#173b42] hover:bg-[#eef5ef]"
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <main>
        <section className="relative min-h-[calc(100vh-24px)] overflow-hidden pt-20" id="home">
          <div className="absolute inset-0">
            {featuredImages.map((image, index) => (
              <Image
                alt="国科二幼校园活动照片"
                className={`object-cover transition-opacity duration-1000 ${
                  index === heroIndex ? "opacity-100" : "opacity-0"
                }`}
                fill
                key={image.src}
                priority={index === 0}
                sizes="100vw"
                src={image.src}
              />
            ))}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,45,42,0.82),rgba(16,45,42,0.45),rgba(247,245,238,0.1))]" />
            <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#f7f5ee] to-transparent" />
          </div>

          <div className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] max-w-7xl items-center px-4 py-12 sm:px-6 lg:px-8">
            <div className="max-w-3xl pb-16 pt-12 text-white">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/18 px-4 py-2 text-sm backdrop-blur-xl">
                <Sparkles size={16} />
                中国科学院第二幼儿园 · 智慧校园展示
              </p>
              <h1 className="text-5xl font-semibold leading-tight sm:text-6xl lg:text-7xl">
                让科学启蒙、童年温度与智能陪伴自然发生
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#edf7f1]">
                面向国科二幼的官方网站式智慧展示页，整合园所介绍、成长影像、机器人控制、AI 问答与安全运行数据。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  className="rounded-full bg-[#f3c94b] px-6 py-3 text-sm font-semibold text-[#173b42] shadow-xl shadow-black/15 transition hover:-translate-y-0.5"
                  onClick={() => scrollToSection("gallery")}
                  type="button"
                >
                  浏览成长影像
                </button>
                <button
                  className="rounded-full border border-white/40 bg-white/16 px-6 py-3 text-sm font-semibold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/24"
                  onClick={() => scrollToSection("console")}
                  type="button"
                >
                  进入控制台
                </button>
              </div>
            </div>
          </div>

          <div className="absolute inset-x-4 bottom-8 z-20 mx-auto grid max-w-7xl gap-3 sm:grid-cols-3 lg:px-4">
            {[
              ["在线设备", `${overview.stats.onlineDevices}/${overview.stats.totalDevices}`],
              ["今日互动", `${overview.stats.interactionsToday} 次`],
              ["指令成功率", `${overview.stats.commandSuccessRate}%`],
            ].map(([label, value]) => (
              <div
                className="rounded-[8px] border border-white/35 bg-white/22 p-4 text-white shadow-xl backdrop-blur-2xl"
                key={label}
              >
                <p className="text-sm text-white/78">{label}</p>
                <p className="mt-1 text-3xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8" id="about">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <div>
                <p className="text-sm font-semibold text-[#176b5d]">园所概览</p>
                <h2 className="mt-3 text-4xl font-semibold leading-tight text-[#173b42] sm:text-5xl">
                  从“会看见孩子”的教育现场，延伸到“会回应孩子”的数字系统
                </h2>
              </div>
              <p className="text-base leading-8 text-[#536965]">
                页面以官方网站首屏、新闻影像、课程展示和智慧管理为结构，把国科二幼的科学教育气质与幼儿园真实活动照片融合起来。交互控制区保留原系统能力，适合汇报演示和后续功能扩展。
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {activityCards.map(({ icon: Icon, text, title }) => (
                <article
                  className="rounded-[8px] border border-[#dce7df] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#1d5d55]/10"
                  key={title}
                >
                  <div className="mb-5 grid size-12 place-items-center rounded-full bg-[#e9f4ed] text-[#176b5d]">
                    <Icon size={22} />
                  </div>
                  <h3 className="text-xl font-semibold text-[#173b42]">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#5f746f]">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="scroll-mt-24 bg-[#edf5f0] px-4 py-20 sm:px-6 lg:px-8" id="gallery">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-semibold text-[#176b5d]">成长影像</p>
                <h2 className="mt-3 text-4xl font-semibold text-[#173b42]">小朋友的一日探索</h2>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/65 p-1 backdrop-blur-xl">
                <button
                  aria-label="上一张"
                  className="grid size-10 place-items-center rounded-full text-[#176b5d] hover:bg-[#e5f0ea]"
                  onClick={() => setHeroIndex((heroIndex - 1 + featuredImages.length) % featuredImages.length)}
                  type="button"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  aria-label="下一张"
                  className="grid size-10 place-items-center rounded-full text-[#176b5d] hover:bg-[#e5f0ea]"
                  onClick={() => setHeroIndex((heroIndex + 1) % featuredImages.length)}
                  type="button"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="grid auto-rows-[180px] gap-4 md:grid-cols-4 lg:auto-rows-[210px]">
              {visibleGallery.map((image, index) => (
                <button
                  className={`group relative overflow-hidden rounded-[8px] bg-[#dbe8df] text-left shadow-sm ${
                    index === 0 || index === 7 || index === 13 ? "md:col-span-2 md:row-span-2" : ""
                  }`}
                  key={image.src}
                  onClick={() => setLightboxIndex(index)}
                  type="button"
                >
                  <Image
                    alt={`国科二幼成长影像 ${index + 1}`}
                    className="object-cover transition duration-700 group-hover:scale-105"
                    fill
                    loading={index < 4 ? "eager" : "lazy"}
                    sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                    src={image.src}
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                  <span className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full border border-white/45 bg-white/22 text-white opacity-0 backdrop-blur-xl transition group-hover:opacity-100">
                    <Eye size={18} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8" id="console">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-semibold text-[#176b5d]">智慧控制</p>
                <h2 className="mt-3 text-4xl font-semibold text-[#173b42]">教师端机器人运行中心</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["overview", "devices", "tasks", "logs"] as const).map((tab) => (
                  <button
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      activeTab === tab
                        ? "bg-[#176b5d] text-white"
                        : "border border-[#dce7df] bg-white text-[#536965] hover:border-[#176b5d]"
                    }`}
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    type="button"
                  >
                    {tab === "overview" ? "总览" : tab === "devices" ? "设备" : tab === "tasks" ? "课程" : "日志"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <aside className="rounded-[8px] border border-[#dce7df] bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#6a7d78]">当前设备</p>
                    <h3 className="mt-1 text-2xl font-semibold text-[#173b42]">{activeDevice.name}</h3>
                  </div>
                  <span className="rounded-full bg-[#e7f4ed] px-3 py-2 text-sm font-medium text-[#176b5d]">
                    {statusCopy[activeDevice.status]}
                  </span>
                </div>

                <div className="grid gap-3">
                  {overview.devices.map((device) => (
                    <button
                      className={`rounded-[8px] border p-4 text-left transition ${
                        activeDevice.id === device.id
                          ? "border-[#176b5d] bg-[#f0f8f3] shadow-sm"
                          : "border-[#dce7df] bg-white hover:border-[#9bc7b9]"
                      }`}
                      key={device.id}
                      onClick={() => setActiveDeviceId(device.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#173b42]">{device.name}</span>
                        <span className="text-sm text-[#176b5d]">{device.battery}%</span>
                      </div>
                      <p className="mt-1 text-sm text-[#6a7d78]">
                        {device.classroom} · {modeCopy[device.mode]}
                      </p>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="rounded-[8px] border border-[#dce7df] bg-white p-5 shadow-sm">
                {activeTab === "overview" ? (
                  <div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Metric icon={BatteryCharging} label="电量" value={`${activeDevice.battery}%`} />
                      <Metric icon={ThermometerSun} label="机身温度" value={`${activeDevice.temperature}°C`} />
                      <Metric icon={Clock3} label="心跳" value="刚刚" />
                    </div>
                    <div className="mt-6 grid gap-5 lg:grid-cols-2">
                      {commandGroups.map((group) => (
                        <div key={group.title}>
                          <h4 className="mb-3 text-sm font-semibold text-[#536965]">{group.title}</h4>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {group.commands.map(({ icon: Icon, label, type }) => (
                              <button
                                className="flex min-h-14 items-center justify-center gap-2 rounded-[8px] border border-[#dce7df] bg-[#fbfdfb] px-3 text-sm font-medium text-[#173b42] transition hover:-translate-y-0.5 hover:border-[#176b5d] hover:text-[#176b5d] hover:shadow-lg"
                                key={type}
                                onClick={() => void sendCommand(type, label)}
                                type="button"
                              >
                                <Icon size={17} />
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeTab === "devices" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {overview.devices.map((device) => (
                      <article className="rounded-[8px] border border-[#dce7df] bg-[#fbfdfb] p-4" key={device.id}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-semibold text-[#173b42]">{device.name}</h3>
                            <p className="mt-1 text-sm text-[#6a7d78]">{device.code}</p>
                          </div>
                          <StatusPill status={device.status} />
                        </div>
                        <p className="mt-4 flex items-center gap-2 text-sm text-[#536965]">
                          <MapPin size={15} />
                          {device.classroom}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}

                {activeTab === "tasks" ? (
                  <div className="grid gap-4">
                    {overview.tasks.map((task) => (
                      <article className="rounded-[8px] border border-[#dce7df] bg-[#fbfdfb] p-4" key={task.id}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="font-semibold text-[#173b42]">{task.title}</h3>
                          <span className="text-sm text-[#6a7d78]">{task.schedule}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#dfe9e2]">
                          <div className="h-full rounded-full bg-[#f3c94b]" style={{ width: `${task.progress}%` }} />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}

                {activeTab === "logs" ? (
                  <div className="grid gap-3">
                    {overview.logs.map((log) => (
                      <article className="rounded-[8px] border border-[#dce7df] bg-[#fbfdfb] p-4" key={log.id}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#176b5d]">
                          {log.level}
                        </p>
                        <p className="text-sm leading-7 text-[#3f5652]">{log.message}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="scroll-mt-24 bg-[#173b42] px-4 py-20 text-white sm:px-6 lg:px-8" id="safety">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-[#f3c94b]">安全运行</p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight">把每一次互动都纳入可追踪、可回溯、可优化的流程</h2>
              <p className="mt-5 text-base leading-8 text-[#d8e9e4]">
                平台记录设备心跳、指令响应、课程完成度和异常状态，适合期末汇报展示，也方便后续接入真实硬件与数据库。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [ShieldCheck, "安全预警", `${overview.stats.warningDevices} 台设备需关注`],
                [Activity, "平均电量", `${overview.stats.avgBattery}%`],
                [MessageCircle, "AI 问答", "校园问答与活动话术"],
                [Waves, "平滑展示", "影像轮播与毛玻璃灯箱"],
              ].map(([Icon, title, text]) => (
                <div className="rounded-[8px] border border-white/14 bg-white/10 p-5 backdrop-blur-2xl" key={title as string}>
                  <Icon className="text-[#f3c94b]" size={24} />
                  <h3 className="mt-4 text-lg font-semibold">{title as string}</h3>
                  <p className="mt-2 text-sm text-[#d8e9e4]">{text as string}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/60 bg-white/75 px-5 py-3 text-sm font-medium text-[#173b42] shadow-2xl backdrop-blur-2xl">
          <CheckCircle2 size={18} className="text-[#176b5d]" />
          {toast}
        </div>
      ) : null}

      {lightboxIndex !== null ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#102d2a]/70 p-4 backdrop-blur-2xl"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative h-[min(84vh,900px)] w-[min(94vw,1200px)] overflow-hidden rounded-[8px] border border-white/30 bg-white/15 shadow-2xl">
            <Image
              alt="放大的国科二幼成长影像"
              className="object-contain"
              fill
              sizes="94vw"
              src={visibleGallery[lightboxIndex].src}
            />
          </div>
          <button
            aria-label="关闭预览"
            className="absolute right-5 top-5 grid size-11 place-items-center rounded-full border border-white/45 bg-white/20 text-white backdrop-blur-xl"
            onClick={() => setLightboxIndex(null)}
            type="button"
          >
            <X size={20} />
          </button>
          <button
            aria-label="上一张"
            className="absolute left-5 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full border border-white/45 bg-white/20 text-white backdrop-blur-xl"
            onClick={(event) => {
              event.stopPropagation();
              moveLightbox(-1);
            }}
            type="button"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            aria-label="下一张"
            className="absolute right-5 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full border border-white/45 bg-white/20 text-white backdrop-blur-xl"
            onClick={(event) => {
              event.stopPropagation();
              moveLightbox(1);
            }}
            type="button"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      ) : null}

      <FloatingChat />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BatteryCharging;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-[#dce7df] bg-[#fbfdfb] p-4">
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-[#e7f4ed] text-[#176b5d]">
        <Icon size={18} />
      </div>
      <p className="text-sm text-[#6a7d78]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#173b42]">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: DeviceStatus }) {
  const isOffline = status === "offline";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
        isOffline ? "bg-[#f8e7df] text-[#9a4a38]" : "bg-[#e7f4ed] text-[#176b5d]"
      }`}
    >
      {isOffline ? <WifiOff size={13} /> : null}
      {statusCopy[status]}
    </span>
  );
}
