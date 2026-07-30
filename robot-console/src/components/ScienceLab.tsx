"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GooeyNav, type GooeyNavItem } from "@/components/GooeyNav";
import { MobileAppNav, type MobileAppNavItem } from "@/components/MobileAppNav";
import { RotatingText } from "@/components/RotatingText";
import { SciencePet } from "@/components/SciencePet";
import {
  type ScienceKnowledgeItem,
  type ScienceKnowledgeSummary,
} from "@/lib/science-types";
import {
  availableAges,
  availableTopics,
  availableTypes,
  filterScienceItems,
  normalizeScienceSelection,
  type ScienceSelection,
} from "@/lib/science-navigation";
import { orderedExperimentImages } from "@/lib/science-step-images";

const labNavItems: GooeyNavItem[] = [
  { key: "overview", label: "园所首页", href: "/" },
  { key: "growth", label: "成长照片", href: "/#growth" },
  { key: "rooms", label: "功能室", href: "/#rooms" },
  { key: "docs", label: "园所资料", href: "/#docs" },
  { key: "lab", label: "科小贝实验室", href: "/lab" },
];

const labMobileNavItems: MobileAppNavItem[] = [
  { key: "overview", label: "概览", href: "/" },
  { key: "growth", label: "成长", href: "/#growth" },
  { key: "rooms", label: "功能室", href: "/#rooms" },
  { key: "docs", label: "资料", href: "/#docs" },
  { key: "lab", label: "实验室", href: "/lab" },
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

const categoryVisuals = {
  科学诗: {
    icon: BookOpen,
    image: "/lab-category-buttons/poetry.png",
  },
  科学故事: {
    icon: Clapperboard,
    image: "/lab-category-buttons/story.png",
  },
  科学实验: {
    icon: FlaskConical,
    image: "/lab-category-buttons/experiment.png",
  },
} as const;

function CompactFilterRow({
  label,
  items,
  value,
  onChange,
  counts,
}: {
  label: string;
  items: readonly string[];
  value: string;
  onChange: (value: string) => void;
  counts?: ReadonlyMap<string, number>;
}) {
  const rowClassName =
    label === "类型"
      ? "compact-filter-row compact-filter-row--type"
      : label === "主题"
        ? "compact-filter-row compact-filter-row--topic"
        : "compact-filter-row";

  return (
    <div className={rowClassName}>
      <span className="compact-filter-row__label">{label}</span>
      <div className="compact-filter-row__choices" role="radiogroup" aria-label={`选择${label}`}>
        {items.map((item) => {
          const categoryVisual =
            label === "类型" ? categoryVisuals[item as keyof typeof categoryVisuals] : null;
          const Icon = categoryVisual?.icon;
          const count = counts?.get(item);

          return (
            <button
              key={item}
              type="button"
              className={`compact-filter-choice${value === item ? " is-active" : ""}${label === "年龄段" ? " is-age" : ""}${categoryVisual ? " is-type" : ""}`}
              role="radio"
              aria-checked={value === item}
              aria-label={categoryVisual ? item : undefined}
              onClick={() => onChange(item)}
              title={categoryVisual ? item : undefined}
            >
              {categoryVisual ? (
                <Image
                  className="compact-filter-choice__illustration"
                  src={categoryVisual.image}
                  alt=""
                  width={56}
                  height={56}
                  sizes="56px"
                  aria-hidden="true"
                />
              ) : null}
              {Icon ? <Icon size={18} strokeWidth={2.25} aria-hidden="true" /> : null}
              <span className={categoryVisual ? "compact-filter-choice__label" : undefined}>{item}</span>
              {typeof count === "number" ? <small>{count}</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function publicImages(item: ScienceKnowledgeSummary) {
  return orderedExperimentImages(item.resources);
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
            {item.category === "科学诗" ? (
              <BookOpen size={34} />
            ) : item.category === "科学故事" ? (
              <Clapperboard size={34} />
            ) : (
              <FlaskConical size={34} />
            )}
          </span>
        )}
        <span className="knowledge-card__semester">{item.ageLabel}</span>
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
              {display.category} · {display.topic} · {display.ageLabel}
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

          {images.length && display.category !== "科学实验" ? (
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
              播放视频
              <ExternalLink size={15} />
            </a>
          ) : display.resources.some((resource) => resource.type === "视频资源") ? (
            <div className="video-source-note">
              <PlayCircle size={18} />
              <span>视频素材已归档：{display.resources.find((resource) => resource.type === "视频资源")?.source}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="detail-loading">
              <LoaderCircle className="spin" size={20} />
              正在读取资料正文
            </div>
          ) : (
            <>
              <div className="markdown-content knowledge-detail__content">
                <Markdown>{item?.body || display.excerpt}</Markdown>
              </div>

              {display.category === "科学实验" && images.length ? (
                <section className="knowledge-detail__steps" aria-labelledby="experiment-step-images">
                  <h3 id="experiment-step-images">实验步骤图片</h3>
                  <ol className="knowledge-detail__gallery">
                    {images.map((image, index) => (
                      <li key={image.id}>
                        <figure>
                          <span className="knowledge-detail__image knowledge-detail__step-image">
                            <Image
                              src={image.publicPath}
                              alt={`实验步骤图片 ${index + 1}：${image.title}`}
                              fill
                              sizes="(min-width: 720px) 410px, 90vw"
                            />
                          </span>
                          <figcaption>实验步骤图片 {index + 1}</figcaption>
                        </figure>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </>
          )}
        </div>
      </motion.article>
    </motion.div>
  );
}

export function ScienceLab({
  initialItems,
  initialResourceId,
}: {
  initialItems: ScienceKnowledgeSummary[];
  initialResourceId?: string;
}) {
  const [selection, setSelection] = useState<ScienceSelection>(() =>
    normalizeScienceSelection(initialItems, { category: "科学诗", topic: "", ageLabel: "" }),
  );
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedSummary, setSelectedSummary] = useState<ScienceKnowledgeSummary | null>(null);
  const [selectedItem, setSelectedItem] = useState<ScienceKnowledgeItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const autoOpenedResourceId = useRef<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % labHeroPhotos.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, []);

  const categories = useMemo(() => availableTypes(initialItems), [initialItems]);
  const topics = useMemo(
    () => availableTopics(initialItems, selection.category),
    [initialItems, selection.category],
  );
  const ages = useMemo(
    () => availableAges(initialItems, selection.category, selection.topic),
    [initialItems, selection.category, selection.topic],
  );
  const ageCounts = useMemo(
    () =>
      new Map(
        ages.map((age) => [
          age,
          initialItems.filter(
            (item) =>
              item.category === selection.category &&
              item.topic === selection.topic &&
              item.ageLabel === age,
          ).length,
        ]),
      ),
    [ages, initialItems, selection.category, selection.topic],
  );

  const filtered = useMemo(
    () => filterScienceItems(initialItems, { ...selection, query: deferredQuery }),
    [deferredQuery, initialItems, selection],
  );

  function changeCategory(category: string) {
    setSelection(normalizeScienceSelection(initialItems, { category, topic: "", ageLabel: "" }));
    setVisibleCount(12);
  }

  function changeTopic(topic: string) {
    setSelection(normalizeScienceSelection(initialItems, { ...selection, topic, ageLabel: "" }));
    setVisibleCount(12);
  }

  function changeAge(ageLabel: string) {
    setSelection({ ...selection, ageLabel });
    setVisibleCount(12);
  }

  const closeDetail = useCallback(() => {
    setSelectedSummary(null);
    setSelectedItem(null);
    setDetailLoading(false);
  }, []);

  const openDetail = useCallback(async (summary: ScienceKnowledgeSummary) => {
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
  }, []);

  useEffect(() => {
    if (!initialResourceId || autoOpenedResourceId.current === initialResourceId) return;

    const summary = initialItems.find((item) => item.id === initialResourceId);
    if (!summary) return;

    const autoOpenTimer = window.setTimeout(() => {
      autoOpenedResourceId.current = initialResourceId;
      void openDetail(summary);
    }, 0);

    return () => window.clearTimeout(autoOpenTimer);
  }, [initialItems, initialResourceId, openDetail]);

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

      <MobileAppNav
        items={labMobileNavItems}
        activeKey="lab"
        onSelect={(item) => {
          if (item.key === "lab") window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        }}
      />

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
            <CompactFilterRow
              label="类型"
              items={categories}
              value={selection.category}
              onChange={changeCategory}
            />
            <CompactFilterRow
              label="主题"
              items={topics}
              value={selection.topic}
              onChange={changeTopic}
            />
            <CompactFilterRow
              label="年龄段"
              items={ages}
              value={selection.ageLabel}
              onChange={changeAge}
              counts={ageCounts}
            />
          </div>

          <div className="results-heading">
            <div>
              <strong>{filtered.length}</strong>
              <span> 条匹配资料</span>
            </div>
            <span>{selection.category} / {selection.topic} / {selection.ageLabel}</span>
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
