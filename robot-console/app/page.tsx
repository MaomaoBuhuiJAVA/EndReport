import {
  BatteryCharging,
  BookOpen,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  MapPin,
  Mic2,
  Radio,
  ShieldCheck,
  Signal,
  Sparkles,
  ThermometerSun,
  WifiOff,
} from "lucide-react";
import { CommandButton } from "@/components/CommandButton";
import { FloatingChat } from "@/components/FloatingChat";
import { getOverview } from "@/lib/store";
import type { DeviceStatus, RobotMode } from "@/lib/types";

export default function Home() {
  const overview = getOverview();
  const activeDevice = overview.devices[0];
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

  return (
    <div className="min-h-screen bg-[#f4f0e6] text-[#213234]">
      <main className="mx-auto flex w-full max-w-[1500px] gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <aside className="sticky top-4 hidden h-[calc(100vh-32px)] w-72 shrink-0 flex-col justify-between rounded-[28px] bg-[#173b42] p-5 text-white lg:flex">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-[#f6d36c] text-[#173b42]">
                <Sparkles size={22} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#9ec6c0]">KinderVoice</p>
                <h1 className="text-xl font-semibold">星芽控制台</h1>
              </div>
            </div>

            <nav className="space-y-2">
              {[
                [LayoutDashboard, "运行总览"],
                [Radio, "设备控制"],
                [BookOpen, "学习任务"],
                [Mic2, "AI 对话"],
                [ShieldCheck, "安全日志"],
              ].map(([Icon, label]) => (
                <div
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-[#d4e9e5] first:bg-white/12"
                  key={label as string}
                >
                  <Icon size={18} />
                  <span>{label as string}</span>
                </div>
              ))}
            </nav>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
            <p className="mb-3 text-sm text-[#d5e8e3]">硬件接入状态</p>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#7ccba2] text-[#123236]">
                <Signal size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold">模拟设备在线</p>
                <p className="text-xs text-[#a8c8c2]">HTTP 心跳接口已预留</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="mb-6 overflow-hidden rounded-[34px] border border-[#dde2da] bg-[#fcfaf4]">
            <div className="grid gap-6 p-5 md:grid-cols-[1.35fr_0.65fr] md:p-7">
              <div className="flex flex-col justify-between gap-8">
                <div>
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d8dfd9] bg-white px-3 py-2 text-sm text-[#4b6263]">
                    <Sparkles size={15} />
                    幼儿园陪伴机器人云端控制与监控平台
                  </p>
                  <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-[#173b42] md:text-6xl">
                    让教师看得见设备状态，也能温柔地安排每一次陪伴。
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["在线设备", `${overview.stats.onlineDevices}/${overview.stats.totalDevices}`],
                    ["今日互动", `${overview.stats.interactionsToday} 次`],
                    ["指令成功率", `${overview.stats.commandSuccessRate}%`],
                  ].map(([label, value]) => (
                    <div className="rounded-3xl border border-[#dbe2dd] bg-white p-4" key={label}>
                      <p className="text-sm text-[#718281]">{label}</p>
                      <p className="mt-2 text-3xl font-semibold text-[#173b42]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative min-h-[360px] overflow-hidden rounded-[30px] bg-[#173b42] p-5 text-white">
                <div className="absolute inset-x-6 bottom-0 h-40 rounded-t-full bg-[#e76842]" />
                <div className="absolute left-1/2 top-16 h-56 w-48 -translate-x-1/2 rounded-[48px] bg-[#f7d66f] shadow-2xl shadow-black/20" />
                <div className="absolute left-1/2 top-28 flex w-32 -translate-x-1/2 justify-between">
                  <span className="size-5 rounded-full bg-[#173b42]" />
                  <span className="size-5 rounded-full bg-[#173b42]" />
                </div>
                <div className="absolute left-1/2 top-40 h-5 w-20 -translate-x-1/2 rounded-full border-2 border-[#173b42] border-t-0" />
                <div className="absolute left-10 top-40 h-24 w-12 rotate-[-18deg] rounded-full bg-[#f7d66f]" />
                <div className="absolute right-10 top-40 h-24 w-12 rotate-[18deg] rounded-full bg-[#f7d66f]" />
                <div className="relative z-10">
                  <p className="text-sm text-[#bfd9d5]">当前展示设备</p>
                  <h3 className="mt-1 text-2xl font-semibold">{activeDevice.name}</h3>
                  <p className="mt-2 flex items-center gap-2 text-sm text-[#e9f3ef]">
                    <MapPin size={16} />
                    {activeDevice.classroom}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[30px] border border-[#dde2da] bg-[#fcfaf4] p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[#718281]">教师端控制</p>
                  <h2 className="text-2xl font-semibold text-[#173b42]">{activeDevice.name}</h2>
                </div>
                <span className="rounded-full bg-[#dff4ea] px-4 py-2 text-sm font-medium text-[#1b6b4d]">
                  {statusCopy[activeDevice.status]} / {modeCopy[activeDevice.mode]}
                </span>
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <Metric icon={BatteryCharging} label="电量" value={`${activeDevice.battery}%`} />
                <Metric icon={ThermometerSun} label="温度" value={`${activeDevice.temperature}°C`} />
                <Metric icon={Clock3} label="心跳" value="刚刚" />
              </div>

              <div className="grid gap-3 sm:grid-cols-5">
                <CommandButton deviceId={activeDevice.id} icon="arrowUp" label="前进" type="move_forward" />
                <CommandButton deviceId={activeDevice.id} icon="arrowDown" label="后退" type="move_back" />
                <CommandButton deviceId={activeDevice.id} icon="arrowLeft" label="左转" type="turn_left" />
                <CommandButton deviceId={activeDevice.id} icon="arrowRight" label="右转" type="turn_right" />
                <CommandButton deviceId={activeDevice.id} icon="stop" label="停止" type="move_stop" />
                <CommandButton deviceId={activeDevice.id} icon="learning" label="学习" type="mode_learning" />
                <CommandButton deviceId={activeDevice.id} icon="companion" label="陪伴" type="mode_companion" />
                <CommandButton deviceId={activeDevice.id} icon="sleep" label="休眠" type="mode_sleep" />
                <CommandButton deviceId={activeDevice.id} icon="story" label="故事" type="story" />
                <CommandButton deviceId={activeDevice.id} icon="song" label="儿歌" type="song" />
              </div>
            </section>

            <section className="rounded-[30px] border border-[#dde2da] bg-[#fcfaf4] p-5">
              <div className="mb-5">
                <p className="text-sm text-[#718281]">设备列表</p>
                <h2 className="text-2xl font-semibold text-[#173b42]">班级机器人</h2>
              </div>
              <div className="space-y-3">
                {overview.devices.map((device) => (
                  <div className="flex items-center justify-between rounded-3xl border border-[#dbe2dd] bg-white p-4" key={device.id}>
                    <div>
                      <p className="font-semibold text-[#203437]">{device.name}</p>
                      <p className="mt-1 text-sm text-[#748584]">{device.classroom} · {modeCopy[device.mode]}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#173b42]">{device.battery}%</p>
                      <p className={`mt-1 text-xs ${device.status === "offline" ? "text-[#9b4c45]" : "text-[#347d5b]"}`}>
                        {device.status === "offline" ? <WifiOff className="mr-1 inline" size={13} /> : null}
                        {statusCopy[device.status]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <section className="rounded-[30px] border border-[#dde2da] bg-[#fcfaf4] p-5 xl:col-span-2">
              <div className="mb-5">
                <p className="text-sm text-[#718281]">最近指令</p>
                <h2 className="text-2xl font-semibold text-[#173b42]">控制记录</h2>
              </div>
              <div className="grid gap-3">
                {overview.commands.map((command) => (
                  <div className="grid gap-3 rounded-3xl border border-[#dbe2dd] bg-white p-4 sm:grid-cols-[1fr_auto]" key={command.id}>
                    <div>
                      <p className="font-medium text-[#213234]">{command.label}</p>
                      <p className="mt-1 text-sm text-[#748584]">{command.type} · {new Date(command.createdAt).toLocaleTimeString("zh-CN")}</p>
                    </div>
                    <span className="self-center rounded-full bg-[#f5edcf] px-3 py-2 text-sm text-[#80672a]">
                      {command.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[30px] border border-[#dde2da] bg-[#fcfaf4] p-5">
              <div className="mb-5">
                <p className="text-sm text-[#718281]">教学安排</p>
                <h2 className="text-2xl font-semibold text-[#173b42]">今日任务</h2>
              </div>
              <div className="space-y-4">
                {overview.tasks.map((task) => (
                  <div key={task.id}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[#213234]">{task.title}</p>
                      <span className="text-xs text-[#748584]">{task.schedule}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#e3e0d5]">
                      <div className="h-full rounded-full bg-[#e76842]" style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-[30px] border border-[#dde2da] bg-[#fcfaf4] p-5">
            <div className="mb-5">
              <p className="text-sm text-[#718281]">设备日志</p>
              <h2 className="text-2xl font-semibold text-[#173b42]">运行安全记录</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {overview.logs.map((log) => (
                <div className="rounded-3xl border border-[#dbe2dd] bg-white p-4" key={log.id}>
                  <p className="mb-3 text-xs uppercase tracking-[0.16em] text-[#8b9896]">{log.level}</p>
                  <p className="text-sm leading-6 text-[#2a3b3d]">{log.message}</p>
                </div>
              ))}
            </div>
          </section>
        </section>
      </main>
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
    <div className="rounded-3xl border border-[#dbe2dd] bg-white p-4">
      <div className="mb-3 grid size-10 place-items-center rounded-2xl bg-[#e6f1ee] text-[#1c5b63]">
        <Icon size={18} />
      </div>
      <p className="text-sm text-[#718281]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#173b42]">{value}</p>
    </div>
  );
}
