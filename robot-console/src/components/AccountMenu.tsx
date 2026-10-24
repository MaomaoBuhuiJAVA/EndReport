"use client";

/* Uploaded avatars are served by the authenticated same-origin avatar endpoint. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {useRouter} from "next/navigation";
import {createPortal} from "react-dom";
import {useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent} from "react";
import {ChevronDown, ImagePlus, KeyRound, LoaderCircle, LogOut, Phone, ShieldCheck, UserRound, X} from "lucide-react";
import type {SessionUser} from "@/lib/auth";
import {ACCOUNT_AVATARS, isPresetAvatar} from "@/lib/account-avatar";
import {AccountSecurityForm, type AccountSecurityView} from "./AccountSecurityForm";
import styles from "./AccountMenu.module.css";

const mobileQuery = "(max-width: 720px)";
const subscribeMobile = (onChange: () => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;

function Avatar({user}: {user: SessionUser}) {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  if (user.avatarKey?.startsWith("upload_") && failedKey !== user.avatarKey) {
    return <img src={`/api/auth/avatar?v=${encodeURIComponent(user.id + ":" + user.avatarKey)}`} alt="" onError={() => setFailedKey(user.avatarKey || null)} />;
  }
  const preset = ACCOUNT_AVATARS.find(item => item.key === user.avatarKey) || ACCOUNT_AVATARS[0];
  return <span className={styles.avatarSymbol} style={{backgroundColor: preset.color}} aria-hidden="true">{preset.symbol}</span>;
}

export function AccountMenu({initialUser}: {initialUser?: SessionUser | null}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null | undefined>(initialUser);
  const [view, setView] = useState<"profile" | "avatar" | AccountSecurityView | null>(null);
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const isMobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, serverSnapshot);

  useEffect(() => () => {if (hoverTimer.current) clearTimeout(hoverTimer.current);}, []);

  function hoverOpen(pointerType: string) {
    if (isMobile || pointerType !== "mouse" || view) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (details.current) {delete details.current.dataset.closing; details.current.open = true;}
  }

  function hoverClose(pointerType: string) {
    if (isMobile || pointerType !== "mouse" || !details.current?.open) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      // Keyboard focus keeps the menu available when the pointer moves away.
      if (!details.current || details.current.contains(document.activeElement)) return;
      details.current.dataset.closing = "true";
      hoverTimer.current = setTimeout(() => {
        if (details.current) {details.current.open = false; delete details.current.dataset.closing;}
      }, 140);
    }, 180);
  }

  useEffect(() => {
    if (initialUser !== undefined) return;
    const controller = new AbortController();
    void fetch("/api/auth/me", {cache: "no-store", signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw new Error("Session unavailable");
        const data = await response.json() as {user: SessionUser | null};
        if (!controller.signal.aborted) setUser(data.user);
      })
      .catch(() => {if (!controller.signal.aborted) setUser(null);});
    return () => controller.abort();
  }, [initialUser]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target) && details.current) details.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && details.current?.open && !view) {
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);};
  }, [view]);

  useEffect(() => {
    if (view && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector<HTMLInputElement>('input:not([type="file"]):not([type="radio"])')?.focus();
    }
  }, [view, isMobile]);

  function edit(next: "profile" | "avatar" | AccountSecurityView) {
    if (!user) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    trigger.current = details.current?.querySelector("summary") || null;
    if (details.current) details.current.open = false;
    setName(user.name);
    setSelectedAvatar(user.avatarKey || "sprout");
    setNotice("");
    setView(next);
  }

  function closeDialog() {
    if (busy) return;
    dialog.current?.close();
    setView(null);
    setNotice("");
    trigger.current?.focus();
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !user) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/auth/profile", {method: "PATCH", headers: {"Content-Type": "application/json"},
        body: JSON.stringify(view === "profile" ? {name: name.trim()} : {avatarKey: selectedAvatar}), signal: AbortSignal.timeout(20000)});
      const result = await response.json() as {user?: SessionUser; error?: string};
      if (!response.ok || !result.user) throw new Error(result.error || "资料暂时无法保存，请稍后重试。");
      setUser(result.user); dialog.current?.close(); setView(null); router.refresh();
      trigger.current?.focus();
    } catch (error) {setNotice(error instanceof Error ? error.message : "资料暂时无法保存，请稍后重试。");}
    finally {setBusy(false);}
  }

  async function uploadAvatar(file: File) {
    if (busy) return;
    if (!file.size || file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("请选择不超过 3 MB 的 JPG、PNG 或 WebP 图片。"); return;
    }
    setBusy(true); setNotice("");
    try {
      const body = new FormData(); body.set("avatar", file);
      const response = await fetch("/api/auth/avatar", {method: "POST", body, signal: AbortSignal.timeout(20000)});
      const result = await response.json() as {user?: SessionUser; error?: string};
      if (!response.ok || !result.user) throw new Error(result.error || "头像上传失败，请稍后重试。");
      setUser(result.user); dialog.current?.close(); setView(null); router.refresh();
      trigger.current?.focus();
    } catch (error) {setNotice(error instanceof Error ? error.message : "头像上传失败，请稍后重试。");}
    finally {setBusy(false);}
  }

  async function logout() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/auth/logout", {method: "POST", signal: AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error("退出未完成，请稍后重试。");
      setUser(null); if (details.current) details.current.open = false; router.refresh();
    } catch {setNotice("退出未完成，请稍后重试。");}
    finally {setBusy(false);}
  }

  const content = <div ref={root} className={`${styles.root}${isMobile ? ` ${styles.mobile}` : ""}`}>
    {user === undefined ? <span className={styles.loading} aria-label="正在确认登录状态"><LoaderCircle size={19} /></span> : !user ?
      <Link className={styles.login} href="/auth">登录 / 注册</Link> : <>
        <details className={styles.details} ref={details} onPointerEnter={event => hoverOpen(event.pointerType)} onPointerLeave={event => hoverClose(event.pointerType)}
          onBlur={event => {
            // Touch browsers can blur the summary without focusing the tapped
            // button. Keep it mounted until its click; outside taps close above.
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
          }}>
          <summary className={styles.trigger} aria-label={`${user.name}的账号菜单`}>
            <span className={styles.avatar}><Avatar user={user} /></span><ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className={styles.dropdown}>
            <div className={styles.identity}><strong>{user.name}</strong><span>{user.phone ? user.phone.replace(/^(\d{3})\d{4}(\d{4})$/u, "$1****$2") : "个人账号"}</span></div>
            <button type="button" disabled={busy} onClick={() => edit("username")}><UserRound size={17} aria-hidden="true" />修改用户名</button>
            <button type="button" disabled={busy} onClick={() => edit("profile")}><UserRound size={17} aria-hidden="true" />修改昵称</button>
            <button type="button" disabled={busy} onClick={() => edit("avatar")}><ImagePlus size={17} aria-hidden="true" />修改头像</button>
            <button type="button" disabled={busy} onClick={() => edit("password")}><KeyRound size={17} aria-hidden="true" />修改密码</button>
            <button type="button" disabled={busy} onClick={() => edit("phone")}><Phone size={17} aria-hidden="true" />{user.phone ? "修改绑定手机号" : "绑定手机号"}</button>
            <Link href="/works"><UserRound size={17} aria-hidden="true" />作品与成长档案</Link>
            {user.role === "ADMIN" && <Link href="/admin/reviews"><ShieldCheck size={17} aria-hidden="true" />审核中心</Link>}
            <button className={styles.logout} type="button" disabled={busy} onClick={() => void logout()}><LogOut size={17} aria-hidden="true" />{busy ? "正在退出…" : "退出登录"}</button>
            {notice && !view && <p className={styles.error} role="alert">{notice}</p>}
          </div>
        </details>
        {view && <dialog className={styles.dialog} ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => {event.preventDefault(); closeDialog();}}>
          <div className={styles.dialogHeading}><h2 id={`${id}-title`}>{{profile: "修改昵称", avatar: "修改头像", username: "修改用户名", password: "修改密码", phone: user.phone ? "修改绑定手机号" : "绑定手机号"}[view]}</h2><button type="button" aria-label="关闭" disabled={busy} onClick={closeDialog}><X size={20} /></button></div>
          {view === "username" || view === "password" || view === "phone" ? <AccountSecurityForm key={view} view={view} user={user} busy={busy} setBusy={setBusy} onCancel={closeDialog} onSaved={updated => {
            if (updated) setUser(current => current ? {...current, ...updated} : updated);
            dialog.current?.close(); setView(null); router.refresh(); trigger.current?.focus();
          }} /> : <form onSubmit={event => void saveProfile(event)}>
            <fieldset disabled={busy} className={styles.fields}>
              {view === "profile" ? <label className={styles.nameLabel}>昵称<input name="name" autoComplete="nickname" required maxLength={50} value={name} onChange={event => setName(event.target.value)} /></label> : <>
                <span className={`${styles.avatar} ${styles.preview}`}><Avatar user={user} /></span>
                <label className={styles.upload}><ImagePlus size={18} aria-hidden="true" />上传自己的图片<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传头像" onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadAvatar(file);}} /></label>
                <p className={styles.note}>支持 JPG、PNG、WebP，最大 3 MB</p>
                <div className={styles.presets} role="radiogroup" aria-label="选择系统头像">{ACCOUNT_AVATARS.map(avatar => <label key={avatar.key} className={styles.preset} style={{backgroundColor: avatar.color}}><input type="radio" name="avatar" value={avatar.key} checked={selectedAvatar === avatar.key} onChange={() => setSelectedAvatar(avatar.key)} /><span aria-hidden="true">{avatar.symbol}</span><small>{avatar.label}</small></label>)}</div>
              </>}
              {notice && <p className={styles.error} role="alert">{notice}</p>}
              <div className={styles.actions}><button className={styles.cancel} type="button" onClick={closeDialog}>取消</button><button className={styles.save} type="submit" disabled={busy || (view === "avatar" && !isPresetAvatar(selectedAvatar))}>{busy ? "正在保存…" : "保存"}</button></div>
            </fieldset>
          </form>}
        </dialog>}
      </>}
  </div>;
  return isMobile ? createPortal(content, document.body) : content;
}
