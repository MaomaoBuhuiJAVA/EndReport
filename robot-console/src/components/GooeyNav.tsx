import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';

export interface GooeyNavItem {
  label: string;
  to: string;
}

interface GooeyNavProps {
  items: GooeyNavItem[];
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
}

const PARTICLE_COLORS = ['#0b6f69', '#f0a23a', '#e05b47', '#79b9d1'];

export function GooeyNav({ items }: GooeyNavProps) {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);

  const activeIndex = useMemo(() => {
    const exact = items.findIndex((item) => location.pathname === item.to);
    if (exact >= 0) return exact;
    return Math.max(
      0,
      items.findIndex((item) => item.to !== '/' && location.pathname.startsWith(item.to)),
    );
  }, [items, location.pathname]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = itemRefs.current[activeIndex];
    if (!nav || !active) return;

    const updatePill = () => {
      const navBox = nav.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      setPill({ left: activeBox.left - navBox.left + nav.scrollLeft, width: activeBox.width });
    };

    updatePill();
    const observer = new ResizeObserver(updatePill);
    observer.observe(nav);
    observer.observe(active);
    return () => observer.disconnect();
  }, [activeIndex]);

  const burst = (index: number) => {
    const target = itemRefs.current[index];
    const nav = navRef.current;
    if (!target || !nav) return;
    const navBox = nav.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const centerX = box.left - navBox.left + box.width / 2 + nav.scrollLeft;
    const centerY = box.top - navBox.top + box.height / 2;
    const stamp = Date.now();
    const next = Array.from({ length: 7 }, (_, particleIndex) => {
      const angle = (Math.PI * 2 * particleIndex) / 7;
      const distance = 22 + (particleIndex % 3) * 7;
      return {
        id: stamp + particleIndex,
        x: Math.cos(angle) * distance + centerX,
        y: Math.sin(angle) * distance + centerY,
        size: 5 + (particleIndex % 3) * 2,
        color: PARTICLE_COLORS[particleIndex % PARTICLE_COLORS.length],
      };
    });
    setParticles(next);
    window.setTimeout(() => setParticles([]), 650);
  };

  return (
    <nav ref={navRef} className="gooey-nav" aria-label="主导航">
      <span
        className="gooey-nav__pill"
        style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
        aria-hidden="true"
      />
      {items.map((item, index) => (
        <Link
          key={item.to}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          to={item.to}
          onClick={() => burst(index)}
          className={`gooey-nav__link${index === activeIndex ? ' is-active' : ''}`}
        >
          {item.label}
        </Link>
      ))}
      <span className="gooey-nav__particles" aria-hidden="true">
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="gooey-nav__particle"
            style={
              {
                '--particle-x': `${particle.x}px`,
                '--particle-y': `${particle.y}px`,
                '--particle-size': `${particle.size}px`,
                '--particle-color': particle.color,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <svg className="gooey-nav__filter" aria-hidden="true">
        <defs>
          <filter id="gooey-nav-filter">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
    </nav>
  );
}
