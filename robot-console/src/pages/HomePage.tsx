import { ArrowRight, BookOpen, FlaskConical, Image, PlayCircle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SpecularButton } from '../components/SpecularButton';

const HERO_IMAGE =
  '/knowledge/%E5%B0%8F%E7%8F%AD%E4%B8%8A%E5%86%8C/%E5%9B%BE%E7%89%87%E8%B5%84%E6%BA%90/%E7%A7%91%E5%AD%A6%E5%AE%9E%E9%AA%8C/EXP-02_%E4%BC%9A%E7%88%AC%E5%8D%87%E7%9A%84%E5%BD%A9%E8%99%B9/EXP-02_%E5%AE%9E%E9%AA%8C%E6%9D%90%E6%96%99%E5%9B%BE_01.jpg';

const FEATURED = [
  {
    id: 'EXP-01-T',
    title: '自制泡泡液',
    meta: '小班上册 · 教师实验',
    image:
      '/knowledge/%E5%B0%8F%E7%8F%AD%E4%B8%8A%E5%86%8C/%E5%9B%BE%E7%89%87%E8%B5%84%E6%BA%90/%E7%A7%91%E5%AD%A6%E5%AE%9E%E9%AA%8C/EXP-01_%E8%87%AA%E5%88%B6%E6%B3%A1%E6%B3%A1%E6%B6%B2/EXP-01_%E5%AE%9E%E9%AA%8C%E6%9D%90%E6%96%99%E5%9B%BE_01.png',
  },
  {
    id: 'EXP-02-P',
    title: '会爬升的彩虹',
    meta: '小班上册 · 家庭实验',
    image:
      '/knowledge/%E5%B0%8F%E7%8F%AD%E4%B8%8A%E5%86%8C/%E5%9B%BE%E7%89%87%E8%B5%84%E6%BA%90/%E7%A7%91%E5%AD%A6%E5%AE%9E%E9%AA%8C/EXP-02_%E4%BC%9A%E7%88%AC%E5%8D%87%E7%9A%84%E5%BD%A9%E8%99%B9/EXP-02_%E5%AE%9E%E9%AA%8C%E6%9D%90%E6%96%99%E5%9B%BE_01.jpg',
  },
  {
    id: 'EXP-03-T',
    title: '水上烟花',
    meta: '小班上册 · 视频资源',
    image:
      '/knowledge/%E5%B0%8F%E7%8F%AD%E4%B8%8A%E5%86%8C/%E5%9B%BE%E7%89%87%E8%B5%84%E6%BA%90/%E7%A7%91%E5%AD%A6%E5%AE%9E%E9%AA%8C/EXP-03_%E6%B0%B4%E4%B8%8A%E7%83%9F%E8%8A%B1/EXP-03_%E5%AE%9E%E9%AA%8C%E6%9D%90%E6%96%99%E5%9B%BE_01.jpg',
  },
];

const STATS = [
  { value: '178', label: '知识条目', icon: BookOpen },
  { value: '62', label: '图片资源', icon: Image },
  { value: '21', label: '实验视频', icon: PlayCircle },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <main>
      <section className="home-hero" style={{ backgroundImage: `url(${HERO_IMAGE})` }}>
        <div className="home-hero__shade" />
        <div className="page-shell home-hero__content">
          <p className="eyebrow"><Sparkles size={16} /> 温州市龙湾区国科温州第二幼儿园</p>
          <h1>让科学在儿童的真实生活里发生</h1>
          <p className="home-hero__lead">
            从一首科学诗、一次亲子实验到一份完整教案，把园本课程变成可检索、可实践、可持续生长的知识资源。
          </p>
          <div className="home-hero__actions">
            <SpecularButton icon={<FlaskConical size={18} />} onClick={() => navigate('/lab')}>
              进入科小贝实验室
            </SpecularButton>
            <SpecularButton tone="ink" icon={<BookOpen size={18} />} onClick={() => navigate('/overview')}>
              了解国科二幼
            </SpecularButton>
          </div>
        </div>
      </section>

      <section className="stat-band" aria-label="资源统计">
        <div className="page-shell stat-band__inner">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div className="stat-item" key={label}>
              <Icon size={22} aria-hidden="true" />
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="content-band">
        <div className="page-shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--dark">精选园本资源</p>
              <h2>从今天就能开展的科学活动开始</h2>
            </div>
            <button className="text-link" type="button" onClick={() => navigate('/lab')}>
              浏览全部 <ArrowRight size={17} />
            </button>
          </div>
          <div className="featured-grid">
            {FEATURED.map((item) => (
              <button
                key={item.id}
                type="button"
                className="featured-card"
                onClick={() => navigate(`/lab?item=${item.id}`)}
              >
                <img src={item.image} alt={item.title} loading="lazy" />
                <span className="featured-card__body">
                  <span>{item.meta}</span>
                  <strong>{item.title}</strong>
                  <small>查看资料 <ArrowRight size={15} /></small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band content-band--soft">
        <div className="page-shell home-values">
          <div className="home-values__intro">
            <p className="eyebrow eyebrow--dark">科学 + 教育内核</p>
            <h2>把好奇心变成儿童主动探究的路径</h2>
          </div>
          <div className="home-values__list">
            <div><strong>可探</strong><span>从儿童可触摸、可观察的生活材料出发。</span></div>
            <div><strong>可做</strong><span>教师版与家长版双线支持园内和家庭实践。</span></div>
            <div><strong>可循</strong><span>按年龄、学期和资源类型建立清晰的课程索引。</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
