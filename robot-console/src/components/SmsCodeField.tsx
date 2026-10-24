"use client";
import {useEffect, useRef, useState} from "react";
import {LoaderCircle, MessageSquare} from "lucide-react";
import type {SmsPurpose} from "@/lib/sms/config";
import styles from "./AuthPanel.module.css";
export type SmsCodeValue = {challengeId: string; code: string};
export function SmsCodeField({phone, purpose, available, busy, label = "短信验证码", value, onChange, onError}: {
  phone: string; purpose: SmsPurpose; available: boolean; busy: boolean; label?: string; value?: SmsCodeValue;
  onChange: (value: SmsCodeValue) => void; onError: (message: string) => void;
}) {
  const [sending, setSending] = useState(false); const [remaining, setRemaining] = useState(0); const [deadline, setDeadline] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {alive.current = true; return () => {alive.current = false; controller.current?.abort();};}, []);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => {const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemaining(next); if (!next) clearInterval(timer);}, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  async function send() {
    if (sending || busy || remaining || !available) return;
    const current = new AbortController(); controller.current = current; setSending(true);
    const timeout = setTimeout(() => current.abort(), 20000);
    try {
      const response = await fetch("/api/auth/sms/send", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({phone, purpose}), signal: current.signal});
      const result = await response.json() as {error?: string; challengeId?: string; retryAfter?: number};
      if (!alive.current || current.signal.aborted) return;
      if (!response.ok || !result.challengeId) {
        const retry = Number(response.headers.get("retry-after"));
        if (retry > 0) {setRemaining(retry); setDeadline(Date.now() + retry * 1000);}
        onError(result.error || "短信暂时无法发送，请稍后重试。"); return;
      }
      const retry = result.retryAfter || 60; setRemaining(retry); setDeadline(Date.now() + retry * 1000);
      onChange({challengeId: result.challengeId, code: ""});
    } catch {if (alive.current) onError(current.signal.aborted ? "发送请求超时，请稍后重试。" : "连接暂时中断，请稍后重试。");}
    finally {clearTimeout(timeout); if (alive.current) setSending(false);}
  }
  return <div className={styles.field}>
    <label className={styles.label} htmlFor={`sms-code-${purpose}`}>{label}</label>
    <span className={styles.inputWrap}>
      <MessageSquare className={styles.inputIcon} size={19} aria-hidden="true" />
      <input id={`sms-code-${purpose}`} name={`smsCode-${purpose}`} placeholder="6 位验证码" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        disabled={!available || busy} required={available} value={value?.code || ""} onChange={event => onChange({challengeId: value?.challengeId || "", code: event.target.value.replace(/\D/gu, "")})} />
      <button className={styles.codeButton} type="button" disabled={!available || busy || sending || remaining > 0 || !/^1[3-9]\d{9}$/u.test(phone)} onClick={() => void send()}>
        {sending ? <LoaderCircle className={styles.spinner} size={16} aria-label="正在发送" /> : remaining ? `${remaining}秒后重发` : "获取验证码"}
      </button>
    </span>
    {(!available || (remaining > 0 && value?.challengeId)) && <p className={styles.codeNote} role="status">{!available ? "短信服务开通后可用" : "验证码已发送，5 分钟内有效。"}</p>}
  </div>;
}
