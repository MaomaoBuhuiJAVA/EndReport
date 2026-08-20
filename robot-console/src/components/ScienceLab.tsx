"use client";

import Image from "next/image";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  FileText,
  FlaskConical,
  House,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  PlayCircle,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { GardenSeal } from "@/components/GardenSeal";
import Markdown from "react-markdown";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  type FormEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GooeyNav, type GooeyNavItem } from "@/components/GooeyNav";
import { MobileAppNav, type MobileAppNavItem } from "@/components/MobileAppNav";
import { SciencePet } from "@/components/SciencePet";
import type { AiChatCoverSync } from "@/lib/ai-chat-stream";
import {
  SCIENCE_AGE_GROUPS,
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
  { key: "works", label: "作品展示", href: "/works" },
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
  return item.category === "科学故事"
    ? item.coverUrl || `/science-story-covers/${item.id}.webp`
    : "";
}

function sciencePoemCoverPath(item: ScienceKnowledgeSummary) {
  return item.category === "科学诗"
    ? item.coverUrl || `/science-poem-covers/${item.id}.webp`
    : "";
}

function dynamicLiteratureCover(item: ScienceKnowledgeSummary) {
  return item.coverUrl || "";
}

function isDirectVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(?:mp4|webm|mov|m4v)(?:$|[?#])/iu.test(url.pathname);
  } catch {
    return false;
  }
}

function videoMimeType(value: string) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    if (pathname.endsWith(".webm")) return "video/webm";
    if (pathname.endsWith(".mov")) return "video/quicktime";
    if (pathname.endsWith(".m4v")) return "video/x-m4v";
  } catch {
    // Invalid URLs are filtered by isDirectVideoUrl before this is used.
  }
  return "video/mp4";
}

function StoryVideoCover({ source, fallback, onError }: { source: string; fallback: string; onError: () => void }) {
  const [frame, setFrame] = useState("");
  useEffect(() => {
    let disposed = false;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    video.src = source;
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      try {
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/webp", 0.86);
        if (!disposed) setFrame(dataUrl);
      } catch {
        if (!disposed) onError();
      }
    };
    video.addEventListener("loadeddata", capture, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.load();
    return () => {
      disposed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [onError, source]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={frame || fallback} alt="" className="knowledge-card__literature-art" aria-hidden="true" />;
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
  // Keep the failed source URL instead of a boolean. A newly generated cover
  // has a different URL, so it can render immediately without an extra effect.
  const [failedStoryCover, setFailedStoryCover] = useState("");
  const [failedPoemCover, setFailedPoemCover] = useState("");
  const categoryVisual =
    categoryVisuals[item.category as keyof typeof categoryVisuals] ?? categoryVisuals.科学实验;
  const CategoryIcon = categoryVisual.icon;
  const mediaVariant = item.category === "科学诗" ? "poetry" : item.category === "科学故事" ? "story" : "experiment";
  const storyCover = scienceStoryCoverPath(item);
  const poemCover = sciencePoemCoverPath(item);
  const storyVideoUrl = item.videoUrl ?? "";
  const storyCoverFailed = Boolean(storyCover && failedStoryCover === storyCover);
  const poemCoverFailed = Boolean(poemCover && failedPoemCover === poemCover);
  const [useStoryVideoCover, setUseStoryVideoCover] = useState(false);
  const dynamicCover = dynamicLiteratureCover(item);
  const literatureImage = isStory && storyCover
    ? storyCoverFailed ? categoryVisual.image : storyCover
    : isPoem && poemCover
      ? poemCoverFailed ? categoryVisual.image : poemCover
      : categoryVisual.image;
  const handleStoryCoverError = useCallback(() => setFailedStoryCover(storyCover), [storyCover]);
  const handleStoryImageError = useCallback(() => {
    if (!storyCoverFailed && !item.coverUrl && isDirectVideoUrl(storyVideoUrl)) {
      setUseStoryVideoCover(true);
      return;
    }
    setFailedStoryCover(storyCover);
  }, [item.coverUrl, storyCover, storyCoverFailed, storyVideoUrl]);
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
            {isStory && useStoryVideoCover && !storyCoverFailed && isDirectVideoUrl(storyVideoUrl) ? (
              <StoryVideoCover
                source={storyVideoUrl}
                fallback={categoryVisual.image}
                onError={() => {
                  setUseStoryVideoCover(false);
                  handleStoryCoverError();
                }}
              />
            ) : dynamicCover ? (
              // Generated cover URLs can be served by Blob or Dify at runtime.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={literatureImage}
                alt=""
                className="knowledge-card__literature-art"
                onError={isStory ? handleStoryImageError : isPoem ? () => setFailedPoemCover(poemCover) : undefined}
                aria-hidden="true"
              />
            ) : (
              <Image
                src={literatureImage}
                alt=""
                fill
                unoptimized
                sizes="(min-width: 720px) 30vw, 46vw"
                className="knowledge-card__literature-art"
                onError={isStory ? handleStoryImageError : isPoem ? () => setFailedPoemCover(poemCover) : undefined}
                aria-hidden="true"
              />
            )}
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
  const userSubmittedLiterature =
    (display.category === "科学诗" || display.category === "科学故事") &&
    item?.allocationBasis === "用户提交";
  // Story covers are the first frame of the video. They belong on the
  // catalogue card and as the video's poster, so showing them again as a
  // gallery item creates a duplicate block in the detail dialog. User-
  // submitted poem covers follow the same rule, while built-in poem artwork
  // remains available as the poem's detail image.
  const detailImages = display.category === "科学故事" || userSubmittedLiterature
    ? images.filter((image) => !/(?:封面|cover)/iu.test(image.title))
    : images;
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
  const videoPoster =
    display.coverUrl ||
    images.find((image) => /(?:封面|cover)/iu.test(image.title))?.publicPath ||
    (display.category === "科学故事" ? scienceStoryCoverPath(display) : "");

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

          {detailImages.length && display.category !== "科学实验" ? (
            <div className="knowledge-detail__gallery">
              {detailImages.map((image) => (
                <figure key={image.id}>
                  <span className="knowledge-detail__image">
                    <Image
                      src={image.publicPath}
                      alt={image.title}
                      fill
                      unoptimized={/^https?:\/\//iu.test(image.publicPath)}
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
                          poster={videoPoster || undefined}
                          aria-label={`播放${display.title}的${videoLabel}`}
                        >
                          <source src={videoUrl ?? ""} type={videoMimeType(videoUrl ?? "")} />
                          您的浏览器不支持视频播放，请使用下方链接打开。
                        </video>
                      ) : null}
                      <div className="video-resource__actions">
                        {videoUrl ? (
                          <a className="video-link" href={videoUrl} target="_blank" rel="noreferrer">
                            <PlayCircle size={19} />
                            {isPlayableVideo ? "播放视频" : "打开视频页面"}
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

type MaterialCategory = "科学诗" | "科学故事";

type MaterialFormState = {
  title: string;
  ageLabel: string;
  topic: string;
  author: string;
  description: string;
  poemText: string;
};

type MaterialSubmitPayload = {
  category: MaterialCategory;
  form: MaterialFormState;
  coverFile: File | null;
  poemFile: File | null;
  videoFile: File | null;
  supportingFile: File | null;
  onUploadProgress: (percentage: number | null) => void;
};

type MaterialSuccessNotice = {
  title: string;
  description: string;
};

const EMPTY_MATERIAL_FORM: MaterialFormState = {
  title: "",
  ageLabel: "",
  topic: "",
  author: "",
  description: "",
  poemText: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = textValue(record[key]);
    if (value) return value;
  }
  return "";
}

function summaryFromMaterialResponse(
  payload: unknown,
  category: MaterialCategory,
  form: MaterialFormState,
): ScienceKnowledgeSummary | null {
  const root = isRecord(payload) ? payload : null;
  if (!root) return null;
  const candidate = [root.item, root.summary, root.resource].find(isRecord) ?? root;
  const id = firstText(candidate, ["id", "baseId", "resourceId"]);
  const title = firstText(candidate, ["title", "name"]) || form.title.trim();
  if (!id || !title) return null;

  const resources = Array.isArray(candidate.resources)
    ? candidate.resources as ScienceKnowledgeSummary["resources"]
    : [];
  const resourceTypes = Array.isArray(candidate.resourceTypes)
    ? candidate.resourceTypes.filter((value): value is ScienceKnowledgeSummary["resourceTypes"][number] => typeof value === "string")
    : [];
  const result: ScienceKnowledgeSummary = {
    id,
    baseId: firstText(candidate, ["baseId"]) || id,
    semester: firstText(candidate, ["semester"]) || "2026",
    category,
    title,
    ageLabel: firstText(candidate, ["ageLabel", "age", "ageGroup"]) || form.ageLabel,
    topic: firstText(candidate, ["topic", "theme", "subject"]) || form.topic,
    author: firstText(candidate, ["author", "provider", "creator"]) || form.author,
    excerpt: firstText(candidate, ["excerpt", "description", "summary"]) || form.description || form.poemText.slice(0, 120),
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((value): value is string => typeof value === "string") : [],
    resourceTypes,
    resources,
  };
  const coverUrl = firstText(candidate, ["coverUrl", "cover_url", "coverPath"]);
  if (coverUrl) result.coverUrl = coverUrl;
  return result;
}

function uploadPathSegment(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(-100) || "attachment";
}

/**
 * The story video is still local at this point, so its first decodable frame
 * can be safely rendered to a canvas and saved as the card cover.  A failed
 * extraction must not prevent the video itself from being submitted.
 */
async function extractVideoFirstFrame(file: File): Promise<File | null> {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;

  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(file);
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    let finished = false;
    let targetTime = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("seeked", captureFrame);
      video.removeEventListener("error", handleError);
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // The element is never attached to the page, so releasing the URL is enough.
      }
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (cover: File | null) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(cover);
    };

    const captureFrame = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(null);
        return;
      }

      try {
        const maxWidth = 1280;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          finish(null);
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            finish(null);
            return;
          }
          const fileStem = file.name.replace(/\.[^.]+$/, "").trim() || "story";
          finish(new File([blob], `${fileStem}-cover.webp`, { type: "image/webp" }));
        }, "image/webp", 0.86);
      } catch {
        finish(null);
      }
    };

    const handleMetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      targetTime = duration > 0 ? Math.min(0.1, Math.max(0, duration - 0.001)) : 0;
      if (targetTime > 0) {
        try {
          video.currentTime = targetTime;
        } catch {
          captureFrame();
        }
      } else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        captureFrame();
      }
    };

    const handleLoadedData = () => {
      if (targetTime <= 0) captureFrame();
    };

    const handleError = () => finish(null);

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("loadedmetadata", handleMetadata);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("seeked", captureFrame);
    video.addEventListener("error", handleError);
    const timeoutId = window.setTimeout(() => finish(null), 12_000);
    video.src = objectUrl;
    video.load();
  });
}

async function uploadMaterialFile(
  file: File,
  folder: "poems" | "stories" | "supporting" | "covers",
  onProgress: (percentage: number | null) => void,
) {
  try {
    const blob = await upload(
      `science-resources/${folder}/${crypto.randomUUID()}-${uploadPathSegment(file.name)}`,
      file,
      {
        access: "public",
        handleUploadUrl: "/api/science-resources/upload",
        ...(file.type ? { contentType: file.type } : {}),
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
      },
    );
    return blob.url;
  } catch {
    throw new Error("文件暂时无法上传，请稍后重试");
  }
}

function ScienceMaterialDialog({
  category,
  submitting,
  onClose,
  onSubmit,
}: {
  category: MaterialCategory;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: MaterialSubmitPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<MaterialFormState>(EMPTY_MATERIAL_FORM);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [poemFile, setPoemFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionNotice, setRecognitionNotice] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, submitting]);

  async function recognizePoemFile(file: File) {
    setRecognizing(true);
    setRecognitionNotice("正在识别文件内容…");
    const requestBody = new FormData();
    requestBody.set("file", file);
    requestBody.set("category", "科学诗");

    try {
      const response = await fetch("/api/science-resources/recognize", {
        method: "POST",
        body: requestBody,
      });
      if (!response.ok) throw new Error("recognition failed");
      const payload = (await response.json()) as unknown;
      const root = isRecord(payload) ? payload : {};
      const candidate = [root.fields, root.data, root.result, root.item, root].find(isRecord);
      if (!candidate) throw new Error("empty recognition result");

      setForm((current) => ({
        ...current,
        title: firstText(candidate, ["title", "name", "poemTitle"]) || current.title,
        ageLabel: firstText(candidate, ["ageLabel", "age", "ageGroup"]) || current.ageLabel,
        topic: firstText(candidate, ["topic", "theme", "subject"]) || current.topic,
        author: firstText(candidate, ["author", "provider", "creator"]) || current.author,
        poemText: firstText(candidate, ["poemText", "content", "body", "text"]) || current.poemText,
        description: firstText(candidate, ["description", "excerpt", "summary"]) || current.description,
      }));
      setRecognitionNotice("已识别并填入表单，请检查后提交");
    } catch {
      setRecognitionNotice("暂时无法自动识别，请继续手动填写");
    } finally {
      setRecognizing(false);
    }
  }

  function updateField(field: keyof MaterialFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handlePoemFile(file: File | null) {
    setPoemFile(file);
    setRecognitionNotice("");
    if (file) void recognizePoemFile(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit({
      category,
      form,
      coverFile,
      poemFile,
      videoFile,
      supportingFile,
      onUploadProgress: setUploadProgress,
    });
  }

  const isPoem = category === "科学诗";

  return (
    <motion.div
      className="detail-overlay science-material-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        className="detail-overlay__backdrop"
        onClick={() => {
          if (!submitting) onClose();
        }}
        aria-label="关闭新增材料"
      />
      <motion.article
        className="science-material-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="science-material-dialog-title"
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
      >
        <header className="knowledge-detail__header science-material-dialog__header">
          <div>
            <span>新增园本资料 · {category}</span>
            <h2 id="science-material-dialog-title">添加新材料</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            title="关闭"
            disabled={submitting}
          >
            <X size={21} />
          </button>
        </header>

        <form className="science-material-dialog__form" onSubmit={handleSubmit}>
          <p className="science-material-dialog__hint">
            带 <b>*</b> 的信息为必填项。提交后材料会进入资料列表，{isPoem ? "上传封面时优先使用；未上传时会自动生成卡通封面并替换默认封面。" : "上传封面时优先使用；未上传时视频首帧会自动作为卡片封面，视频也会作为资料详情中的可播放资源。"}
          </p>

          <div className="science-material-dialog__fields">
            <label>
              <span>标题 <b>*</b></span>
              <input
                required
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder={isPoem ? "例如：会发光的萤火虫" : "例如：小水滴的旅行"}
              />
            </label>
            <label>
              <span>适用年龄段 <b>*</b></span>
              <select
                required
                value={form.ageLabel}
                onChange={(event) => updateField("ageLabel", event.target.value)}
              >
                <option value="">请选择年龄段</option>
                {SCIENCE_AGE_GROUPS.map((age) => <option key={age} value={age}>{age}</option>)}
              </select>
            </label>
            <label>
              <span>科学主题 <b>*</b></span>
              <input
                required
                value={form.topic}
                onChange={(event) => updateField("topic", event.target.value)}
                placeholder="例如：生命科学、光与影"
              />
            </label>
            <label>
              <span>作者 / 提供者 <b>*</b></span>
              <input
                required
                value={form.author}
                onChange={(event) => updateField("author", event.target.value)}
                placeholder="填写姓名或班级"
              />
            </label>
          </div>

          {isPoem ? (
            <label className="science-material-dialog__wide-field">
              <span>科学诗正文 <b>*</b></span>
              <textarea
                required
                value={form.poemText}
                onChange={(event) => updateField("poemText", event.target.value)}
                placeholder="输入科学诗正文，也可以先上传文件让 AI 帮你填充"
                rows={7}
              />
            </label>
          ) : (
            <label className="science-material-dialog__wide-field">
              <span>内容简介 / 教学提示 <b>*</b></span>
              <textarea
                required
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="简要说明故事内容、科学发现或引导重点"
                rows={5}
              />
            </label>
          )}

          <div className="science-material-dialog__uploads">
            {isPoem ? (
              <div className="science-material-dialog__upload-field">
                <span>诗歌文件 / 图片（可选）</span>
                <label className="science-material-dialog__file-picker">
                  <Upload size={17} />
                  <span>{poemFile ? poemFile.name : "上传后 AI 识别并填充"}</span>
                  <input
                    type="file"
                    accept=".txt,.doc,.docx,.pdf,image/*"
                    onChange={(event) => handlePoemFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {recognizing || recognitionNotice ? (
                  <small className={recognizing ? "is-loading" : ""}>
                    {recognizing ? <LoaderCircle size={13} className="spin" /> : null}
                    {recognitionNotice}
                  </small>
                ) : null}
              </div>
            ) : (
              <div className="science-material-dialog__upload-field">
                <span>故事视频 <b>*</b></span>
                <label className="science-material-dialog__file-picker">
                  <Upload size={17} />
                  <span>{videoFile ? videoFile.name : "上传视频文件"}</span>
                  <input
                    required={!videoFile}
                    type="file"
                    accept="video/*,.mp4,.webm,.mov"
                    onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )}
            <div className="science-material-dialog__upload-field">
              <span>封面图片（可选）</span>
              <label className="science-material-dialog__file-picker">
                <Upload size={17} />
                <span>{coverFile ? coverFile.name : isPoem ? "不上传则自动生成卡通封面" : "不上传则使用视频首帧"}</span>
                <input
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="science-material-dialog__upload-field">
              <span>补充材料（可选）</span>
              <label className="science-material-dialog__file-picker">
                <Upload size={17} />
                <span>{supportingFile ? supportingFile.name : "上传图片或文档"}</span>
                <input
                  type="file"
                  accept="image/*,.txt,.doc,.docx,.pdf,.ppt,.pptx"
                  onChange={(event) => setSupportingFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <footer className="science-material-dialog__actions">
            <button type="button" className="science-material-dialog__cancel" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="science-material-dialog__submit" disabled={submitting || recognizing}>
              {submitting ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}
              {submitting
                ? uploadProgress === null ? "提交中…" : `正在上传 ${uploadProgress}%`
                : "提交新材料"}
            </button>
          </footer>
        </form>
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
  const [items, setItems] = useState<ScienceKnowledgeSummary[]>(initialItems);
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
  const [materialSuccessNotice, setMaterialSuccessNotice] = useState<MaterialSuccessNotice | null>(null);
  const [materialCategory, setMaterialCategory] = useState<MaterialCategory | null>(null);
  const [materialSubmitting, setMaterialSubmitting] = useState(false);
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

  useEffect(() => {
    if (!materialSuccessNotice) return;
    const timer = window.setTimeout(() => setMaterialSuccessNotice(null), 5200);
    return () => window.clearTimeout(timer);
  }, [materialSuccessNotice]);

  useEffect(() => {
    function applySyncedCover(event: Event) {
      const sync = (event as CustomEvent<AiChatCoverSync>).detail;
      if (!sync?.itemId || !sync.coverUrl) return;

      setItems((current) => current.map((item) => (
        item.id === sync.itemId ? { ...item, coverUrl: sync.coverUrl } : item
      )));
      setSelectedSummary((current) => (
        current?.id === sync.itemId ? { ...current, coverUrl: sync.coverUrl } : current
      ));
      setSelectedItem((current) => {
        if (current?.id !== sync.itemId) return current;
        const existingCover = current.resources.find(
          (resource) => resource.type === "图片资源" && /(?:封面|cover)/iu.test(resource.title),
        );
        const resources = existingCover
          ? current.resources.map((resource) => resource.id === existingCover.id
            ? { ...resource, publicPath: sync.coverUrl, externalUrl: sync.coverUrl }
            : resource)
          : [
            ...current.resources,
            {
              id: `synced-cover-${sync.itemId}`,
              type: "图片资源" as const,
              knowledgeBaseId: current.baseId,
              semester: current.semester,
              title: `${current.title} · 封面`,
              filePath: current.sourceFile,
              publicPath: sync.coverUrl,
              externalUrl: sync.coverUrl,
              source: "科小贝智能体生成封面",
              isPublic: true,
            },
          ];
        return { ...current, coverUrl: sync.coverUrl, resources };
      });
      setMaterialSuccessNotice({
        title: "封面已同步",
        description: `《${sync.title}》的新卡通封面已更新到资料库`,
      });
    }

    window.addEventListener("kexiaobei:cover-synced", applySyncedCover);
    return () => window.removeEventListener("kexiaobei:cover-synced", applySyncedCover);
  }, []);

  const categories = useMemo(() => availableTypes(items), [items]);
  const ages = useMemo(
    () => availableAges(initialItems, selection.category, ""),
    [initialItems, selection.category],
  );
  const ageCounts = useMemo(
    () =>
      new Map(
        ages.map((age) => [
          age,
          items.filter(
            (item) =>
              (!selection.category || item.category === selection.category) &&
              item.ageLabel === age,
          ).length,
        ]),
      ),
    [ages, items, selection.category],
  );

  const filtered = useMemo(
    () => filterScienceItems(items, { ...selection, query: deferredQuery }),
    [deferredQuery, items, selection],
  );

  function changeCategory(category: string) {
    const nextCategory = category === "全部" ? "" : category;
    setSelection(
      normalizeScienceSelection(items, {
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
        : `请参考科学实验《${item.title}》生成一份同主题活动方案。主题：《${item.title}》；班级（适用年龄段）：${item.ageLabel || "未指定"}；活动时长：20 分钟；输出格式：Word 文档。只输出当前主题方案，不附加其他实验链接或推荐资源。请同时导出为 DOCX 文件。参考资料主题：${item.topic || "未指定"}；资源 ID：${item.id}。`;
      window.dispatchEvent(new CustomEvent("kexiaobei:open", {
        detail: {
          prompt,
          ...(action === "similar"
            ? {
              lessonPlan: {
                title: item.title,
                ageGroup: item.ageLabel || "中班",
                duration: "20 分钟",
                wantsDocx: true,
              },
            }
            : {}),
        },
      }));
    },
    [],
  );

  const submitMaterial = useCallback(async ({
    category,
    form,
    coverFile,
    poemFile,
    videoFile,
    supportingFile,
    onUploadProgress,
  }: MaterialSubmitPayload) => {
    setMaterialSubmitting(true);
    setResourceNotice("");
    setMaterialSuccessNotice(null);
    onUploadProgress(null);
    const requestBody = new FormData();
    requestBody.set("category", category);
    requestBody.set("title", form.title.trim());
    requestBody.set("ageLabel", form.ageLabel.trim());
    requestBody.set("topic", form.topic.trim());
    requestBody.set("author", form.author.trim());
    requestBody.set("description", form.description.trim());
    requestBody.set("poemText", form.poemText.trim());
    let storyCoverReady = false;
    let uploadedCoverReady = false;

    try {
      if (coverFile) {
        const coverUrl = await uploadMaterialFile(coverFile, "covers", onUploadProgress);
        requestBody.set("coverUrl", coverUrl);
        uploadedCoverReady = true;
      }
      if (category === "科学故事" && videoFile) {
        const [videoUrl, storyCover] = await Promise.all([
          uploadMaterialFile(videoFile, "stories", onUploadProgress),
          uploadedCoverReady ? Promise.resolve(null) : extractVideoFirstFrame(videoFile),
        ]);
        requestBody.set("videoUrl", videoUrl);

        if (!uploadedCoverReady && storyCover) {
          try {
            const coverUrl = await uploadMaterialFile(storyCover, "covers", onUploadProgress);
            requestBody.set("coverUrl", coverUrl);
            storyCoverReady = true;
          } catch {
            // A video without a usable browser thumbnail can still be shared.
          }
        }
      }
      if (poemFile) {
        requestBody.set("documentUrl", await uploadMaterialFile(poemFile, "poems", onUploadProgress));
        requestBody.set("documentName", poemFile.name);
      }
      if (supportingFile) {
        requestBody.set("supportingUrl", await uploadMaterialFile(supportingFile, "supporting", onUploadProgress));
        requestBody.set("supportingName", supportingFile.name);
      }
      onUploadProgress(null);
      const response = await fetch("/api/science-resources", {
        method: "POST",
        body: requestBody,
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const message = isRecord(payload) ? firstText(payload, ["error", "message"]) : "";
        throw new Error(message || "材料暂时无法保存，请稍后重试");
      }

      const createdSummary = summaryFromMaterialResponse(payload, category, form);
      if (!createdSummary) {
        throw new Error("材料已提交，但服务器未返回资料摘要，请刷新后查看");
      }

      setItems((current) => [createdSummary, ...current.filter((item) => item.id !== createdSummary.id)]);
      setSelection((current) => ({ ...current, category, topic: "", ageLabel: "" }));
      setVisibleCount(12);
      setMaterialCategory(null);
      setMaterialSuccessNotice({
        title: "添加成功",
        description: category === "科学诗"
          ? uploadedCoverReady
            ? `《${createdSummary.title}》已加入资源库，已使用上传封面`
            : `《${createdSummary.title}》已加入资源库，正在生成卡通封面`
          : uploadedCoverReady
            ? `《${createdSummary.title}》已加入资源库，已使用上传封面`
            : storyCoverReady
            ? `《${createdSummary.title}》已加入资源库，已使用视频首帧作为封面`
            : `《${createdSummary.title}》已加入资源库`,
      });

      if (category === "科学诗" && !uploadedCoverReady) {
        void (async () => {
          try {
            const coverResponse = await fetch("/api/science-resources/generate-cover", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: createdSummary.title,
                category,
                topic: createdSummary.topic,
                poem: form.poemText,
                author: createdSummary.author,
              }),
            });
            const coverPayload = (await coverResponse.json().catch(() => null)) as unknown;
            const coverUrl = isRecord(coverPayload) ? firstText(coverPayload, ["coverUrl"]) : "";
            const coverPersisted = isRecord(coverPayload) && coverPayload.persisted === true;
            if (!coverResponse.ok || !coverUrl || !coverPersisted) throw new Error("cover generation failed");

            const persistResponse = await fetch("/api/science-resources/sync-cover", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: createdSummary.id, coverUrl }),
            });
            const persistedPayload = (await persistResponse.json().catch(() => null)) as unknown;
            const persistedCoverUrl = isRecord(persistedPayload)
              ? firstText(persistedPayload, ["coverUrl", "cover_url"])
              : "";
            if (!persistResponse.ok || !persistedCoverUrl) throw new Error("cover persistence failed");
            const persisted = { ...createdSummary, coverUrl: persistedCoverUrl };

            setItems((current) => current.map((item) => item.id === persisted.id ? persisted : item));
            setMaterialSuccessNotice({
              title: "封面已生成",
              description: `《${persisted.title}》的卡通封面已自动生成`,
            });
          } catch {
            setResourceNotice(`科学诗《${createdSummary.title}》已添加，封面暂时未能生成，可稍后重新提交生成。`);
          }
        })();
      }
    } catch (error) {
      onUploadProgress(null);
      setResourceNotice(error instanceof Error ? error.message : "材料暂时无法保存，请稍后重试");
    } finally {
      setMaterialSubmitting(false);
    }
  }, []);

  useEffect(() => {
    if (!initialResourceId || autoOpenedResourceId.current === initialResourceId) return;

    const summary = initialItems.find((item) => item.id === initialResourceId) ??
      items.find((item) => item.id === initialResourceId);
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
  }, [initialItems, initialResourceId, items, openDetail]);

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
            <div className="results-heading__context">
              <span>{selection.category || "全部"} / {selection.ageLabel || "全部"}</span>
              {selection.category === "科学诗" || selection.category === "科学故事" ? (
                <button
                  type="button"
                  className="science-material-add"
                  aria-label="添加新材料"
                  title="添加新材料"
                  onClick={() => setMaterialCategory(selection.category as MaterialCategory)}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
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
        {materialCategory ? (
          <ScienceMaterialDialog
            key={materialCategory}
            category={materialCategory}
            submitting={materialSubmitting}
            onClose={() => {
              if (!materialSubmitting) setMaterialCategory(null);
            }}
            onSubmit={submitMaterial}
          />
        ) : null}
        {materialSuccessNotice ? (
          <motion.div
            className="science-material-success-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            <span className="science-material-success-toast__wave" aria-hidden="true" />
            <span className="science-material-success-toast__icon" aria-hidden="true">
              <CheckCircle2 size={18} strokeWidth={2.7} />
            </span>
            <span className="science-material-success-toast__copy">
              <strong>{materialSuccessNotice.title}</strong>
              <small>{materialSuccessNotice.description}</small>
            </span>
            <button
              type="button"
              className="science-material-success-toast__close"
              onClick={() => setMaterialSuccessNotice(null)}
              title="关闭提示"
              aria-label="关闭添加成功提示"
            >
              <X size={18} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SciencePet />
    </div>
  );
}
