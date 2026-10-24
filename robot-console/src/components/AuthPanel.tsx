"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import {
  ArrowLeft, ArrowRight, Atom, BookOpen, CheckCircle2, Eye, EyeOff,
  LoaderCircle, LockKeyhole, LogOut, Phone, ShieldCheck, Sparkles, UserRound, GraduationCap, Heart,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import {SmsCodeField, type SmsCodeValue} from "./SmsCodeField";
import type {SmsPurpose} from "@/lib/sms/config";
import styles from "./AuthPanel.module.css";

type Mode = "login" | "register" | "account" | "password" | "smsLogin" | "reset" | "phone" | "username";
type Feedback = { kind: "success" | "error"; text: string } | null;

const copy = {
  login: { title: "欢迎回来呀", description: "科小贝已经准备好，和你一起探索啦。", action: "登录，开启探索" },
  register: { title: "很高兴认识你", description: "给好奇心一个小小的家，一起发现更多。", action: "创建账号" },
  account: { title: "登录成功啦", description: "新的科学发现，正在等着你。", action: "进入资源库" },
  password: { title: "给账号多一份安心", description: "更新密码后，请使用新密码登录。", action: "保存新密码" },
  smsLogin: {title: "用验证码轻松登录", description: "验证已注册的手机号码，继续你的探索。", action: "验证并登录"},
  reset: {title: "找回你的账号密码", description: "验证绑定手机后，即可设置新密码。", action: "重置密码"},
  phone: {title: "更新绑定的手机", description: "验证当前手机和新手机，保护你的账号。", action: "保存新手机号"},
  username: {title: "设置你的用户名", description: "设置后，可以用用户名或手机号登录。", action: "保存用户名"},
} as const;

export function AuthPanel({ initialUser, initialMode = "login", returnTo, smsAvailable = false }: { initialUser: SessionUser | null; initialMode?: "login" | "register" | "smsLogin" | "reset" | "password" | "phone" | "username"; returnTo?: "/admin/reviews" | "/games/growth"; smsAvailable?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [mode, setMode] = useState<Mode>(initialUser ? initialMode === "password" || initialMode === "phone" || initialMode === "username" ? initialMode : "account" : initialMode === "password" || initialMode === "phone" || initialMode === "username" ? "login" : initialMode);
  const [form, setForm] = useState({ name: "", username: initialUser?.username || "", identifier: "", phone: "", accountType: "PARENT", teacherCode: "", password: "", confirmPassword: "", oldPassword: "", newPassword: "" });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [smsValues, setSmsValues] = useState<Partial<Record<SmsPurpose, SmsCodeValue>>>({});
  const [passwordFocused, setPasswordFocused] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isRegister = mode === "register";
  const isPassword = mode === "password";
  const isUsername = mode === "username";
  const isSmsLogin = mode === "smsLogin"; const isReset = mode === "reset"; const isPhone = mode === "phone";
  const isLoginMode = mode === "login" || isSmsLogin;
  const requiresPolicyConsent = !user && (isLoginMode || isRegister);
  const purpose: SmsPurpose = isSmsLogin ? "login" : isReset ? "reset_password" : isPhone ? "phone_new" : "register";

  function clearPasswords() {
    setForm((current) => ({ ...current, password: "", confirmPassword: "", teacherCode: "", oldPassword: "", newPassword: "" }));
    setShowPassword(false);
    setPasswordFocused(false);
  }

  function changeMode(next: Mode) {
    if (busy || mode === next) return;
    setMode(next);
    setFeedback(null);
    setSmsValues({});
    if (next === "phone") setForm(current => ({...current, phone: ""}));
    if (next === "username") setForm(current => ({...current, username: user?.username || ""}));
    if (next === "reset" && user?.phone) setForm(current => ({...current, phone: user.phone || ""}));
    clearPasswords();
  }

  function update(field: keyof typeof form, value: string) {
    if (field === "phone") setSmsValues(current => isPhone ? {phone_current: current.phone_current} : {});
    setForm((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFeedback(null);
    if (requiresPolicyConsent && !acceptedPolicies) {
      setFeedback({ kind: "error", text: "请先阅读并同意用户协议和隐私政策。" });
      return;
    }
    if (isRegister && !form.name.trim()) {
      setFeedback({ kind: "error", text: "请填写你的姓名或称呼。" });
      (formRef.current?.elements.namedItem("name") as HTMLInputElement | null)?.focus();
      return;
    }
    if ((isRegister && form.password !== form.confirmPassword) || (isReset && form.newPassword !== form.confirmPassword)) {
      setFeedback({ kind: "error", text: "两次密码不一致，再检查一下吧。" });
      (formRef.current?.elements.namedItem("confirmPassword") as HTMLInputElement | null)?.focus();
      return;
    }
    if (isPassword && form.oldPassword === form.newPassword) {
      setFeedback({ kind: "error", text: "新密码需要与原密码不同。" });
      return;
    }
    if ((isSmsLogin || isReset || isPhone) && !smsAvailable) {setFeedback({kind: "error", text: "短信服务暂不可用，请稍后重试或使用密码登录。"}); return;}
    const proof = smsValues[purpose];
    if (smsAvailable && (isSmsLogin || isReset || isPhone) && (!proof?.challengeId || !/^\d{6}$/u.test(proof.code))) {
      setFeedback({kind: "error", text: "请获取并填写短信验证码。"}); return;
    }
    if (isPhone && user?.phone && (!smsValues.phone_current?.challengeId || !/^\d{6}$/u.test(smsValues.phone_current.code))) {
      setFeedback({kind: "error", text: "请验证当前绑定的手机号码。"}); return;
    }
    const endpoint = isUsername ? "/api/auth/username" : isReset ? "/api/auth/password/reset" : isPhone ? "/api/auth/phone" : isSmsLogin ? "/api/auth/sms/login" : isPassword ? "/api/auth/password" : isRegister ? "/api/auth/register" : "/api/auth/login";
    const payload = isUsername ? {username: form.username.trim(), password: form.password} : isReset ? {phone: form.phone.trim(), newPassword: form.newPassword, ...proof}
      : isPhone ? {phone: form.phone.trim(), ...proof, currentChallengeId: smsValues.phone_current?.challengeId, currentCode: smsValues.phone_current?.code, oldPassword: form.oldPassword}
      : isSmsLogin ? {phone: form.phone.trim(), acceptedPolicies, ...proof} : isPassword
      ? { oldPassword: form.oldPassword, newPassword: form.newPassword }
      : isRegister
        ? { name: form.name.trim(), username: form.username.trim(), phone: form.phone.trim(), accountType: form.accountType, ...(form.accountType === "TEACHER" ? { teacherCode: form.teacherCode } : {}), password: form.password, acceptedPolicies }
        : { identifier: form.identifier.trim(), password: form.password, acceptedPolicies };

    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => null) as { error?: string; user?: SessionUser; ok?: boolean; registered?: boolean; requiresLogin?: boolean } | null;
      if (!response.ok) {
        setFeedback({ kind: "error", text: data?.error || "暂时无法完成操作，请稍后再试。" });
        return;
      }
      if (isReset && data?.ok) {
        clearPasswords(); setSmsValues({}); setUser(null); setMode("login");
        setFeedback({kind: "success", text: "密码已重置，请使用新密码登录。"}); router.refresh();
      } else if (data?.requiresLogin && ((isRegister && data.registered) || ((isPhone || isPassword || isUsername) && data.ok))) {
        if (isPhone) setForm(current => ({...current, phone: form.phone.trim()}));
        setUser(null); setSmsValues({});
        clearPasswords();
        setMode("login");
        setFeedback({ kind: "success", text: isRegister ? "账号已经创建，请使用刚才的手机号或用户名和密码登录。" : isUsername ? "用户名已设置，请重新登录。" : isPhone ? "手机号已更新，请使用新手机号重新登录。" : "密码已更新，请使用新密码重新登录。" });
        router.refresh();
      } else if (isPassword && data?.ok) {
        clearPasswords();
        setFeedback({ kind: "success", text: "密码已更新，请妥善保管新密码。" });
      } else if (data?.user) {
        if (isLoginMode || isRegister) {
          clearPasswords();
          setSmsValues({});
          router.replace(returnTo === "/games/growth" || data.user.role === "ADMIN" && returnTo ? returnTo : "/lab");
          router.refresh();
          return;
        }
        setUser(data.user);
        setMode("account");
        clearPasswords();
        if (isPhone) setFeedback({kind: "success", text: "绑定手机号已更新，请使用新手机号登录。"});
        if (isUsername) setFeedback({kind: "success", text: "用户名已保存，下次可用用户名或手机号登录。"});
        setSmsValues({});
        router.refresh();
      } else {
        setFeedback({ kind: "error", text: "暂时无法确认操作结果，请稍后再试。" });
      }
    } catch {
      setFeedback({ kind: "error", text: "连接暂时中断了，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Logout failed");
      setUser(null);
      setMode("login");
      setSmsValues({});
      clearPasswords();
      setFeedback({ kind: "success", text: "已退出登录，下次见呀。" });
      router.refresh();
    } catch {
      setFeedback({ kind: "error", text: "退出未完成，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  const passwordAction = (
    <button className={styles.visibility} type="button" disabled={busy}
      aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword}
      onClick={() => setShowPassword((current) => !current)}>
      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  );

  return (
    <main className={styles.page}>
      <link rel="preload" as="image" href="/assets/kexiaobei-auth-blink.webp" />
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="科小贝首页">
          <BrandLogo variant="wordmark" size={56} />
        </Link>
        <Link className={styles.back} href="/"><ArrowLeft size={16} aria-hidden="true" />返回首页</Link>
      </header>

      <div className={styles.content}>
        <section className={styles.intro} aria-labelledby="auth-welcome">
          <h1 id="auth-welcome">一起探索<br /><span>科学的小美好</span></h1>
          <p className={styles.description}>和科小贝一起，<br className={styles.desktopBreak} />把好奇变成有趣的发现。</p>
          <div className={styles.scene}>
            <div className={styles.planet} aria-hidden="true" />
            <div className={styles.orbit} aria-hidden="true" />
            <span className={styles.greeting} aria-hidden="true">{passwordFocused && !showPassword ? "我闭上眼睛，你安心输入～" : isRegister ? "你好呀，新朋友！" : "嗨，准备好一起探索了吗？"}</span>
            <span className={styles.atom} aria-hidden="true"><Atom size={31} strokeWidth={1.6} /></span>
            <span className={styles.book} aria-hidden="true"><BookOpen size={28} strokeWidth={1.6} /></span>
            <Sparkles className={styles.sparkles} size={26} strokeWidth={1.6} aria-hidden="true" />
            <Image className={styles.mascot} src={passwordFocused && !showPassword ? "/assets/kexiaobei-auth-blink.webp" : user ? "/assets/kexiaobei-auth-idle.webp" : "/assets/kexiaobei-auth-wave.webp"} alt={passwordFocused && !showPassword ? "输入密码时闭眼的科小贝" : "挥手欢迎你的科小贝"} width={170} height={210} unoptimized priority />
            <span className={styles.ground} aria-hidden="true" />
          </div>
          <div className={styles.categories} aria-label="探索科学资源">
            <Link href="/lab?type=科学诗"><BookOpen size={17} aria-hidden="true" />科学诗<ArrowRight size={14} aria-hidden="true" /></Link>
            <Link href="/lab?type=科学故事"><Sparkles size={17} aria-hidden="true" />科学故事<ArrowRight size={14} aria-hidden="true" /></Link>
            <Link href="/lab?type=科学实验"><Atom size={17} aria-hidden="true" />科学实验<ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className={styles.card} aria-label="账号中心">
          {!user && isLoginMode && (
            <div className={styles.tabs} data-mode={mode} role="tablist" aria-label="登录方式">
              <span className={styles.tabIndicator} aria-hidden="true" />
              {(["login", "smsLogin"] as const).map((tab) => (
                <button key={tab} id={`auth-tab-${tab}`} role="tab" type="button" disabled={busy}
                  aria-selected={tab === mode} aria-controls="auth-form-panel" tabIndex={tab === mode ? 0 : -1}
                  className={tab === mode ? styles.activeTab : ""} onClick={() => changeMode(tab)}
                  onKeyDown={(event) => {
                    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                      event.preventDefault();
                      const next = event.key === "Home" ? "login" : event.key === "End" ? "smsLogin" : tab === "login" ? "smsLogin" : "login";
                      changeMode(next);
                      document.getElementById(`auth-tab-${next}`)?.focus();
                    }
                  }}>
                  {tab === "login" ? "密码登录" : "验证码登录"}
                </button>
              ))}
            </div>
          )}
          <div className={styles.panel} data-mode={mode} id="auth-form-panel" role={!user && isLoginMode ? "tabpanel" : undefined} aria-labelledby={!user && isLoginMode ? `auth-tab-${mode}` : undefined}>
            {!isSmsLogin && <div className={styles.cardHeading}>
              {user && <span className={styles.accountIcon}><CheckCircle2 size={29} aria-hidden="true" /></span>}
              <h2>{copy[mode].title}<span className={styles.headingDot} aria-hidden="true" /></h2><p>{copy[mode].description}</p>
            </div>}

            {feedback && <p className={`${styles.feedback} ${feedback.kind === "success" ? styles.success : styles.error}`}
              role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>}

            {user && (
              <div className={styles.accountSummary}>
                <span className={styles.avatar}><UserRound size={24} aria-hidden="true" /></span>
                <div><strong>{user.name}</strong><p>{user.username ? `用户名：${user.username}` : "尚未设置用户名"}</p><p>{user.phone || "请联系园方绑定手机号"}</p></div>
                <span className={styles.role}><ShieldCheck size={13} aria-hidden="true" />{user.role === "ADMIN" ? "管理员" : user.accountType === "TEACHER" ? "老师" : user.accountType === "PARENT" ? "家长" : "用户"}</span>
              </div>
            )}
            {user?.role === "USER" && mode === "account" && <p className={styles.helpNote}>{user.identityVerified ? "身份已开通，可以提交作品。作品需经园方审核后展示。" : "欢迎加入！你可以浏览公开资源、体验 AI。本园家长投稿需联系园方完成身份核验。"}</p>}

            {mode === "account" ? (
              <div className={styles.accountActions}>
                <Link className={styles.submit} href={returnTo === "/games/growth" || user?.role === "ADMIN" && returnTo ? returnTo : "/lab"}>{returnTo === "/games/growth" ? "返回成长手册" : user?.role === "ADMIN" && returnTo ? "进入审核中心" : "进入资源库"}<ArrowRight size={18} aria-hidden="true" /></Link>
                {user?.role === "ADMIN" && !returnTo && <Link className={styles.secondary} href="/admin/reviews"><ShieldCheck size={17} aria-hidden="true" />进入审核中心<ArrowRight size={16} aria-hidden="true" /></Link>}
                <button className={styles.secondary} type="button" disabled={busy} onClick={() => changeMode("password")}><LockKeyhole size={17} aria-hidden="true" />修改密码</button>
                <button className={styles.secondary} type="button" disabled={busy} onClick={() => changeMode("username")}><UserRound size={17} aria-hidden="true" />{user?.username ? "修改用户名" : "设置用户名"}</button>
                <button className={styles.secondary} type="button" disabled={busy} onClick={() => changeMode("phone")}><Phone size={17} aria-hidden="true" />{user?.phone ? "修改绑定手机号" : "绑定手机号"}<span className={styles.pendingTag}>{smsAvailable ? "短信验证" : "开通中"}</span></button>
                <button className={styles.textButton} type="button" disabled={busy} onClick={() => void logout()}>{busy ? <LoaderCircle className={styles.spinner} size={16} /> : <LogOut size={16} />}退出登录</button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={(event) => void submit(event)}
                onFocusCapture={(event) => setPasswordFocused(event.target instanceof HTMLInputElement && ["password", "confirmPassword", "oldPassword", "newPassword"].includes(event.target.name))}
                onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPasswordFocused(false); }}>
                <fieldset className={styles.fields} disabled={busy}>
                  {!isPassword && <div className={styles.modeField} data-expanded={isRegister} aria-hidden={!isRegister} inert={!isRegister}><div className={styles.modeFieldInner}><Field icon={UserRound} label="怎么称呼你" name="name" placeholder="请输入姓名或称呼" autoComplete="name" maxLength={50} disabled={!isRegister} required={isRegister} value={form.name} onChange={(event) => update("name", event.target.value)} /></div></div>}
                  {!isPassword && <div className={styles.modeField} data-expanded={isRegister} aria-hidden={!isRegister} inert={!isRegister}><div className={styles.modeFieldInner}>
                    <fieldset className={styles.identityChoices} disabled={!isRegister || busy}>
                      <legend className={styles.label}>我是</legend>
                      <div className={styles.identityGrid}>
                        {([{ value: "PARENT", title: "家长", note: "陪伴孩子的发现", icon: Heart }, { value: "TEACHER", title: "老师", note: "点亮科学的好奇", icon: GraduationCap }]).map(({ value, title, note, icon: Icon }) => <label key={value} className={styles.identityOption} data-selected={form.accountType === value}>
                          <input type="radio" name="accountType" value={value} checked={form.accountType === value} onChange={() => { update("accountType", value); update("teacherCode", ""); }} />
                          <Icon size={22} aria-hidden="true" /><span><strong>{title}</strong><small>{note}</small></span><CheckCircle2 className={styles.identityCheck} size={17} aria-hidden="true" />
                        </label>)}
                      </div>
                    </fieldset>
                    <div className={styles.modeField} data-expanded={isRegister && form.accountType === "TEACHER"} aria-hidden={!isRegister || form.accountType !== "TEACHER"} inert={!isRegister || form.accountType !== "TEACHER"}><div className={styles.modeFieldInner}><Field icon={ShieldCheck} label="老师注册码" name="teacherCode" placeholder="请输入园方提供的注册码" autoComplete="off" maxLength={64} disabled={!isRegister || form.accountType !== "TEACHER"} required={isRegister && form.accountType === "TEACHER"} value={form.teacherCode} onChange={(event) => update("teacherCode", event.target.value)} /></div></div>
                  </div></div>}
                  {isUsername ? <>
                    <Field icon={UserRound} label="用户名" name="username" placeholder="2–24 位中文、字母、数字或下划线" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={2} maxLength={24} required value={form.username} onChange={event => update("username", event.target.value)} />
                    <p className={styles.codeNote}>以中文或字母开头，英文字母不区分大小写。用户名需唯一，姓名或称呼不会作为登录账号。</p>
                    <Field icon={LockKeyhole} label="当前密码" name="password" placeholder="输入当前密码确认" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={128} required value={form.password} onChange={event => update("password", event.target.value)} action={passwordAction} />
                  </> : !isPassword && !isPhone ? <>
                    {mode === "login" ? <Field icon={UserRound} label="用户名" name="identifier" placeholder="请输入用户名或手机号" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={80} required value={form.identifier} onChange={event => update("identifier", event.target.value)} /> : <>
                    {isRegister && <><Field icon={UserRound} label="用户名（选填）" name="username" placeholder="可设置中文、字母、数字或下划线" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={2} maxLength={24} value={form.username} onChange={event => update("username", event.target.value)} /></>}
                    <Field icon={Phone} label="手机号码" name="phone" placeholder="请输入 11 位手机号码" type="tel" inputMode="tel" autoComplete="tel" pattern="1[3-9][0-9]{9}" maxLength={11} required value={form.phone} onChange={(event) => update("phone", event.target.value)} />
                    </>}
                    {(isSmsLogin || isReset) && <SmsCodeField key={`${mode}:${form.phone}`} phone={form.phone.trim()} purpose={purpose} available={smsAvailable} busy={busy} value={smsValues[purpose]} onChange={value => setSmsValues(current => ({...current, [purpose]: value}))} onError={text => setFeedback({kind: "error", text})} />}
                    {!isSmsLogin && !isReset && <Field icon={LockKeyhole} label="密码" name="password" placeholder={isRegister ? "设置密码，至少 8 位" : "请输入密码"} type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 8 : undefined} maxLength={isRegister ? 72 : 128} required value={form.password} onChange={(event) => update("password", event.target.value)} action={passwordAction} />}
                    {isReset && <><Field icon={LockKeyhole} label="新密码" name="newPassword" placeholder="设置新密码，至少 8 位" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required value={form.newPassword} onChange={event => update("newPassword", event.target.value)} action={passwordAction} />
                      <Field icon={LockKeyhole} label="确认新密码" name="confirmPassword" placeholder="再输入一次新密码" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={72} required value={form.confirmPassword} onChange={event => update("confirmPassword", event.target.value)} /></>}
                    {!isReset && <div className={styles.modeField} data-expanded={isRegister} aria-hidden={!isRegister} inert={!isRegister}><div className={styles.modeFieldInner}><Field icon={LockKeyhole} label="确认密码" name="confirmPassword" placeholder="再输入一次密码" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={72} disabled={!isRegister} required={isRegister} value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} /></div></div>}
                  </> : isPhone ? <>
                    {user?.phone ? <><Field icon={Phone} label="当前绑定手机" name="currentPhone" type="tel" value={user.phone} readOnly />
                      <SmsCodeField key={`current:${user.phone}`} phone={user.phone} purpose="phone_current" label="当前手机验证码" available={smsAvailable} busy={busy} value={smsValues.phone_current} onChange={value => setSmsValues(current => ({...current, phone_current: value}))} onError={text => setFeedback({kind: "error", text})} /></>
                      : <Field icon={LockKeyhole} label="账号密码" name="oldPassword" placeholder="验证账号密码" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={128} required value={form.oldPassword} onChange={event => update("oldPassword", event.target.value)} action={passwordAction} />}
                    <Field icon={Phone} label="新手机号码" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="请输入新的 11 位手机号码" pattern="1[3-9][0-9]{9}" maxLength={11} required value={form.phone} onChange={event => update("phone", event.target.value)} />
                    <SmsCodeField key={`new:${form.phone}`} phone={form.phone.trim()} purpose="phone_new" label="新手机验证码" available={smsAvailable} busy={busy} value={smsValues.phone_new} onChange={value => setSmsValues(current => ({...current, phone_new: value}))} onError={text => setFeedback({kind: "error", text})} />
                  </> : <>
                    <Field icon={LockKeyhole} label="原密码" name="oldPassword" placeholder="请输入原密码" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={128} required value={form.oldPassword} onChange={(event) => update("oldPassword", event.target.value)} action={passwordAction} />
                    <Field icon={LockKeyhole} label="新密码" name="newPassword" placeholder="设置新密码，至少 8 位" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required value={form.newPassword} onChange={(event) => update("newPassword", event.target.value)} />
                  </>}
                  {isLoginMode && <div className={styles.helpRow}><button className={styles.helpButton} type="button" onClick={() => changeMode("register")}>注册账号</button><button className={styles.helpButton} type="button" onClick={() => changeMode("reset")}>忘记密码了？</button></div>}
                  {isRegister && form.accountType === "TEACHER" && <p className={styles.helpNote}>老师需凭园方提供的注册码加入，投稿作品经审核后展示。</p>}
                  {requiresPolicyConsent && <label className={styles.policyConsent}>
                    <input name="acceptedPolicies" type="checkbox" checked={acceptedPolicies} onChange={(event) => { setAcceptedPolicies(event.target.checked); setFeedback(null); }} />
                    <span className={styles.policyCheckbox} aria-hidden="true">{acceptedPolicies ? "✓" : ""}</span>
                    <span className={styles.policyCopy}>我已阅读并同意 <Link href="/user-agreement" target="_blank" rel="noreferrer">《用户协议》</Link> 和 <Link href="/privacy-policy" target="_blank" rel="noreferrer">《隐私政策》</Link>，并同意平台为提供登录、注册及相关服务处理必要的个人信息。</span>
                  </label>}
                  <button className={styles.submit} type="submit" aria-busy={busy} disabled={busy || (requiresPolicyConsent && !acceptedPolicies) || ((isSmsLogin || isReset || isPhone) && !smsAvailable)}>
                    {busy ? <><LoaderCircle className={styles.spinner} size={19} aria-hidden="true" />正在处理…</> : <>{copy[mode].action}<ArrowRight size={18} aria-hidden="true" /></>}
                  </button>
                </fieldset>
                {(isPassword || isPhone || isReset || isRegister || isUsername) && <button className={styles.textButton} type="button" disabled={busy} onClick={() => changeMode(user ? "account" : "login")}><ArrowLeft size={16} aria-hidden="true" />{user ? "返回账号中心" : "返回登录"}</button>}
              </form>
            )}
          </div>

        </section>
      </div>
      <p className={styles.school}>龙湾区国科温州第二幼儿园<span aria-hidden="true">·</span>让好奇心慢慢发芽</p>
    </main>
  );
}

function Field({ icon: Icon, label, action, ...input }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof UserRound; label: string; action?: React.ReactNode }) {
  const id = `auth-field-${input.name}`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <span className={styles.inputWrap}>
        <Icon className={styles.inputIcon} size={19} aria-hidden="true" />
        <input {...input} id={id} />
        {action}
      </span>
    </div>
  );
}
