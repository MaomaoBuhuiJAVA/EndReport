"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  LoaderCircle,
  PlayCircle,
  Search,
  X,
} from "lucide-react";
import { GardenSeal } from "@/components/GardenSeal";
import Markdown from "react-markdown";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { GooeyNav, type GooeyNavItem } from "@/components/GooeyNav";
import { PillNav } from "@/components/PillNav";
import { RotatingText } from "@/components/RotatingText";
import { SciencePet } from "@/components/SciencePet";
import {
  SCIENCE_CATEGORIES,
  SCIENCE_RESOURCE_TYPES,
  SCIENCE_SEMESTERS,
  type ScienceCategory,
  type ScienceKnowledgeItem,
  type ScienceKnowledgeSummary,
  type ScienceResourceType,
  type ScienceSemester,
} from "@/lib/science-types";

const labNavItems: GooeyNavItem[] = [
  { key: "overview", label: "园所首页", href: "/" },
  { key: "growth", label: "成长照片", href: "/#growth" },
  { key: "rooms", label: "功能室", href: "/#rooms" },
  { key: "docs", label: "园所资料", href: "/#docs" },
  { key: "lab", label: "科小贝实验室", href: "/lab" },
];

const labHeroPhotos = [
  "/gallery/campus-04.webp",
  "/gallery/campus-05.webp",
  "/gallery/campus-06.webp",
  "/gallery/campus-03.webp",
  "/gallery/campus-07.webp",
];

function ResourceIcon({ type }: { type: string }) {
  if (type === "图片资源") return <ImageIcon size={14} />;
  if (type === "视频资源") return <PlayCircle size={14} />;
  return <FileText size={14} />;
}

function publicImages(item: ScienceKnowledgeSummary) {
  return item.resources.filter(
    (resource) => resource.type === "图片资源" && resource.isPublic && resource.publicPath,
  );
}

function KnowledgeCard({
  item,
  onOpen,
}: {
  item: ScienceKnowledgeSummary;
  onOpen: () => void;
}) {
  const thumbnail = publicImages(item)[0];

  return (
    <button type="button" className="knowledge-card" onClick={onOpen}>
      <span className={`knowledge-card__media${thumbnail ? "" : " is-placeholder"}`}>
        {thumbnail ? (
          <Image
            src={thumbnail.publicPath}
            alt={thumbnail.title}
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 720px) 50vw, 38vw"
          />
        ) : (
          <span className="knowledge-card__placeholder" aria-hidden="true">
            {item.category === "科学诗" ? <BookOpen size={34} /> : <FlaskConical size={34} />}
          </span>
        )}
        <span className="knowledge-card__semester">{item.semester}</span>
      </span>
      <span className="knowledge-card__body">
        <span className="knowledge-card__category">{item.category}</span>
        <strong>{item.title}</strong>
        <span className="knowledge-card__excerpt">{item.excerpt}</span>
        <span className="knowledge-card__footer">
          <span className="knowledge-card__resource-list">
            {item.resourceTypes.slice(0, 3).map((type) => (
              <span key={type} title={type}>
                <ResourceIcon type={type} />
              </span>
            ))}
          </span>
          <span className="knowledge-card__open">
            查看资料
            <ArrowRight size={15} />
          </span>
        </span>
      </span>
    </button>
  );
}

function KnowledgeDetail({
  summary,
  item,
  loading,
  onClose,
}: {
  summary: ScienceKnowledgeSummary;
  item: ScienceKnowledgeItem | null;
  loading: boolean;
  onClose: () => void;
}) {
  const display = item ?? summary;
  const images = publicImages(display);
  const videoUrl =
    item?.videoUrl ||
    display.resources.find((resource) => resource.type === "视频资源")?.externalUrl;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <motion.div
      className="detail-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        className="detail-overlay__backdrop"
        onClick={onClose}
        aria-label="关闭资料"
      />
      <motion.article
        className="knowledge-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-detail-title"
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
      >
        <header className="knowledge-detail__header">
          <div>
            <span>
              {display.semester} · {display.category}
            </span>
            <h2 id="knowledge-detail-title">{display.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭">
            <X size={21} />
          </button>
        </header>

        <div className="knowledge-detail__scroll">
          <div className="knowledge-detail__meta">
            {display.author ? <span>作者/提供者：{display.author}</span> : null}
            {item?.sourceFile ? (
              <span>
                来源：{item.sourceFile}
                {item.sourcePage ? ` · 第 ${item.sourcePage} 页` : ""}
              </span>
            ) : null}
          </div>

          {images.length ? (
            <div className="knowledge-detail__gallery">
              {images.map((image) => (
                <figure key={image.id}>
                  <span className="knowledge-detail__image">
                    <Image
                      src={image.publicPath}
                      alt={image.title}
                      fill
                      sizes="(min-width: 720px) 410px, 90vw"
                    />
                  </span>
                  <figcaption>{image.title}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}

          {videoUrl ? (
            <a className="video-link" href={videoUrl} target="_blank" rel="noreferrer">
              <PlayCircle size={19} />
              播放实验视频
              <ExternalLink size={15} />
            </a>
          ) : null}

          {loading ? (
            <div className="detail-loading">
              <LoaderCircle className="spin" size={20} />
              正在读取资料正文
            </div>
          ) : (
            <div className="markdown-content knowledge-detail__content">
              <Markdown>{item?.body || display.excerpt}</Markdown>
            </div>
          )}
        </div>
      </motion.article>
    </motion.div>
  );
}

export function ScienceLab({
  initialItems,
}: {
  initialItems: ScienceKnowledgeSummary[];
}) {
  const [semester, setSemester] = useState<ScienceSemester>("全部学期");
  const [category, setCategory] = useState<ScienceCategory>("全部内容");
  const [resourceType, setResourceType] = useState<ScienceResourceType>("全部资源");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedSummary, setSelectedSummary] = useState<ScienceKnowledgeSummary | null>(null);
  const [selectedItem, setSelectedItem] = useState<ScienceKnowledgeItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("zh-CN"));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % labHeroPhotos.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(
    () =>
      initialItems.filter((item) => {
        if (semester !== "全部学期" && item.semester !== semester) return false;
        if (category !== "全部内容" && item.category !== category) return false;
        if (resourceType !== "全部资源" && !item.resourceTypes.includes(resourceType)) {
          return false;
        }
        if (!deferredQuery) return true;

        return [item.title, item.author, item.topic, item.excerpt, ...item.tags]
          .join(" ")
          .toLocaleLowerCase("zh-CN")
          .includes(deferredQuery);
      }),
    [category, deferredQuery, initialItems, resourceType, semester],
  );

  function changeSemester(value: ScienceSemester) {
    setSemester(value);
    setVisibleCount(12);
  }

  function changeCategory(value: ScienceCategory) {
    setCategory(value);
    setVisibleCount(12);
  }

  function changeResourceType(value: ScienceResourceType) {
    setResourceType(value);
    setVisibleCount(12);
  }

  const closeDetail = useCallback(() => {
    setSelectedSummary(null);
    setSelectedItem(null);
    setDetailLoading(false);
  }, []);

  async function openDetail(summary: ScienceKnowledgeSummary) {
    setSelectedSummary(summary);
    setSelectedItem(null);
    setDetailLoading(true);

    try {
      const response = await fetch(
        `/api/science-resources?item=${encodeURIComponent(summary.id)}`,
      );
      if (!response.ok) throw new Error("Knowledge detail request failed");
      const payload = (await response.json()) as { item?: ScienceKnowledgeItem };
      setSelectedItem(payload.item ?? null);
    } catch {
      setSelectedItem(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="lab-page">
      <header className="lab-site-header">
        <div className="lab-site-header__inner">
          <Link className="lab-brand" href="/">
            <GardenSeal glyph="芽" tone="teal" />
            <strong>国科温州二幼</strong>
          </Link>
          <GooeyNav items={labNavItems} activeKey="lab" />
        </div>
      </header>

      <main>
        <section className="lab-hero">
          <div className="lab-hero__photos" aria-hidden="true">
            {labHeroPhotos.map((photo, index) => (
              <Image
                alt=""
                className={index === heroIndex ? "is-active" : ""}
                fill
                key={photo}
                priority={index === 0}
                sizes="100vw"
                src={photo}
              />
            ))}
            <div className="lab-hero__shade" />
          </div>
          <div className="lab-shell lab-hero__inner">
            <div className="lab-hero__copy">
              <p className="lab-eyebrow">国科二幼园本资源中心</p>
              <h1>
                科小贝
                <RotatingText
                  texts={["实验室", "科学诗库", "亲子探索站"]}
                  mainClassName="rotating-text"
                  splitLevelClassName="rotating-text__clip"
                  staggerFrom="last"
                  staggerDuration={0.025}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "-120%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 400 }}
                  rotationInterval={2600}
                />
              </h1>
              <p>汇集园本科学诗、教师实验与家庭实验资料。</p>
              <div className="lab-hero__progress" aria-hidden="true">
                {labHeroPhotos.map((photo, index) => (
                  <span className={index === heroIndex ? "is-active" : ""} key={photo} />
                ))}
              </div>
            </div>
            <label className="lab-search">
              <Search size={20} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(12);
                }}
                placeholder="搜索实验、科学诗或作者"
                aria-label="搜索知识库"
              />
              {query ? (
                <button type="button" onClick={() => {
                  setQuery("");
                  setVisibleCount(12);
                }} title="清空搜索">
                  <X size={17} />
                </button>
              ) : null}
            </label>
          </div>
        </section>

        <section className="lab-shell lab-content">
          <div className="filter-panel">
            <PillNav
              label="学期"
              items={SCIENCE_SEMESTERS}
              value={semester}
              onChange={changeSemester}
            />
            <PillNav
              label="内容"
              items={SCIENCE_CATEGORIES}
              value={category}
              onChange={changeCategory}
            />
            <PillNav
              label="资源"
              items={SCIENCE_RESOURCE_TYPES}
              value={resourceType}
              onChange={changeResourceType}
            />
          </div>

          <div className="results-heading">
            <div>
              <strong>{filtered.length}</strong>
              <span> 条匹配资料</span>
            </div>
            <span>资料来自国科二幼园本知识库</span>
          </div>

          {filtered.length ? (
            <>
              <div className="knowledge-grid">
                {filtered.slice(0, visibleCount).map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    item={item}
                    onOpen={() => void openDetail(item)}
                  />
                ))}
              </div>
              {visibleCount < filtered.length ? (
                <button
                  type="button"
                  className="load-more"
                  onClick={() => setVisibleCount((count) => count + 12)}
                >
                  加载更多
                </button>
              ) : null}
            </>
          ) : (
            <div className="state-message state-message--empty">
              <BookOpen size={30} />
              <strong>暂时没有匹配资料</strong>
              <span>可以切换筛选条件或换一个关键词。</span>
            </div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {selectedSummary ? (
          <KnowledgeDetail
            summary={selectedSummary}
            item={selectedItem}
            loading={detailLoading}
            onClose={closeDetail}
          />
        ) : null}
      </AnimatePresence>

      <SciencePet />
    </div>
  );
}
