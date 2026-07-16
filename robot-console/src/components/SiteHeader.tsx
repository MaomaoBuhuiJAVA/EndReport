import { Microscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GooeyNav, type GooeyNavItem } from './GooeyNav';

const NAV_ITEMS: GooeyNavItem[] = [
  { label: '首页', to: '/' },
  { label: '园所概览', to: '/overview' },
  { label: '奖项荣誉', to: '/honors' },
  { label: '家园共育', to: '/home-school' },
  { label: '科小贝实验室', to: '/lab' },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="brand-mark" aria-label="国科二幼首页">
          <span className="brand-mark__icon" aria-hidden="true">
            <Microscope size={22} strokeWidth={2.1} />
          </span>
          <span className="brand-mark__text">
            <strong>国科二幼</strong>
            <small>科学 · 童趣 · 生长</small>
          </span>
        </Link>
        <GooeyNav items={NAV_ITEMS} />
      </div>
    </header>
  );
}
