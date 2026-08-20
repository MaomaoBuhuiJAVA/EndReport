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
  House,
  Image as ImageIcon,
  LoaderCircle,
  PlayCircle,
  Search,
  Sparkles,
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
import { SciencePet } from "@/components/SciencePet";
import {
  type ScienceKnowledgeItem,
  type ScienceKnowledgeSummary,
} from "@/lib/science-types";
import {
  availableAges,
  availableTypes,
  filterScienceItems,
  normalizeScienceSelection,
  type ScienceSelection,
} from "@/lib/science-navigation";
import {
  experimentImageCaption,
  experimentImageRole,
  orderedExperimentImages,
} from "@/lib/science-step-images";

const labNavItems: GooeyNavItem[] = [
  { key: "overview", label: "科小贝首页", href: "/" },
  { key: "lab", label: "科小贝实验室", href: "/lab" },
];

const labMobileNavItems: MobileAppNavItem[] = [
  { key: "科学诗", label: "科学诗", href: "#lab-results", icon: BookOpen },
  { key: "科学故事", label: "科学故事", href: "#lab-results", icon: Clapperboard },
  { key: "科学实验", label: "科学实验", href: "#lab-results", icon: FlaskConical },
];

const labHeroPhotos = [
  "/gallery/campus-04.webp",
  "/gallery/campus-05.webp",
  "/gallery/campus-06.webp",
  "/gallery/campus-03.webp",
  "/gallery/campus-07.webp",
];

type ExperimentAgentAction = "analyze" | "similar";

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
      : "compact-filter-row";

  return (
    <div className={rowClassName}>
      <span className="compact-filter-row__label">{label}</span>
      <div className="compact-filter-row__choices" role="radiogroup" aria-label={`选择${label}`}>
        {items.map((item) => {
          const isAllChoice = item === "全部";
          const categoryVisual =
            label === "类型" ? categoryVisuals[item as keyof typeof categoryVisuals] : null;
          const Icon = categoryVisual?.icon;
          const count = counts?.get(item);
          const isActive = isAllChoice ? !value : value === item;

          return (
            <button
              key={item}
              type="button"
              className={`compact-filter-choice${isActive ? " is-active" : ""}${label === "年龄段" ? " is-age" : ""}${categoryVisual ? " is-type" : ""}${isAllChoice ? " is-all" : ""}`}
              role="radio"
              aria-checked={isActive}
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

function literatureTone(item: ScienceKnowledgeSummary) {
  const source = `${item.id}:${item.topic ?? ""}`;
  const score = Array.from(source).reduce((total, character) => total + character.charCodeAt(0), 0);
  return `tone-${score % 4}`;
}

function scienceStoryCoverPath(item: ScienceKnowledgeSummary) {
  if (item.category !== "科学故事") return "";

  if (item.coverUrl?.trim()) return item.coverUrl.trim();

  const imageResource = item.resources.find(
    (resource) => resource.type === "图片资源" && (resource.publicPath || resource.externalUrl),
  );
  if (imageResource) return imageResource.publicPath || imageResource.externalUrl;

  return `/science-story-covers/${item.id}.webp`;
}

function sciencePoemCoverPath(item: ScienceKnowledgeSummary) {
  return item.category === "科学诗" ? `/science-poem-covers/${item.id}.webp` : "";
}

function isDirectVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(?:mp4|webm|mov|m4v)(?:$|[?#])/iu.test(url.pathname);
  } catch {
    return false;
  }
}

function KnowledgeCard({
  item,
  onOpen,
  onAgentAction,
}: {
  item: ScienceKnowledgeSummary;
  onOpen: () => void;
  onAgentAction: (item: ScienceKnowledgeSummary, action: ExperimentAgentAction) => void;
}) {
  const thumbnail = publicImages(item)[0];
  const isLiterature = item.category === "科学诗" || item.category === "科学故事";
  const isStory = item.category === "科学故事";
  const isPoem = item.category === "科学诗";
  const [storyCoverFailed, setStoryCoverFailed] = useState(false);
  const [poemCoverFailed, setPoemCoverFailed] = useState(false);
  const categoryVisual =
    categoryVisuals[item.category as keyof typeof categoryVisuals] ?? categoryVisuals.科学实验;
  const CategoryIcon = categoryVisual.icon;
  const mediaVariant = item.category === "科学诗" ? "poetry" : item.category === "科学故事" ? "story" : "experiment";
  const storyCover = scienceStoryCoverPath(item);
  const poemCover = sciencePoemCoverPath(item);
  const literatureImage = isStory && storyCover
    ? storyCoverFailed ? categoryVisual.image : storyCover
    : isPoem && poemCover
      ? poemCoverFailed ? categoryVisual.image : poemCover
      : categoryVisual.image;
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const agentActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agentMenuOpen) return;

    function closeAgentMenu(event: PointerEvent) {
      if (!agentActionsRef.current?.contains(event.target as Node)) setAgentMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAgentMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeAgentMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeAgentMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [agentMenuOpen]);

  function chooseAgentAction(action: ExperimentAgentAction) {
    setAgentMenuOpen(false);
    onAgentAction(item, action);
  }

  return (
    <div className="knowledge-card-shell">
    <button
      type="button"
      className={`knowledge-card${isLiterature ? ` knowledge-card--literature knowledge-card--${literatureTone(item)}` : ""}`}
      onClick={onOpen}
      aria-label={`打开${item.category}：${item.title}`}
    >
      <span
        className={`knowledge-card__media knowledge-card__media--${mediaVariant}${thumbnail && !isLiterature ? "" : " is-placeholder"}`}
      >
        {isLiterature ? (
          <>
            <Image
              src={literatureImage}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 720px) 30vw, 46vw"
              className="knowledge-card__literature-art"
              onError={isStory ? () => setStoryCoverFailed(true) : isPoem ? () => setPoemCoverFailed(true) : undefined}
              aria-hidden="true"
            />
            <span className="knowledge-card__literature-shade" aria-hidden="true" />
            <span className="knowledge-card__literature-icon" aria-hidden="true">
              <CategoryIcon size={19} strokeWidth={2} />
            </span>
            <strong className="knowledge-card__cover-title">{item.title}</strong>
          </>
        ) : thumbnail ? (
          <Image
            src={thumbnail.publicPath}
            alt={thumbnail.title}
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 720px) 50vw, 38vw"
          />
        ) : (
          <span className="knowledge-card__placeholder" aria-hidden="true">
            <Image
              src={categoryVisual.image}
              alt=""
              fill
              sizes="(min-width: 1024px) 360px, 38vw"
              className="knowledge-card__placeholder-image"
            />
            <span className="knowledge-card__placeholder-shade" />
            <span className="knowledge-card__placeholder-content">
              <CategoryIcon size={30} strokeWidth={1.9} />
              <small>{item.category}</small>
            </span>
          </span>
        )}
        {item.category !== "科学实验" ? (
          <span className="knowledge-card__semester">{item.ageLabel}</span>
        ) : null}
      </span>
      <span className={`knowledge-card__body${isLiterature ? " knowledge-card__body--literature" : ""}`}>
        <span className="knowledge-card__category-row">
          {item.category === "科学实验" && item.ageLabel ? (
            <span className="knowledge-card__experiment-age">{item.ageLabel}</span>
          ) : null}
          <span className="knowledge-card__category">{item.category}</span>
        </span>
        <strong className="knowledge-card__body-title">{item.title}</strong>
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
      {item.category === "科学实验" ? (
        <div className="knowledge-card__agent-actions" ref={agentActionsRef}>
          <button
            type="button"
            className="knowledge-card__agent-trigger"
            aria-label={`打开《${item.title}》的 AI 操作`}
            aria-expanded={agentMenuOpen}
            aria-haspopup="menu"
            title="AI 实验操作"
            onClick={() => setAgentMenuOpen((isOpen) => !isOpen)}
          >
            <Sparkles size={15} />
          </button>
          {agentMenuOpen ? (
            <div className="knowledge-card__agent-menu" role="menu" aria-label={`${item.title} 的 AI 操作`}>
              <button type="button" role="menuitem" onClick={() => chooseAgentAction("analyze")}>
                AI 解析这个实验
              </button>
              <button type="button" role="menuitem" onClick={() => chooseAgentAction("similar")}>
                生成类似主题方案
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
  const imageGroups = [
    {
      key: "material",
      label: "材料准备",
      images: images.filter((image) => experimentImageRole(image) === "material"),
    },
    {
      key: "operation",
      label: "操作步骤",
      images: images.filter((image) => experimentImageRole(image) !== "material"),
    },
  ].filter((group) => group.images.length);
  const videoResources = display.resources.filter(
    (resource) => resource.type === "视频资源" && resource.isPublic,
  );

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

          {videoResources.length ? (
            <section className="video-resource" aria-label="实验视频资源">
              <div className="video-resource__items">
                {videoResources.map((videoResource, index) => {
                  const videoLabel = `视频资源 ${index + 1}`;
                  const videoUrl =
                    videoResource.externalUrl || (index === 0 ? item?.videoUrl : "");
                  const isPlayableVideo = Boolean(videoUrl && isDirectVideoUrl(videoUrl));
                  const qrContent = videoResource.publicPath ? (
                    <>
                      <Image
                        src={videoResource.publicPath}
                        alt={`${videoLabel}二维码`}
                        width={144}
                        height={144}
                        sizes="144px"
                      />
                      <span>{videoUrl ? "扫码观看视频" : "扫码查看视频"}</span>
                    </>
                  ) : null;

                  return (
                    <div className="video-resource__item" key={videoResource.id}>
                      {videoResources.length > 1 ? (
                        <span className="video-resource__label">{videoLabel}</span>
                      ) : null}
                      {isPlayableVideo ? (
                        <video
                          className="video-resource__player"
                          controls
                          playsInline
                          preload="metadata"
                          aria-label={`播放${display.title}的${videoLabel}`}
                        >
                          <source src={videoUrl} type="video/mp4" />
                          您的浏览器不支持视频播放，请使用下方链接打开。
                        </video>
                      ) : null}
                      <div className="video-resource__actions">
                        {videoUrl ? (
                          <a className="video-link" href={videoUrl} target="_blank" rel="noreferrer">
                            <PlayCircle size={19} />
                            播放视频
                            <ExternalLink size={15} />
                          </a>
                        ) : null}
                        {qrContent ? (
                          videoUrl ? (
                            <a
                              className="video-qr-code"
                              href={videoUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`扫码打开${videoLabel}`}
                            >
                              {qrContent}
                            </a>
                          ) : (
                            <span className="video-qr-code" aria-label={`${videoLabel}二维码`}>
                              {qrContent}
                            </span>
                          )
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : display.resources.some((resource) => resource.type === "视频资源") ? (
            <div className="video-source-note" role="note">
              <PlayCircle size={18} />
              <div>
                <strong>暂未提供在线播放链接</strong>
                <span>视频原文件已收录，公开播放地址补充后可在此直接观看。</span>
              </div>
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
                  <h3 id="experiment-step-images">实验图片</h3>
                  {imageGroups.map((group) => (
                    <section className="knowledge-detail__step-group" key={group.key}>
                      <h4>{group.label}</h4>
                      <ol className="knowledge-detail__gallery">
                        {group.images.map((image) => {
                          const caption = experimentImageCaption(image);
                          return (
                            <li key={image.id}>
                              <figure>
                                <span className="knowledge-detail__image knowledge-detail__step-image">
                                  <Image
                                    src={image.publicPath}
                                    alt={`${group.label}：${caption}`}
                                    fill
                                    sizes="(min-width: 720px) 410px, 90vw"
                                  />
                                </span>
                                <figcaption>{caption}</figcaption>
                              </figure>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ))}
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
  initialCategory,
}: {
  initialItems: ScienceKnowledgeSummary[];
  initialResourceId?: string;
  initialCategory?: string;
}) {
  const [selection, setSelection] = useState<ScienceSelection>(() =>
    normalizeScienceSelection(initialItems, {
      category: initialCategory ?? "",
      topic: "",
      ageLabel: "",
    }),
  );
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedSummary, setSelectedSummary] = useState<ScienceKnowledgeSummary | null>(null);
  const [selectedItem, setSelectedItem] = useState<ScienceKnowledgeItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resourceNotice, setResourceNotice] = useState("");
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
  const ages = useMemo(
    () => availableAges(initialItems, selection.category, ""),
    [initialItems, selection.category],
  );
  const ageCounts = useMemo(
    () =>
      new Map(
        ages.map((age) => [
          age,
          initialItems.filter(
            (item) =>
              (!selection.category || item.category === selection.category) &&
              item.ageLabel === age,
          ).length,
        ]),
      ),
    [ages, initialItems, selection.category],
  );

  const filtered = useMemo(
    () => filterScienceItems(initialItems, { ...selection, query: deferredQuery }),
    [deferredQuery, initialItems, selection],
  );

  function changeCategory(category: string) {
    const nextCategory = category === "全部" ? "" : category;
    setSelection(
      normalizeScienceSelection(initialItems, {
        category: nextCategory,
        topic: "",
        ageLabel: "",
      }),
    );
    setVisibleCount(12);
    const nextUrl = nextCategory
      ? `/lab?type=${encodeURIComponent(nextCategory)}`
      : "/lab";
    window.history.replaceState(null, "", nextUrl);
    document.getElementById("lab-results")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function changeAge(ageLabel: string) {
    setSelection({ ...selection, ageLabel: ageLabel === "全部" ? "" : ageLabel });
    setVisibleCount(12);
  }

  const closeDetail = useCallback(() => {
    setSelectedSummary(null);
    setSelectedItem(null);
    setDetailLoading(false);
  }, []);

  const openDetail = useCallback(async (summary: ScienceKnowledgeSummary) => {
    setResourceNotice("");
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

  const openExperimentAgent = useCallback(
    (item: ScienceKnowledgeSummary, action: ExperimentAgentAction) => {
      const prompt = action === "analyze"
        ? `请解析科学实验《${item.title}》。年龄段：${item.ageLabel || "未指定"}；主题：${item.topic || "未指定"}；资源 ID：${item.id}。我会继续补充现场观察或图片。`
        : `请参考科学实验《${item.title}》生成类似主题活动方案。年龄段：${item.ageLabel || "未指定"}；主题：${item.topic || "未指定"}；资源 ID：${item.id}。`;
      window.dispatchEvent(new CustomEvent("kexiaobei:open", { detail: { prompt } }));
    },
    [],
  );

  useEffect(() => {
    if (!initialResourceId || autoOpenedResourceId.current === initialResourceId) return;

    const summary = initialItems.find((item) => item.id === initialResourceId);
    if (!summary) {
      autoOpenedResourceId.current = initialResourceId;
      const noticeTimer = window.setTimeout(() => {
        setResourceNotice("未找到对应资料，可能已更新或下架。请在下方搜索资源名称。");
      }, 0);
      return () => window.clearTimeout(noticeTimer);
    }

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
        activeKey={selection.category}
        onSelect={(item) => changeCategory(item.key)}
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
                <span className="rotating-text">实验室</span>
              </h1>
              <p>汇集园本科学诗、教师实验与家庭实验资料。</p>
              <div className="lab-hero__progress" aria-hidden="true">
                {labHeroPhotos.map((photo, index) => (
                  <span className={index === heroIndex ? "is-active" : ""} key={photo} />
                ))}
              </div>
            </div>
            <div className="lab-search">
              <Link className="lab-search__home" href="/" aria-label="返回首页" title="返回首页">
                <House size={18} aria-hidden="true" />
              </Link>
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
            </div>
          </div>
        </section>

        <section className="lab-shell lab-content" id="lab-results">
          <div className="filter-panel">
            <CompactFilterRow
              label="类型"
              items={["全部", ...categories]}
              value={selection.category}
              onChange={changeCategory}
            />
            <CompactFilterRow
              label="年龄段"
              items={["全部", ...ages]}
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
            <span>{selection.category || "全部"} / {selection.ageLabel || "全部"}</span>
          </div>

          {resourceNotice ? (
            <div className="lab-route-notice" role="status">
              {resourceNotice}
            </div>
          ) : null}

          {filtered.length ? (
            <>
              <div className={`knowledge-grid${selection.category === "科学诗" || selection.category === "科学故事" ? " knowledge-grid--literature" : ""}`}>
                {filtered.slice(0, visibleCount).map((item) => (
                  <KnowledgeCard
                    key={item.id}
                    item={item}
                    onOpen={() => void openDetail(item)}
                    onAgentAction={openExperimentAgent}
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
