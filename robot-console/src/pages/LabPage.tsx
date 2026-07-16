import { AnimatePresence, motion } from 'motion/react';
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
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import { useSearchParams } from 'react-router-dom';
import { PillNav } from '../components/PillNav';
import { RotatingText } from '../components/RotatingText';
import { getPublicImages, loadKnowledge } from '../lib/knowledge';
import type {
  CategoryFilter,
  KnowledgeItem,
  ResourceFilter,
  SemesterFilter,
} from '../types';

const SEMESTERS = [
  '全部学期',
  '小班上册',
  '小班下册',
  '中班上册',
  '中班下册',
  '大班上册',
  '大班下册',
] as const;

const CATEGORIES = [
  '全部内容',
  '科学诗',
  '科学故事',
  '科学实验（教师版）',
  '科学实验（家长版）',
] as const;

const RESOURCE_TYPES = ['全部资源', '图片资源', '教案资源', '视频资源'] as const;

function ResourceIcon({ type }: { type: string }) {
  if (type === '图片资源') return <ImageIcon size={14} />;
  if (type === '视频资源') return <PlayCircle size={14} />;
  return <FileText size={14} />;
}

function KnowledgeCard({ item, onOpen }: { item: KnowledgeItem; onOpen: () => void }) {
  const thumbnail = getPublicImages(item)[0];
  return (
    <button type="button" className="knowledge-card" onClick={onOpen}>
      <span className={`knowledge-card__media${thumbnail ? '' : ' is-placeholder'}`}>
        {thumbnail ? (
          <img src={thumbnail.publicPath} alt={thumbnail.title} loading="lazy" />
        ) : (
          <span className="knowledge-card__placeholder" aria-hidden="true">
            {item.category === '科学诗' ? <BookOpen size={34} /> : <FlaskConical size={34} />}
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
              <span key={type} title={type}><ResourceIcon type={type} /></span>
            ))}
          </span>
          <span className="knowledge-card__open">查看资料 <ArrowRight size={15} /></span>
        </span>
      </span>
    </button>
  );
}

function KnowledgeDetail({ item, onClose }: { item: KnowledgeItem; onClose: () => void }) {
  const images = getPublicImages(item);
  const videoUrl = item.videoUrl || item.resources.find((resource) => resource.type === '视频资源')?.externalUrl;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className="detail-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button type="button" className="detail-overlay__backdrop" onClick={onClose} aria-label="关闭资料" />
      <motion.article
        className="knowledge-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-detail-title"
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      >
        <header className="knowledge-detail__header">
          <div>
            <span>{item.semester} · {item.category}</span>
            <h2 id="knowledge-detail-title">{item.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭">
            <X size={21} />
          </button>
        </header>
        <div className="knowledge-detail__scroll">
          <div className="knowledge-detail__meta">
            {item.author && <span>作者/提供者：{item.author}</span>}
            <span>来源：{item.sourceFile}{item.sourcePage ? ` · 第 ${item.sourcePage} 页` : ''}</span>
          </div>

          {images.length > 0 && (
            <div className="knowledge-detail__gallery">
              {images.map((image) => (
                <figure key={image.id}>
                  <img src={image.publicPath} alt={image.title} loading="lazy" />
                  <figcaption>{image.title}</figcaption>
                </figure>
              ))}
            </div>
          )}

          {videoUrl && (
            <a className="video-link" href={videoUrl} target="_blank" rel="noreferrer">
              <PlayCircle size={19} /> 播放实验视频 <ExternalLink size={15} />
            </a>
          )}

          <div className="markdown-content knowledge-detail__content">
            <Markdown urlTransform={(url) => url}>{item.body}</Markdown>
          </div>
        </div>
      </motion.article>
    </motion.div>
  );
}

export function LabPage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [semester, setSemester] = useState<SemesterFilter>('全部学期');
  const [category, setCategory] = useState<CategoryFilter>('全部内容');
  const [resourceType, setResourceType] = useState<ResourceFilter>('全部资源');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [searchParams, setSearchParams] = useSearchParams();
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('zh-CN'));

  useEffect(() => {
    let active = true;
    loadKnowledge()
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setError('资料暂时无法加载，请稍后重试。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVisibleCount(12);
  }, [semester, category, resourceType, deferredQuery]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (semester !== '全部学期' && item.semester !== semester) return false;
      if (category !== '全部内容' && item.category !== category) return false;
      if (resourceType !== '全部资源' && !item.resourceTypes.includes(resourceType)) return false;
      if (!deferredQuery) return true;
      const haystack = [item.title, item.author, item.topic, item.excerpt, ...item.tags]
        .join(' ')
        .toLocaleLowerCase('zh-CN');
      return haystack.includes(deferredQuery);
    });
  }, [category, deferredQuery, items, resourceType, semester]);

  const selectedItem = useMemo(() => {
    const id = searchParams.get('item');
    return id ? items.find((item) => item.id === id) ?? null : null;
  }, [items, searchParams]);

  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    setSearchParams(next, { replace: true });
  };

  const openDetail = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('item', id);
    setSearchParams(next);
  };

  return (
    <main className="lab-page">
      <section className="lab-hero">
        <div className="page-shell lab-hero__inner">
          <div>
            <p className="eyebrow eyebrow--dark">国科二幼园本资源中心</p>
            <h1>科小贝<RotatingText words={['实验室', '科学诗库', '亲子探索站']} /></h1>
            <p>按学期、内容和资源形态快速找到可直接使用的科学活动资料。</p>
          </div>
          <label className="lab-search">
            <Search size={20} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索实验、科学诗或作者"
              aria-label="搜索知识库"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} title="清空搜索">
                <X size={17} />
              </button>
            )}
          </label>
        </div>
      </section>

      <section className="page-shell lab-content">
        <div className="filter-panel">
          <PillNav<SemesterFilter> label="学期" items={SEMESTERS} value={semester} onChange={setSemester} />
          <PillNav<CategoryFilter> label="内容" items={CATEGORIES} value={category} onChange={setCategory} />
          <PillNav<ResourceFilter> label="资源" items={RESOURCE_TYPES} value={resourceType} onChange={setResourceType} />
        </div>

        <div className="results-heading">
          <div>
            <strong>{filtered.length}</strong>
            <span> 条匹配资料</span>
          </div>
          <span>资料来自国科二幼园本知识库</span>
        </div>

        {loading ? (
          <div className="state-message"><LoaderCircle className="spin" size={24} /> 正在加载资料</div>
        ) : error ? (
          <div className="state-message">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="state-message state-message--empty">
            <BookOpen size={30} />
            <strong>暂时没有匹配资料</strong>
            <span>可以切换筛选条件或换一个关键词。</span>
          </div>
        ) : (
          <>
            <div className="knowledge-grid">
              {filtered.slice(0, visibleCount).map((item) => (
                <KnowledgeCard key={item.id} item={item} onOpen={() => openDetail(item.id)} />
              ))}
            </div>
            {visibleCount < filtered.length && (
              <button
                type="button"
                className="load-more"
                onClick={() => setVisibleCount((count) => count + 12)}
              >
                加载更多
              </button>
            )}
          </>
        )}
      </section>

      <AnimatePresence>
        {selectedItem && <KnowledgeDetail item={selectedItem} onClose={closeDetail} />}
      </AnimatePresence>
    </main>
  );
}
