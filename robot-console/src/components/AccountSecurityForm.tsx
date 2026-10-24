"use client";

import {useEffect, useState, type FormEvent} from "react";
import type {SessionUser} from "@/lib/auth";
import {normalizeUsername} from "@/lib/username";
import {SmsCodeField, type SmsCodeValue} from "./SmsCodeField";
import styles from "./AccountMenu.module.css";

export type AccountSecurityView = "username" | "password" | "phone";
export function AccountSecurityForm({view, user, busy, setBusy, onSaved, onCancel}: {
  view: AccountSecurityView; user: SessionUser; busy: boolean; setBusy: (value: boolean) => void;
  onSaved: (user?: SessionUser) => void; onCancel: () => void;
}) {
  const [username, setUsername] = useState(user.username || "");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [phone, setPhone] = useState("");
  const [currentProof, setCurrentProof] = useState<SmsCodeValue>();
  const [newProof, setNewProof] = useState<SmsCodeValue>();
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [smsStatus, setSmsStatus] = useState("正在确认短信服务…");
  const [notice, setNotice] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);

  useEffect(() => {
    if (view !== "phone") return;
    const controller = new AbortController();
    void fetch("/api/auth/sms", {cache: "no-store", signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json() as {available?: boolean};
        if (!controller.signal.aborted) {
          setSmsAvailable(result.available === true);
          setSmsStatus(result.available ? "" : "短信服务暂不可用，请稍后重试。");
        }
      }).catch(() => {if (!controller.signal.aborted) setSmsStatus("暂时无法确认短信服务，请关闭弹窗后重试。");});
    return () => controller.abort();
  }, [view]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || requiresLogin) return;
    setNotice("");
    if (view === "username" && !normalizeUsername(username)) {setNotice("用户名需为 2 至 24 位中文、字母、数字或下划线，以中文或字母开头。"); return;}
    if (view === "password" && newPassword !== confirmation) {setNotice("两次输入的新密码不一致。"); return;}
    if (view === "phone") {
      if (!smsAvailable) {setNotice("短信服务暂不可用，请稍后重试。"); return;}
      if (!newProof?.challengeId || !/^\d{6}$/u.test(newProof.code) || (user.phone && (!currentProof?.challengeId || !/^\d{6}$/u.test(currentProof.code)))) {
        setNotice("请获取并填写" + (user.phone ? "当前手机和新手机的" : "新手机的") + "验证码。"); return;
      }
    }
    setBusy(true);
    try {
      const body = view === "username" ? {username: username.trim()}
        : view === "password" ? {oldPassword: password, newPassword}
        : {phone: phone.trim(), ...newProof, currentChallengeId: currentProof?.challengeId, currentCode: currentProof?.code, oldPassword: password};
      const response = await fetch(`/api/auth/${view}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal: AbortSignal.timeout(20000)});
      const result = await response.json() as {ok?: boolean; user?: SessionUser; error?: string; requiresLogin?: boolean};
      if (!response.ok || !result.ok) throw new Error(result.error || "保存未完成，请稍后重试。");
      setPassword(""); setNewPassword(""); setConfirmation(""); setCurrentProof(undefined); setNewProof(undefined);
      if (result.requiresLogin) {setRequiresLogin(true); return;}
      onSaved(result.user);
    } catch (error) {setNotice(error instanceof Error ? error.message : "连接暂时中断，请稍后重试。");}
    finally {setBusy(false);}
  }

  if (requiresLogin) return <p className={styles.help} role="status">修改已保存，请<a href="/auth">重新登录</a>后继续使用。</p>;
  return <form onSubmit={event => void save(event)}>
    <fieldset className={styles.fields} disabled={busy}>
      {view === "username" && <>
        <label className={styles.nameLabel}>用户名<input name="username" autoComplete="username" required minLength={2} maxLength={24} value={username} onChange={event => setUsername(event.target.value)} /></label>
        <p className={styles.help}>2–24 位，以中文或字母开头，可包含数字和下划线。设置后可用用户名或手机号登录。</p>
      </>}
      {(view === "password" || (view === "phone" && !user.phone)) && <label className={styles.nameLabel}>{view === "password" ? "原密码" : "当前密码"}<input name="oldPassword" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>}
      {view === "password" && <>
        <label className={styles.nameLabel}>新密码<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label className={styles.nameLabel}>确认新密码<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <p className={styles.help}>密码至少 8 位。保存后其他设备需要重新登录。</p>
      </>}
      {view === "phone" && <>
        {user.phone && <>
          <p className={styles.help}>当前绑定：{user.phone.replace(/^(\d{3})\d{4}(\d{4})$/u, "$1****$2")}</p>
          {smsAvailable && <SmsCodeField phone={user.phone} purpose="phone_current" label="当前手机验证码" available busy={busy} value={currentProof} onChange={setCurrentProof} onError={setNotice} />}
        </>}
        <label className={styles.nameLabel}>新手机号<input name="phone" type="tel" autoComplete="tel" inputMode="numeric" required pattern="1[3-9][0-9]{9}" maxLength={11} value={phone} onChange={event => {setPhone(event.target.value); setNewProof(undefined);}} /></label>
        {smsAvailable && <SmsCodeField key={phone} phone={phone.trim()} purpose="phone_new" label="新手机验证码" available busy={busy} value={newProof} onChange={setNewProof} onError={setNotice} />}
        {smsStatus && <p className={styles.help} role="status">{smsStatus}</p>}
        <p className={styles.help}>验证通过后更新绑定号码，其他设备需要重新登录。</p>
      </>}
      {notice && <p className={styles.error} role="alert">{notice}</p>}
      <div className={styles.actions}><button type="button" className={styles.cancel} onClick={onCancel}>取消</button><button type="submit" className={styles.save} disabled={busy || (view === "phone" && !smsAvailable)}>{busy ? "正在保存…" : "保存"}</button></div>
    </fieldset>
  </form>;
}
