"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export interface GooeyNavItem {
  key: string;
  label: string;
  href: string;
}

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
};

const particleColors = ["#1f6f62", "#d8b45f", "#d36a4a", "#62a8bd"];

export function GooeyNav({
  items,
  activeKey,
  onSelect,
}: {
  items: GooeyNavItem[];
  activeKey: string;
  onSelect?: (item: GooeyNavItem) => void;
}) {
  const filterId = useId().replaceAll(":", "");
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const particleSeedRef = useRef(0);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));

  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = itemRefs.current[activeIndex];
    if (!nav || !active) return;

    const updatePill = () => {
      const navBox = nav.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      setPill({
        left: activeBox.left - navBox.left + nav.scrollLeft,
        width: activeBox.width,
      });
    };

    updatePill();
    const observer = new ResizeObserver(updatePill);
    observer.observe(nav);
    observer.observe(active);
    return () => observer.disconnect();
  }, [activeIndex]);

  function burst(index: number) {
    const target = itemRefs.current[index];
    const nav = navRef.current;
    if (!target || !nav) return;

    const navBox = nav.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const centerX = box.left - navBox.left + box.width / 2 + nav.scrollLeft;
    const centerY = box.top - navBox.top + box.height / 2;
    const stamp = particleSeedRef.current;
    particleSeedRef.current += 10;

    setParticles(
      Array.from({ length: 7 }, (_, particleIndex) => {
        const angle = (Math.PI * 2 * particleIndex) / 7;
        const distance = 22 + (particleIndex % 3) * 7;
        return {
          id: stamp + particleIndex,
          x: Math.cos(angle) * distance + centerX,
          y: Math.sin(angle) * distance + centerY,
          size: 5 + (particleIndex % 3) * 2,
          color: particleColors[particleIndex % particleColors.length],
        };
      }),
    );
    window.setTimeout(() => setParticles([]), 650);
  }

  return (
    <nav ref={navRef} className="gooey-nav" aria-label="主导航">
      <span
        className="gooey-nav__pill"
        style={{
          filter: `url(#${filterId})`,
          transform: `translateX(${pill.left}px)`,
          width: pill.width,
        }}
        aria-hidden="true"
      />
      {items.map((item, index) => (
        <Link
          key={item.key}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          href={item.href}
          onClick={(event) => {
            burst(index);
            if (item.href.startsWith("#")) event.preventDefault();
            onSelect?.(item);
          }}
          aria-current={item.key === activeKey ? "page" : undefined}
          className={`gooey-nav__link${item.key === activeKey ? " is-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
      <span
        className="gooey-nav__particles"
        style={{ filter: `url(#${filterId})` }}
        aria-hidden="true"
      >
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="gooey-nav__particle"
            style={
              {
                "--particle-x": `${particle.x}px`,
                "--particle-y": `${particle.y}px`,
                "--particle-size": `${particle.size}px`,
                "--particle-color": particle.color,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <svg className="gooey-nav__filter" aria-hidden="true">
        <defs>
          <filter id={filterId}>
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
