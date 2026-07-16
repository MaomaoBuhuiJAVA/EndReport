"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

export interface GooeyNavItem {
  key: string;
  label: string;
  href: string;
}

type GooeyNavProps = {
  items: GooeyNavItem[];
  activeKey: string;
  onSelect?: (item: GooeyNavItem) => void;
  animationTime?: number;
  particleCount?: number;
  particleDistances?: [number, number];
  particleR?: number;
  timeVariance?: number;
  colors?: number[];
};

type Particle = {
  start: [number, number];
  end: [number, number];
  time: number;
  scale: number;
  color: number;
  rotate: number;
};

type ParticleStyle = CSSProperties & {
  "--start-x": string;
  "--start-y": string;
  "--end-x": string;
  "--end-y": string;
  "--time": string;
  "--scale": string;
  "--color": string;
  "--rotate": string;
};

const defaultColors = [1, 2, 3, 1, 2, 3, 1, 4];

function noise(range = 1) {
  return range / 2 - Math.random() * range;
}

function getXY(distance: number, pointIndex: number, totalPoints: number) {
  const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
  return [distance * Math.cos(angle), distance * Math.sin(angle)] as [number, number];
}

function createParticle({
  index,
  time,
  distances,
  radius,
  particleCount,
  colors,
}: {
  index: number;
  time: number;
  distances: [number, number];
  radius: number;
  particleCount: number;
  colors: number[];
}): Particle {
  const rotate = noise(radius / 10);
  return {
    start: getXY(distances[0], particleCount - index, particleCount),
    end: getXY(distances[1] + noise(7), particleCount - index, particleCount),
    time,
    scale: 1 + noise(0.2),
    color: colors[Math.floor(Math.random() * colors.length)] ?? 1,
    rotate: rotate > 0 ? (rotate + radius / 20) * 10 : (rotate - radius / 20) * 10,
  };
}

export function GooeyNav({
  items,
  activeKey,
  onSelect,
  animationTime = 600,
  particleCount = 15,
  particleDistances = [90, 10],
  particleR = 100,
  timeVariance = 300,
  colors = defaultColors,
}: GooeyNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));

  function queue(callback: () => void, delay: number) {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
  }

  function updateEffectPosition(element: HTMLElement) {
    const container = containerRef.current;
    const filter = filterRef.current;
    const text = textRef.current;
    if (!container || !filter || !text) return;

    const containerRect = container.getBoundingClientRect();
    const position = element.getBoundingClientRect();
    const styles = {
      left: `${position.x - containerRect.x}px`,
      top: `${position.y - containerRect.y}px`,
      width: `${position.width}px`,
      height: `${position.height}px`,
    };
    Object.assign(filter.style, styles);
    Object.assign(text.style, styles);
    text.textContent = element.textContent;
  }

  function clearParticles() {
    filterRef.current?.querySelectorAll(".particle").forEach((particle) => particle.remove());
  }

  function makeParticles(element: HTMLSpanElement) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const bubbleTime = animationTime * 2 + timeVariance;
    element.style.setProperty("--time", `${bubbleTime}ms`);

    for (let index = 0; index < particleCount; index += 1) {
      const time = animationTime * 2 + noise(timeVariance * 2);
      const particleData = createParticle({
        index,
        time,
        distances: particleDistances,
        radius: particleR,
        particleCount,
        colors,
      });

      queue(() => {
        const particle = document.createElement("span");
        const point = document.createElement("span");
        const style: ParticleStyle = {
          "--start-x": `${particleData.start[0]}px`,
          "--start-y": `${particleData.start[1]}px`,
          "--end-x": `${particleData.end[0]}px`,
          "--end-y": `${particleData.end[1]}px`,
          "--time": `${particleData.time}ms`,
          "--scale": `${particleData.scale}`,
          "--color": `var(--gooey-color-${particleData.color}, #fff)`,
          "--rotate": `${particleData.rotate}deg`,
        };

        particle.className = "particle";
        point.className = "point";
        Object.assign(particle.style, style);
        particle.appendChild(point);
        element.appendChild(particle);
        window.requestAnimationFrame(() => element.classList.add("active"));
        queue(() => particle.remove(), particleData.time);
      }, 30);
    }
  }

  function animateSelection(element: HTMLElement) {
    updateEffectPosition(element);
    clearParticles();

    const text = textRef.current;
    if (text) {
      text.classList.remove("active");
      void text.offsetWidth;
      text.classList.add("active");
    }

    const filter = filterRef.current;
    if (filter) {
      filter.classList.remove("active");
      void filter.offsetWidth;
      makeParticles(filter);
    }
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>, item: GooeyNavItem) {
    const listItem = event.currentTarget.parentElement;
    if (item.href.startsWith("#")) event.preventDefault();
    if (listItem && item.key !== activeKey) animateSelection(listItem);
    onSelect?.(item);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key !== " ") return;
    event.preventDefault();
    event.currentTarget.click();
  }

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeItem = navRef.current?.children.item(activeIndex);
    if (!container || !(activeItem instanceof HTMLElement)) return;

    updateEffectPosition(activeItem);
    textRef.current?.classList.add("active");

    const resizeObserver = new ResizeObserver(() => {
      const currentItem = navRef.current?.children.item(activeIndex);
      if (currentItem instanceof HTMLElement) updateEffectPosition(currentItem);
    });
    resizeObserver.observe(container);
    resizeObserver.observe(activeItem);
    return () => resizeObserver.disconnect();
  }, [activeIndex]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    },
    [],
  );

  return (
    <div className="gooey-nav-container" ref={containerRef}>
      <nav className="gooey-nav" aria-label="主导航">
        <ul ref={navRef}>
          {items.map((item) => (
            <li key={item.key} className={item.key === activeKey ? "active" : ""}>
              <Link
                href={item.href}
                onClick={(event) => handleClick(event, item)}
                onKeyDown={handleKeyDown}
                aria-current={item.key === activeKey ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <span className="effect filter" ref={filterRef} aria-hidden="true" />
      <span className="effect text" ref={textRef} aria-hidden="true" />
    </div>
  );
}
