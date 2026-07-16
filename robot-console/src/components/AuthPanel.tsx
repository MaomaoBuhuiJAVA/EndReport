"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, LogOut, Mail, ShieldCheck, User, UserPlus } from "lucide-react";

type SessionUser = { id: string; email: string; name: string; role: "USER" | "ADMIN" };

const modeCopy = {
  login: { tab: "登录", title: "欢迎回来", action: "登录系统" },
  register: { tab: "注册", title: "创建账号", action: "注册账号" },
  password: { tab: "修改密码", title: "账号安全", action: "更新密码" },
};

export function AuthPanel({ initialUser }: { initialUser: SessionUser | null }) {
  const [user, setUser] = useState(initialUser);
  const [mode, setMode] = useState<"login" | "register" | "password">(initialUser ? "password" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", oldPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    setMessage("");
    const endpoint = mode === "login" ? "/api/auth/login" : mode === "register" ? "/api/auth/register" : "/api/auth/password";
    const payload =
      mode === "password"
        ? { oldPassword: form.oldPassword, newPassword: form.newPassword }
        : mode === "register"
          ? { name: form.name, email: form.email, password: form.password }
          : { email: form.email, password: form.password };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { error?: string; user?: SessionUser };

    if (!response.ok) {
      setMessage(data.error ?? "操作失败，请稍后再试");
      return;
    }

    if (data.user) setUser(data.user);
    setMessage(mode === "password" ? "密码已修改" : "操作成功");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMode("login");
    setMessage("已退出登录");
  }

  const isPasswordMode = mode === "password";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#e8edf0] px-4 py-7 text-[#10213a]">
      <Image alt="龙湾区国科温州第二幼儿园校园背景" className="scale-110 object-cover object-[center_58%] blur-[13px]" fill priority src="/rooms/room-03.webp" sizes="100vw" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(252,250,244,0.76),rgba(246,244,239,0.32)_42%,rgba(34,54,65,0.36))]" />
      <div className="absolute inset-x-0 top-0 h-44 bg-white/35 backdrop-blur-[2px]" />

      <Link className="relative z-10 inline-flex items-center gap-2 rounded-full bg-white/42 px-4 py-2 text-sm text-[#11223d] shadow-sm backdrop-blur-xl transition hover:bg-white/70" href="/">
        <ArrowLeft size={16} />
        返回首页
      </Link>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-4xl flex-col items-center justify-center pb-12">
        <div className="mb-8 text-center">
          <p className="text-sm tracking-[0.22em] text-[#3d5268]">用户中心</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal text-[#071739] sm:text-3xl">龙湾区国科温州第二幼儿园</h1>
        </div>

        <div className="w-full max-w-[520px] rounded-[8px] border border-white/78 bg-white/92 p-7 shadow-2xl shadow-[#14283d]/20 backdrop-blur-2xl sm:p-10">
          {user ? (
            <div className="mb-6 rounded-[8px] border border-[#d9e4ef] bg-[#f7faff] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#071739]">{user.name}</p>
                  <p className="mt-1 truncate text-xs text-[#6b778c]">{user.email}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e7f0ff] px-3 py-1 text-xs text-[#075bbb]">
                  <ShieldCheck size={13} />
                  {user.role === "ADMIN" ? "管理员" : "普通用户"}
                </span>
              </div>
            </div>
          ) : null}

          <div className="mb-7 grid grid-cols-2 border-b border-[#dbe1ea] text-sm">
            <ModeButton active={mode === "login"} onClick={() => setMode("login")} label={modeCopy.login.tab} />
            <ModeButton active={mode === "register"} onClick={() => setMode("register")} label={modeCopy.register.tab} />
          </div>

          {user ? (
            <div className="mb-5 flex gap-2">
              <button className={`flex-1 rounded-[8px] px-3 py-2 text-sm transition ${isPasswordMode ? "bg-[#0b63c7] text-white" : "bg-[#eef3f8] text-[#233454]"}`} onClick={() => setMode("password")} type="button">
                修改密码
              </button>
              <button className="flex-1 rounded-[8px] bg-[#eef3f8] px-3 py-2 text-sm text-[#233454] transition hover:bg-[#e5edf7]" onClick={() => void logout()} type="button">
                退出登录
              </button>
            </div>
          ) : null}

          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[#071739]">{modeCopy[mode].title}</h2>
            <p className="mt-2 text-sm text-[#66758b]">请使用园所分配账号，或注册后浏览公开园所信息。</p>
          </div>

          <div className="grid gap-4">
            {mode === "register" ? <Field icon={User} label="姓名" placeholder="请输入姓名" value={form.name} onChange={(name) => setForm((v) => ({ ...v, name }))} /> : null}

            {!isPasswordMode ? (
              <>
                <Field icon={Mail} label="邮箱或账号" placeholder="请输入邮箱" value={form.email} onChange={(email) => setForm((v) => ({ ...v, email }))} />
                <Field
                  action={
                    <button className="grid size-8 place-items-center text-[#7a8495]" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "隐藏密码" : "显示密码"} type="button">
                      {showPassword ? <EyeOff size={21} /> : <Eye size={21} />}
                    </button>
                  }
                  icon={LockKeyhole}
                  label="密码"
                  placeholder="请输入密码"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(password) => setForm((v) => ({ ...v, password }))}
                />
              </>
            ) : (
              <>
                <Field icon={LockKeyhole} label="原密码" placeholder="请输入原密码" type="password" value={form.oldPassword} onChange={(oldPassword) => setForm((v) => ({ ...v, oldPassword }))} />
                <Field icon={LockKeyhole} label="新密码" placeholder="请输入新密码" type="password" value={form.newPassword} onChange={(newPassword) => setForm((v) => ({ ...v, newPassword }))} />
              </>
            )}

            {!isPasswordMode ? (
              <div className="flex items-center justify-between text-xs text-[#2d3b50]">
                <label className="inline-flex items-center gap-2">
                  <span className="grid size-4 place-items-center rounded-[3px] border border-[#b9c7d8] bg-[#f6f9fd]" />
                  记住登录状态
                </label>
                <span className="text-[#005bbb]">忘记密码</span>
              </div>
            ) : null}

            <button className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-[8px] bg-[#0b63c7] px-5 text-sm font-semibold text-white shadow-lg shadow-[#0b63c7]/22 transition hover:-translate-y-0.5 hover:bg-[#075bbb]" onClick={() => void submit()} type="button">
              {mode === "register" ? <UserPlus size={18} /> : isPasswordMode ? <LockKeyhole size={18} /> : <User size={18} />}
              {modeCopy[mode].action}
            </button>

            {user ? (
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#d6e0ec] bg-white text-sm text-[#233454] transition hover:bg-[#f6f9fd]" onClick={() => void logout()} type="button">
                <LogOut size={17} />
                退出当前账号
              </button>
            ) : null}

            {message ? <p className="rounded-[8px] bg-[#edf6ff] px-4 py-3 text-sm text-[#075bbb]">{message}</p> : null}
          </div>
        </div>

        <div className="mt-8 flex items-center gap-7 text-sm text-[#233454]">
          <span>园所帮助</span>
          <span className="size-1 rounded-full bg-[#c7d0de]" />
          <span>联系管理员</span>
        </div>
      </section>
    </main>
  );
}

function Field({
  action,
  icon: Icon,
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  action?: React.ReactNode;
  icon: typeof User;
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-[#18233a]">{label}</span>
      <span className="flex h-13 items-center gap-3 rounded-[8px] border border-[#bcc9db] bg-[#f7faff] px-4 transition focus-within:border-[#0b63c7] focus-within:bg-white">
        <Icon className="shrink-0 text-[#7a8495]" size={22} />
        <input className="min-w-0 flex-1 bg-transparent text-[#111b31] outline-none placeholder:text-[#6f7b8e]" placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
        {action}
      </span>
    </label>
  );
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`relative pb-4 text-center transition ${active ? "text-[#005bbb]" : "text-[#14213d]"}`} onClick={onClick} type="button">
      {label}
      <span className={`absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#0b63c7] transition ${active ? "opacity-100" : "opacity-0"}`} />
    </button>
  );
}
