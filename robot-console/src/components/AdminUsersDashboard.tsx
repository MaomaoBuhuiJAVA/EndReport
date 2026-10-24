"use client";

import {useCallback, useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {ChevronLeft, ChevronRight, Clock3, LogOut, Search, ShieldCheck, Users} from "lucide-react";
import styles from "./AdminUsers.module.css";

type AdminUser = {id: string; name: string; username: string | null; phone: string | null; role: "ADMIN" | "USER"; accountType: "PARENT" | "TEACHER" | null; phoneVerified: boolean; createdAt: string; lastLoginAt: string | null; lastLoginMethod: "password" | "sms" | null};
type UserResponse = {users: AdminUser[]; total: number; page: number; pageSize: number};

function formatDate(value: string | null) {
  if (!value) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", {year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false}).format(new Date(value));
}

export function AdminUsersDashboard({adminName}: {adminName: string}) {
  const router = useRouter();
  const [data, setData] = useState<UserResponse | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (page: number, term: string) => {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({page: String(page), q: term});
      const response = await fetch(`/api/admin/users?${params}`, {cache: "no-store"});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "用户列表加载失败");
      setData(result);
    } catch (reason) {setError(reason instanceof Error ? reason.message : "用户列表加载失败");}
    finally {setBusy(false);}
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {void load(1, "");}, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function logout() {
    await fetch("/api/admin/auth/logout", {method: "POST"});
    router.refresh();
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return <main className={styles.dashboardPage}>
    <div className={styles.desktopOnly}>请在电脑浏览器中打开管理员页面。</div>
    <div className={styles.dashboard}>
      <header className={styles.topbar}>
        <div className={styles.brand}><span className={styles.brandIcon}><ShieldCheck size={20} aria-hidden="true" /></span><span>管理后台</span><span className={styles.divider} /><span className={styles.muted}>用户账号</span></div>
        <div className={styles.adminTools}><span className={styles.adminIdentity}>{adminName} · 管理员</span><button type="button" className={styles.iconButton} title="退出管理员验证" aria-label="退出管理员验证" onClick={logout}><LogOut size={17} /></button></div>
      </header>
      <section className={styles.content}>
        <div className={styles.pageHeading}>
          <div><p className={styles.eyebrow}>ACCOUNT DIRECTORY</p><h1>用户账号</h1><p className={styles.subheading}>注册资料与最近登录记录</p></div>
          <div className={styles.total}><Users size={17} aria-hidden="true" /><span>{data?.total ?? "—"} 个账号</span></div>
        </div>
        <div className={styles.toolbar}>
          <form className={styles.search} onSubmit={event => {event.preventDefault(); setSearch(query.trim()); void load(1, query.trim());}}>
            <Search size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名、用户名或手机号" aria-label="搜索姓名、用户名或手机号" />
            <button type="submit" disabled={busy}>搜索</button>
          </form>
          <p className={styles.credentialNote}><ShieldCheck size={15} aria-hidden="true" />密码不展示，账号凭据采用哈希存储</p>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>用户</th><th>手机号</th><th>身份</th><th>注册时间</th><th>最近登录</th><th>登录方式</th><th>验证状态</th></tr></thead>
            <tbody>
              {data?.users.map(user => <tr key={user.id}>
                <td><div className={styles.name}>{user.name}</div><div className={styles.username}>{user.username ? `@${user.username}` : "未设置用户名"}</div></td>
                <td className={styles.phone}>{user.phone || "未绑定"}</td>
                <td>{user.role === "ADMIN" ? <span className={styles.adminRole}>管理员</span> : user.accountType === "TEACHER" ? "老师" : user.accountType === "PARENT" ? "家长" : "用户"}</td>
                <td className={styles.date}>{formatDate(user.createdAt)}</td>
                <td className={styles.date}>{formatDate(user.lastLoginAt)}</td>
                <td>{user.lastLoginMethod === "sms" ? "短信验证码" : user.lastLoginMethod === "password" ? "密码" : "暂无记录"}</td>
                <td><span className={user.phoneVerified ? styles.verified : styles.unverified}><span />{user.phoneVerified ? "手机已验证" : "未验证"}</span></td>
              </tr>)}
              {!busy && data?.users.length === 0 && <tr><td colSpan={7} className={styles.empty}>没有找到匹配的用户</td></tr>}
              {busy && <tr><td colSpan={7} className={styles.empty}><Clock3 size={16} />正在加载账号</td></tr>}
              {error && <tr><td colSpan={7} className={styles.empty}>{error}</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className={styles.tableFooter}><span>{data ? `第 ${data.page} / ${pageCount} 页` : ""}</span><div><button className={styles.iconButton} title="上一页" aria-label="上一页" disabled={!data || data.page <= 1 || busy} onClick={() => data && void load(data.page - 1, search)}><ChevronLeft size={18} /></button><button className={styles.iconButton} title="下一页" aria-label="下一页" disabled={!data || data.page >= pageCount || busy} onClick={() => data && void load(data.page + 1, search)}><ChevronRight size={18} /></button></div></footer>
      </section>
    </div>
  </main>;
}
