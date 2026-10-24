"use client";

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowRight, LoaderCircle, ShieldCheck} from "lucide-react";
import styles from "./AdminUsers.module.css";

const ADMIN_PHONE = "13967719299";

export function AdminSmsGate() {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/sms", {cache: "no-store"}).then(response => response.json()).then(data => setAvailable(data.available === true)).catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/auth/send-code", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({phone: ADMIN_PHONE})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "验证码发送失败");
      setChallengeId(data.challengeId); setCooldown(data.retryAfter || 60); setMessage("验证码已发送，请查看管理员手机。 ");
    } catch (error) {setMessage(error instanceof Error ? error.message : "验证码发送失败，请稍后重试。");}
    finally {setBusy(false);}
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/auth/verify", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({phone: ADMIN_PHONE, challengeId, code})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "验证码验证失败");
      router.refresh();
    } catch (error) {setMessage(error instanceof Error ? error.message : "验证码验证失败，请重试。 ");}
    finally {setBusy(false);}
  }

  return <main className={styles.gatePage}>
    <div className={styles.desktopOnly}>请在电脑浏览器中打开管理员页面。</div>
    <section className={styles.gate} aria-labelledby="admin-gate-title">
      <div className={styles.gateIcon}><ShieldCheck size={22} aria-hidden="true" /></div>
      <p className={styles.eyebrow}>ADMIN ACCESS</p>
      <h1 id="admin-gate-title">管理员验证</h1>
      <p className={styles.gateDescription}>验证码将发送至管理员绑定手机 <strong>139****9299</strong></p>
      <form onSubmit={verify}>
        <label className={styles.label} htmlFor="admin-sms-code">短信验证码</label>
        <div className={styles.codeRow}>
          <input id="admin-sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={event => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} placeholder="输入 6 位验证码" />
          <button type="button" className={styles.sendButton} onClick={sendCode} disabled={!available || busy || cooldown > 0}>
            {busy && !challengeId ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : null}
            {cooldown > 0 ? `${cooldown}s` : challengeId ? "重新获取" : "获取验证码"}
          </button>
        </div>
        <button className={styles.verifyButton} type="submit" disabled={busy || !challengeId || code.length !== 6}>
          {busy ? <LoaderCircle size={17} className={styles.spin} aria-hidden="true" /> : <>验证并进入<ArrowRight size={17} aria-hidden="true" /></>}
        </button>
        <p className={message && !message.includes("已发送") ? styles.error : styles.feedback} aria-live="polite">{message || (!available ? "短信服务暂不可用" : "")}</p>
      </form>
    </section>
  </main>;
}
