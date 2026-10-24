"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight, BookOpenCheck, Check, CheckCircle2, ChevronLeft,
  ChevronRight, Clock3, Download, FileText, ImageIcon, Inbox, LoaderCircle,
  LockKeyhole, RefreshCw, RotateCcw, Search, ShieldCheck, UserRound, Video, X,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import type { ReviewFilter, ReviewList, ReviewStatus, ReviewWork } from "@/lib/review-types";
import styles from "./ReviewDashboard.module.css";

const labels: Record<ReviewStatus, string> = { PENDING: "待审核", APPROVED: "已通过", REJECTED: "已退回" };
const filters: ReviewFilter[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];
const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function date(value: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return formatter.format(new Date(value));
}
function fileSize(bytes: number | null) {
  if (bytes === null) return "大小未记录";
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function mediaUrl(value: string | null) {
  if (!value) return "";
  try {
    if (value.startsWith("//")) return "";
    const url = value.startsWith("/") ? new URL(value, "https://local.invalid") : new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? value : "";
  } catch { return ""; }
}
function StatusBadge({ status }: { status: ReviewStatus }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{status === "PENDING" ? <Clock3 size={13} /> : status === "APPROVED" ? <CheckCircle2 size={13} /> : <RotateCcw size={13} />}{labels[status]}</span>;
}
function FilePreview({ work }: { work: ReviewWork }) {
  const url = mediaUrl(work.mediaUrl);
  if (!url) return <div className={styles.filePlaceholder}><FileText size={42} /><strong>暂时无法读取文件</strong><p>请核对附件后再进行审核。</p></div>;
  if (work.mimeType.startsWith("image/")) {
    // Submission hosts vary; an ordinary image keeps the allowlist for Next images narrow.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.previewImage} src={url} alt={work.title} />;
  }
  if (work.mimeType.startsWith("video/")) return <video className={styles.previewVideo} controls playsInline preload="metadata" src={url} aria-label={work.title} />;
  if (work.mimeType.startsWith("audio/")) return <div className={styles.filePlaceholder}><FileText size={42} /><strong>{work.fileName}</strong><audio controls src={url} aria-label={work.title} /></div>;
  if (work.mimeType === "application/pdf") return <object className={styles.pdf} type="application/pdf" data={url} aria-label={`${work.title} PDF 预览`}><div className={styles.filePlaceholder}><FileText size={42} /><p>浏览器未能显示 PDF，请打开附件查看。</p><a href={url} target="_blank" rel="noopener noreferrer">打开 PDF</a></div></object>;
  return <div className={styles.filePlaceholder}><FileText size={44} /><strong>{work.fileName}</strong><p>此类文件请打开附件，查看完整内容后再审核。</p><a href={url} target="_blank" rel="noopener noreferrer"><Download size={16} />打开附件</a></div>;
}

export function ReviewDashboard({ reviewerName }: { reviewerName: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ReviewFilter>("PENDING");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReviewList | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<ReviewWork | null>(null);
  const [visibility, setVisibility] = useState("teacher");
  const [note, setNote] = useState("");
  const [addToLibrary, setAddToLibrary] = useState(false);
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const sequence = useRef(0);
  const decisionBusy = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++sequence.current;
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({ status: filter, q: query, page: String(page) });
      const response = await fetch(`/api/admin/reviews?${params}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
      if (requestId !== sequence.current) return;
      if (response.status === 401) { router.push("/auth?next=/admin/reviews"); return; }
      const payload = await response.json().catch(() => null) as (ReviewList & { error?: string }) | null;
      if (requestId !== sequence.current || signal?.aborted) return;
      if (!response.ok || !payload || !Array.isArray(payload.works)) throw new Error(payload?.error || "列表暂时无法加载，请重试。");
      const lastPage = Math.max(1, Math.ceil(payload.total / payload.pageSize));
      if (page > lastPage) { setPage(lastPage); return; }
      setData(payload);
    } catch (error) {
      if (signal?.aborted || requestId !== sequence.current) return;
      setListError(error instanceof TypeError ? "网络连接暂时中断，请重试。" : error instanceof Error && error.name !== "TimeoutError" ? error.message : "连接超时了，请重试。");
    } finally {
      if (requestId === sequence.current && !signal?.aborted) setLoading(false);
    }
  }, [filter, query, page, router]);

  useEffect(() => {
    const controller = new AbortController();
    const task = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => { window.clearTimeout(task); controller.abort(); };
  }, [load]);
  useEffect(() => {
    const element = dialog.current;
    if (selected && element && !element.open) element.showModal();
    if (!selected && element?.open) element.close();
  }, [selected]);

  function open(work: ReviewWork) {
    setSelected(work); setVisibility("teacher"); setNote("");
    setAddToLibrary(false); setConfirmation(null); setDetailError("");
  }
  function close() { if (!decisionBusy.current) setSelected(null); }
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setQuery(draftQuery.trim()); setPage(1); setNotice(""); }
  function prepare(action: "approve" | "reject") {
    if (action === "reject" && !note.trim()) { setDetailError("写一句退回原因，帮助投稿人完善内容吧。"); noteRef.current?.focus(); return; }
    setDetailError(""); setConfirmation(action);
  }
  async function decide() {
    if (!selected || !confirmation || decisionBusy.current) return;
    decisionBusy.current = true; setBusy(true); setDetailError("");
    try {
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(selected.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ action: confirmation, visibility, reviewNote: note.trim(), addToLibrary: confirmation === "approve" && addToLibrary, expectedUpdatedAt: selected.updatedAt }),
      });
      const result = await response.json().catch(() => null) as { error?: string; ok?: boolean } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "审核未完成，请稍后重试。");
      setSelected(null);
      setNotice(confirmation === "approve" ? visibility === "public" ? "投稿已通过，并公开展示。" : "投稿已通过，保留为内部资料。" : "投稿已退回，修改意见已保存。");
      await load();
    } catch (error) {
      setDetailError(error instanceof TypeError ? "网络连接暂时中断，请刷新列表确认审核结果。" : error instanceof Error && error.name !== "TimeoutError" ? error.message : "连接超时，请刷新列表确认审核结果后再操作。");
      setConfirmation(null);
    } finally { decisionBusy.current = false; setBusy(false); }
  }

  const counts = data?.counts;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 12)));
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><BrandLogo size={42} /><span><strong>科小贝 · 审核中心</strong><small>投稿与作品管理</small></span></Link>
        <nav aria-label="审核中心导航"><Link href="/works">作品展示<ArrowRight size={15} /></Link><Link className={styles.user} href="/auth"><UserRound size={16} /><span>{reviewerName}</span></Link></nav>
      </header>
      <div className={styles.main}>
        <div className={styles.pageHeading}><div><h1>投稿审核<span className={styles.titleDot} /></h1><p>认真看见每一份探索，让值得分享的发现被更多人看见。</p></div><span className={styles.access}><ShieldCheck size={16} />仅审核管理员可访问</span></div>
        <div className={styles.stats} aria-label="投稿状态统计">
          <Stat label="待审核" number={counts?.PENDING} icon={Clock3} tone="amber" description="等待你的查看与反馈" />
          <Stat label="已通过" number={counts?.APPROVED} icon={CheckCircle2} tone="green" description="已确认内容与展示范围" />
          <Stat label="已退回" number={counts?.REJECTED} icon={RotateCcw} tone="coral" description="修改意见已保留" />
        </div>
        {notice && <p className={styles.notice} role="status"><CheckCircle2 size={17} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="关闭提示"><X size={15} /></button></p>}
        <section className={styles.listPanel} aria-label="投稿列表">
          <div className={styles.toolbar}><div><h2>审核列表</h2><p>先查看附件，再确认展示范围。</p></div><form className={styles.search} onSubmit={search}><Search size={17} /><input aria-label="搜索投稿" placeholder="搜索标题、投稿人或班级" value={draftQuery} maxLength={100} onChange={(event) => setDraftQuery(event.target.value)} /><button type="submit">搜索</button></form></div>
          <div className={styles.filterRow}><div className={styles.filters} aria-label="按审核状态筛选">{filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} className={filter === item ? styles.activeFilter : ""} onClick={() => { setFilter(item); setPage(1); setNotice(""); }}>{item === "ALL" ? "全部投稿" : labels[item]}<span>{counts ? item === "ALL" ? counts.PENDING + counts.APPROVED + counts.REJECTED : counts[item] : "—"}</span></button>)}</div><button className={styles.refresh} type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? styles.spin : ""} />刷新</button></div>
          {query && <div className={styles.query}>搜索“{query}”<button type="button" onClick={() => { setDraftQuery(""); setQuery(""); setPage(1); }}><X size={13} />清除搜索</button></div>}
          {loading ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} size={30} /><strong>正在加载投稿…</strong></div> : listError ? <div className={styles.empty} role="alert"><Inbox size={34} /><strong>列表暂时无法加载</strong><p>{listError}</p><button className={styles.outlineButton} type="button" onClick={() => void load()}>重新加载</button></div> : !data?.works.length ? <div className={styles.empty}><Image alt="科小贝陪你等待新的发现" src="/assets/kexiaobei-auth-wave.webp" width={91} height={112} /><strong>{query ? "暂时没有匹配的投稿" : filter === "PENDING" ? "暂时没有待审核投稿" : "这里还没有投稿记录"}</strong><p>{query ? "换个关键词，或清除搜索再看看。" : filter === "PENDING" ? "新的探索提交后，会出现在这里等你查看。" : "处理过的投稿会保留在对应分类中。"}</p><Link href="/works">查看作品展示<ArrowRight size={15} /></Link></div> : <>
            <div className={styles.tableHeader} aria-hidden="true"><span>投稿内容</span><span>投稿人 / 班级</span><span>提交时间</span><span>状态</span><span>操作</span></div>
            <ul className={styles.rows}>{data.works.map((work) => <li className={styles.row} key={work.id}>
              <div className={styles.workCell}><div className={styles.thumbnail}>{work.mimeType.startsWith("image/") && mediaUrl(work.thumbnailUrl || work.mediaUrl) ?
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(work.thumbnailUrl || work.mediaUrl)} alt="" loading="lazy" /> : work.mimeType.startsWith("video/") ? <Video size={24} /> : work.mimeType.startsWith("image/") ? <ImageIcon size={24} /> : <FileText size={24} />}</div><div><strong>{work.title}</strong><span>{work.fileName}</span><small>{work.visibility === "PUBLIC" && work.status === "APPROVED" ? "公开展示" : "内部资料"}{work.libraryDocumentId && " · 已入资料库"}</small></div></div>
              <div className={styles.ownerCell}><strong>{work.owner.name}</strong><span>{work.studentLabel || "未填写班级"}</span></div>
              <time className={styles.dateCell} dateTime={work.createdAt}>{date(work.createdAt)}</time><StatusBadge status={work.status} />
              <button className={styles.viewButton} type="button" aria-label={`查看投稿：${work.title}`} onClick={() => open(work)}>{work.status === "PENDING" ? "查看审核" : "查看详情"}<ChevronRight size={15} /></button>
            </li>)}</ul>
            <div className={styles.pagination}><span>共 {data.total} 份投稿</span><div><button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={17} /></button><span>第 {page} / {totalPages} 页</span><button type="button" aria-label="下一页" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}><ChevronRight size={17} /></button></div></div>
          </>}
        </section>
        <p className={styles.reminder}><LockKeyhole size={14} />未通过的投稿不会出现在公开作品展示中；通过时也可保留为内部资料。</p>
      </div>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby="review-detail-title" onCancel={(event) => { if (decisionBusy.current) event.preventDefault(); else setSelected(null); }}
        onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
        {selected && <>
          <header className={styles.dialogHeader}><div><StatusBadge status={selected.status} /><h2 id="review-detail-title">{selected.title}</h2></div><button type="button" className={styles.closeButton} disabled={busy} aria-label="关闭审核详情" onClick={close}><X size={21} /></button></header>
          <div className={styles.dialogBody}>
            <div className={styles.mediaColumn}><div className={styles.mediaFrame}><FilePreview work={selected} /></div><div className={styles.fileInfo}><span><FileText size={15} />{selected.fileName}</span><span>{fileSize(selected.fileSize)}</span>{mediaUrl(selected.mediaUrl) && <a href={mediaUrl(selected.mediaUrl)} target="_blank" rel="noopener noreferrer"><Download size={15} />打开原文件</a>}</div><div className={styles.submissionInfo}><h3>投稿说明</h3><p>{selected.description || "投稿人暂未填写说明。"}</p><dl><div><dt>投稿人</dt><dd>{selected.owner.name}</dd></div><div><dt>班级标识</dt><dd>{selected.studentLabel || "未填写"}</dd></div><div><dt>提交时间</dt><dd>{date(selected.createdAt)}</dd></div></dl></div></div>
            <div className={styles.decisionColumn}>{selected.status === "PENDING" ? <>
              <h3><ShieldCheck size={19} />审核这份投稿</h3><p className={styles.sectionHint}>请核对附件内容，并确认适合的展示范围。</p>
              <fieldset className={styles.decisionFields} disabled={busy}><legend>通过后的展示范围</legend>
                <label className={visibility === "teacher" ? styles.selectedOption : ""}><input type="radio" name="visibility" value="teacher" checked={visibility === "teacher"} onChange={() => { setVisibility("teacher"); setAddToLibrary(false); }} /><span><strong>保留为内部资料</strong><small>仅投稿人和审核管理员可查看</small></span><LockKeyhole size={18} /></label>
                <label className={visibility === "public" ? styles.selectedOption : ""}><input type="radio" name="visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} /><span><strong>公开展示</strong><small>所有访客可在作品展示页浏览</small></span><CheckCircle2 size={18} /></label>
                <label className={styles.libraryOption}><input type="checkbox" disabled={visibility !== "public"} checked={addToLibrary} onChange={(event) => setAddToLibrary(event.target.checked)} /><span><strong>同时加入公开园本资料库</strong><small>仅公开投稿可入库，供浏览和 AI 参考</small></span><BookOpenCheck size={18} /></label>
              </fieldset>
              <label className={styles.noteLabel} htmlFor="review-note">审核意见<span>退回时请说明修改建议</span></label><textarea id="review-note" ref={noteRef} className={styles.note} maxLength={2000} disabled={busy} placeholder="例如：请补充实验过程照片，并去除画面中的个人联系方式。" value={note} onChange={(event) => { setNote(event.target.value); setDetailError(""); }} /><span className={styles.noteCount}>{note.length} / 2000</span>
              {detailError && <div className={styles.detailError} role="alert"><p>{detailError}</p><button type="button" disabled={busy} onClick={() => { close(); void load(); }}>关闭并刷新列表</button></div>}
              {confirmation ? <div className={styles.confirmation} role="alert"><strong>{confirmation === "approve" ? "确认通过这份投稿？" : "确认退回修改？"}</strong><p>{confirmation === "reject" ? "退回原因会保留，供投稿人修改时参考。" : visibility === "public" ? "通过后将公开展示，请确认已适合对外分享。" : "通过后仍为内部资料，不会公开展示。"}</p><div><button className={styles.outlineButton} type="button" disabled={busy} onClick={() => setConfirmation(null)}>再检查一下</button><button className={confirmation === "approve" ? styles.primaryButton : styles.rejectButton} type="button" disabled={busy} onClick={() => void decide()}>{busy ? <LoaderCircle className={styles.spin} size={17} /> : <Check size={17} />}{busy ? "正在保存…" : confirmation === "approve" ? "确认通过" : "确认退回"}</button></div></div> : <div className={styles.decisionActions}><button className={styles.rejectButton} type="button" onClick={() => prepare("reject")}><RotateCcw size={16} />退回修改</button><button className={styles.primaryButton} type="button" onClick={() => prepare("approve")}><Check size={17} />通过审核</button></div>}
            </> : <div className={styles.reviewResult}><CheckCircle2 size={32} /><h3>审核记录</h3><StatusBadge status={selected.status} /><dl><div><dt>审核员</dt><dd>{selected.reviewer?.name || "未记录"}</dd></div><div><dt>审核时间</dt><dd>{date(selected.reviewedAt)}</dd></div><div><dt>展示范围</dt><dd>{selected.visibility === "PUBLIC" ? "公开展示" : "内部资料"}</dd></div><div><dt>资料库</dt><dd>{selected.libraryDocumentId ? "已加入" : "未加入"}</dd></div></dl><h4>审核意见</h4><p>{selected.reviewNote || "本次未填写审核意见。"}</p></div>}</div>
          </div>
        </>}
      </dialog>
    </main>
  );
}

function Stat({ label, number, icon: Icon, tone, description }: { label: string; number?: number; icon: typeof Clock3; tone: string; description: string }) {
  return <section className={styles.stat}><span className={`${styles.statIcon} ${styles[tone]}`}><Icon size={24} /></span><div><span>{label}</span><strong>{number === undefined ? "—" : number}</strong><p>{description}</p></div></section>;
}
