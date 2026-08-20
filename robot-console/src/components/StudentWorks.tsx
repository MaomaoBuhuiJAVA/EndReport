"use client";

/* Student uploads are public Blob URLs with runtime hosts; next/image cannot
 * optimize an unknown host without weakening the deployment configuration. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  BookOpen,
  FileText,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  ThumbsUp,
  Upload,
  Video,
  X,
} from "lucide-react";

type SessionUser = { id: string; email: string; name: string; role: "USER" | "ADMIN" };

type Work = {
  id: string;
  title: string;
  description: string | null;
  studentLabel: string | null;
  fileName: string;
  mimeType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  status: string;
  visibility: string;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  likesCount: number;
  commentsCount: number;
};

type Comment = { id: string; body: string; authorName: string; createdAt: string };
type GrowthRecord = { id: string; stage: string; note: string; createdAt: string };
type ArchiveRecord = {
  workId: string;
  title: string;
  status: string;
  visibility: string;
  createdAt: string;
  growth: GrowthRecord[];
};
type WorkDetail = Work & { ownerId?: string; comments: Comment[]; growthRecords: GrowthRecord[]; libraryDocumentId?: string | null };

const emptyUpload = { title: "", description: "", studentLabel: "" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(status: string) {
  return status === "APPROVED" ? "已通过" : status === "REJECTED" ? "需修改" : "待审核";
}

function MediaPreview({ work }: { work: Work }) {
  if (work.mimeType.startsWith("image/")) {
    return <img className="student-work-media" src={work.mediaUrl} alt={work.title} loading="lazy" />;
  }
  if (work.mimeType.startsWith("video/")) {
    return <video className="student-work-media" controls preload="metadata" src={work.mediaUrl} aria-label={work.title} />;
  }
  if (work.mimeType.startsWith("audio/")) {
    return <div className="student-work-audio"><Video size={18} /><audio controls src={work.mediaUrl} /></div>;
  }
  return <div className="student-work-file"><FileText size={28} /><span>{work.fileName}</span></div>;
}

export function StudentWorks({ initialUser }: { initialUser: SessionUser | null }) {
  const user = initialUser;
  const [works, setWorks] = useState<Work[]>([]);
  const [mine, setMine] = useState<Work[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Work[]>([]);
  const [archiveRecords, setArchiveRecords] = useState<ArchiveRecord[]>([]);
  const [selected, setSelected] = useState<WorkDetail | null>(null);
  const [tab, setTab] = useState<"showcase" | "mine" | "archive" | "review">("showcase");
  const [upload, setUpload] = useState(emptyUpload);
  const [file, setFile] = useState<File | null>(null);
  const [reviewVisibility, setReviewVisibility] = useState("teacher");
  const [reviewNote, setReviewNote] = useState("");
  const [addToLibrary, setAddToLibrary] = useState(false);
  const [comment, setComment] = useState("");
  const [growth, setGrowth] = useState({ stage: "观察记录", note: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const publicResponse = await fetch("/api/student-works", { cache: "no-store" });
    if (publicResponse.ok) setWorks(((await publicResponse.json()) as { works?: Work[] }).works ?? []);
    const mineResponse = await fetch("/api/student-works?scope=mine", { cache: "no-store" });
    if (mineResponse.ok) setMine(((await mineResponse.json()) as { works?: Work[] }).works ?? []);
    const archiveResponse = await fetch("/api/student-works/archive", { cache: "no-store" });
    if (archiveResponse.ok) setArchiveRecords(((await archiveResponse.json()) as { records?: ArchiveRecord[] }).records ?? []);
    if (user?.role === "ADMIN") {
      const reviewResponse = await fetch("/api/student-works?scope=review", { cache: "no-store" });
      if (reviewResponse.ok) setReviewQueue(((await reviewResponse.json()) as { works?: Work[] }).works ?? []);
    }
  }, [user]);

  useEffect(() => {
    const task = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const visibleWorks = useMemo(() => tab === "mine" ? mine : tab === "review" ? reviewQueue : works, [mine, reviewQueue, tab, works]);

  async function openWork(work: Work) {
    const response = await fetch(`/api/student-works/${work.id}`, { cache: "no-store" });
    if (!response.ok) { setNotice("这件作品暂时无法查看"); return; }
    setSelected(((await response.json()) as { work: WorkDetail }).work);
    setComment("");
    setGrowth({ stage: "观察记录", note: "" });
    setReviewNote("");
  }

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !upload.title.trim()) { setNotice("请填写作品标题并选择文件"); return; }
    setBusy(true);
    const form = new FormData();
    form.set("title", upload.title);
    form.set("description", upload.description);
    form.set("studentLabel", upload.studentLabel);
    form.set("file", file);
    const response = await fetch("/api/student-works", { method: "POST", body: form });
    const payload = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) { setNotice(payload.error ?? "上传失败"); return; }
    setUpload(emptyUpload); setFile(null); setNotice("作品已添加，已在公开展示中"); await load(); setTab("mine");
  }

  async function toggleLike() {
    if (!selected) return;
    const response = await fetch(`/api/student-works/${selected.id}/like`, { method: "POST" });
    if (!response.ok) { setNotice("点赞需要先通过审核"); return; }
    const payload = (await response.json()) as { count: number; liked: boolean };
    setSelected((current) => current ? { ...current, likesCount: payload.count } : current);
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !comment.trim()) return;
    const response = await fetch(`/api/student-works/${selected.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: comment }) });
    if (!response.ok) { setNotice("评论暂时不可用，请稍后重试"); return; }
    const payload = (await response.json()) as { comment: Comment };
    setSelected((current) => current ? { ...current, comments: [...current.comments, payload.comment], commentsCount: current.commentsCount + 1 } : current);
    setComment("");
  }

  async function submitGrowth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !growth.note.trim()) return;
    const response = await fetch(`/api/student-works/${selected.id}/growth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(growth) });
    if (!response.ok) { setNotice("只有作品创建者或教师可以记录成长"); return; }
    const payload = (await response.json()) as { record: GrowthRecord };
    setSelected((current) => current ? { ...current, growthRecords: [...current.growthRecords, payload.record] } : current);
    setGrowth({ stage: "观察记录", note: "" });
    void load();
  }

  async function reviewWork(action: "approve" | "reject") {
    if (!selected || user?.role !== "ADMIN") return;
    setBusy(true);
    const response = await fetch(`/api/student-works/${selected.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, visibility: reviewVisibility, reviewNote, addToLibrary }) });
    const payload = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) { setNotice(payload.error ?? "审核失败"); return; }
    setNotice(action === "approve" ? "作品已审核通过" : "已退回作品"); setSelected(null); await load();
  }

  return (
    <main className="student-works-page">
      <header className="student-works-header">
        <div><span className="student-works-kicker">科小贝 · 成长档案</span><h1>科学作品展示</h1><p>把每次观察、表达和尝试留在自己的探究记录里。</p></div>
        <a className="student-works-home" href="/lab">返回实验室 <ChevronRight size={16} /></a>
      </header>

      <section className="student-works-shell">
        <div className="student-works-tabs" role="tablist" aria-label="作品视图">
          <button className={tab === "showcase" ? "is-active" : ""} onClick={() => setTab("showcase")} type="button"><Sparkles size={16} />公开展示</button>
          <button className={tab === "mine" ? "is-active" : ""} onClick={() => setTab("mine")} type="button"><Heart size={16} />我的成长</button>
          <button className={tab === "archive" ? "is-active" : ""} onClick={() => setTab("archive")} type="button"><BookOpen size={16} />成长档案</button>
          {user?.role === "ADMIN" ? <button className={tab === "review" ? "is-active" : ""} onClick={() => setTab("review")} type="button"><Check size={16} />教师审核 {reviewQueue.length ? `(${reviewQueue.length})` : ""}</button> : null}
        </div>

        {
          <form className="student-work-upload" onSubmit={submitUpload}>
            <div className="student-work-upload__intro"><Upload size={20} /><div><strong>提交一件新作品</strong><span>无需注册，提交后即可在公开展示中查看。</span></div></div>
            <div className="student-work-upload__fields">
              <input aria-label="作品标题" placeholder="作品标题" value={upload.title} onChange={(event) => setUpload({ ...upload, title: event.target.value })} />
              <input aria-label="班级或小组" placeholder="班级 / 小组（可选）" value={upload.studentLabel} onChange={(event) => setUpload({ ...upload, studentLabel: event.target.value })} />
              <textarea aria-label="作品说明" placeholder="作品说明、观察发现或想继续探究的问题" value={upload.description} onChange={(event) => setUpload({ ...upload, description: event.target.value })} />
              <label className="student-work-file-picker"><ImageIcon size={17} />{file ? file.name : "选择图片、视频、音频或文档"}<input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
              <button className="student-work-primary" disabled={busy} type="submit"><Send size={16} />{busy ? "提交中" : "提交审核"}</button>
            </div>
          </form>
        }

        {notice ? <div className="student-work-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="关闭提示"><X size={16} /></button></div> : null}

        {tab === "archive" ? (
          <section className="student-work-archive" aria-label="成长档案">
            <div className="student-work-archive__heading"><div><span>持续记录</span><h2>我的成长档案</h2></div><p>每一条记录都对应一件作品，留下发现、尝试和下一步问题。</p></div>
            {archiveRecords.length ? <div className="student-work-archive__list">{archiveRecords.map((record) => (
              <article className="student-work-archive__item" key={record.workId}>
                <div className="student-work-archive__item-head"><div><span>{statusLabel(record.status)}</span><h3>{record.title}</h3></div><time>{formatDate(record.createdAt)}</time></div>
                {record.growth.length ? <div className="student-work-archive__timeline">{record.growth.map((entry) => <div key={entry.id}><strong>{entry.stage}</strong><p>{entry.note}</p><time>{formatDate(entry.createdAt)}</time></div>)}</div> : <p className="student-work-archive__empty">打开作品详情，写下第一次观察记录。</p>}
              </article>
            ))}</div> : <div className="student-work-empty"><BookOpen size={24} /><strong>成长档案还没有记录</strong><span>提交作品后，在详情中写下你的发现和下一步计划。</span></div>}
          </section>
        ) : (
          <div className="student-work-grid">
            {visibleWorks.length ? visibleWorks.map((work) => (
              <article className="student-work-card" key={work.id}>
                <button className="student-work-card__media" onClick={() => void openWork(work)} type="button"><MediaPreview work={work} /></button>
                <div className="student-work-card__body"><div className="student-work-card__meta"><span>{statusLabel(work.status)}</span><time>{formatDate(work.createdAt)}</time></div><h2>{work.title}</h2><p>{work.description || "这件作品还没有写下说明。"}</p><div className="student-work-card__footer"><span>{work.studentLabel || "探究记录"}</span><button type="button" onClick={() => void openWork(work)}><MessageCircle size={15} />{work.commentsCount}</button><span><ThumbsUp size={15} />{work.likesCount}</span></div></div>
              </article>
            )) : <div className="student-work-empty"><Plus size={24} /><strong>{tab === "review" ? "暂时没有待审核作品" : tab === "mine" ? "还没有提交作品" : "公开展示正在积累中"}</strong><span>{tab === "showcase" ? "教师审核通过的作品会出现在这里。" : "提交一件作品，开始记录你的探究过程。"}</span></div>}
          </div>
        )}
      </section>

      {selected ? (
        <div className="student-work-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="student-work-dialog" role="dialog" aria-modal="true" aria-labelledby="student-work-title">
            <button className="student-work-dialog__close" onClick={() => setSelected(null)} type="button" aria-label="关闭作品详情"><X size={19} /></button>
            <div className="student-work-dialog__media"><MediaPreview work={selected} /></div>
            <div className="student-work-dialog__content"><div className="student-work-card__meta"><span>{statusLabel(selected.status)}</span><time>{formatDate(selected.createdAt)}</time></div><h2 id="student-work-title">{selected.title}</h2><p>{selected.description || "暂无作品说明。"}</p><div className="student-work-actions"><button onClick={() => void toggleLike()} type="button"><ThumbsUp size={16} />点赞 {selected.likesCount}</button><span><MessageCircle size={16} />{selected.commentsCount} 条评论</span></div>
              {selected.comments.length ? <div className="student-work-comments">{selected.comments.map((item) => <div key={item.id}><strong>{item.authorName}</strong><span>{item.body}</span><time>{formatDate(item.createdAt)}</time></div>)}</div> : null}
              {selected.status === "APPROVED" && selected.visibility === "PUBLIC" ? <form className="student-work-inline-form" onSubmit={submitComment}><input aria-label="评论" placeholder="写一句鼓励或观察" value={comment} onChange={(event) => setComment(event.target.value)} /><button type="submit" aria-label="发送评论"><Send size={16} /></button></form> : null}
              {selected.status === "APPROVED" && selected.visibility === "PUBLIC" ? <form className="student-work-growth" onSubmit={submitGrowth}><div><strong>成长档案</strong><span>把下一步观察写下来</span></div><select aria-label="成长阶段" value={growth.stage} onChange={(event) => setGrowth({ ...growth, stage: event.target.value })}><option>观察记录</option><option>再次尝试</option><option>我的发现</option><option>教师反馈</option></select><textarea aria-label="成长记录" placeholder="这次我发现……下次我想试试……" value={growth.note} onChange={(event) => setGrowth({ ...growth, note: event.target.value })} /><button className="student-work-secondary" type="submit">保存成长记录</button>{selected.growthRecords.length ? <div className="student-work-growth-list">{selected.growthRecords.map((item) => <div key={item.id}><strong>{item.stage}</strong><span>{item.note}</span></div>)}</div> : null}</form> : null}
              {user?.role === "ADMIN" && selected.status === "PENDING" ? <div className="student-work-review"><strong>教师审核</strong><label><input type="radio" checked={reviewVisibility === "teacher"} onChange={() => setReviewVisibility("teacher")} />仅教师可见</label><label><input type="radio" checked={reviewVisibility === "public"} onChange={() => setReviewVisibility("public")} />审核后公开</label><label className="student-work-check"><input type="checkbox" checked={addToLibrary} onChange={(event) => setAddToLibrary(event.target.checked)} />同时写入园本资料库</label><textarea aria-label="审核意见" placeholder="审核意见（可选）" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /><div><button className="student-work-secondary" disabled={busy} onClick={() => void reviewWork("reject")} type="button">退回修改</button><button className="student-work-primary" disabled={busy} onClick={() => void reviewWork("approve")} type="button"><Check size={16} />通过审核</button></div></div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
