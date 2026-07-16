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

type Bubble = {
  near: [number, number];
  middle: [number, number];
  far: [number, number];
  time: number;
  size: number;
  color: number;
};

type BubbleStyle = CSSProperties & {
  "--near-x": string;
  "--near-y": string;
  "--middle-x": string;
  "--middle-y": string;
  "--far-x": string;
  "--far-y": string;
  "--bubble-time": string;
  "--bubble-delay": string;
  "--bubble-size": string;
  "--bubble-color": string;
};

const defaultColors = [1, 2, 3, 1, 2, 3, 1, 4];

function noise(range = 1) {
  return range / 2 - Math.random() * range;
}

function pointAt(distance: number, index: number, count: number, angleNoise = 0) {
  const angle = ((Math.PI * 2) / count) * index + noise(angleNoise);
  return [distance * Math.cos(angle), distance * Math.sin(angle)] as [number, number];
}

function createBubble({
  index,
  count,
  distances,
  radius,
  animationTime,
  timeVariance,
  colors,
}: {
  index: number;
  count: number;
  distances: [number, number];
  radius: number;
  animationTime: number;
  timeVariance: number;
  colors: number[];
}): Bubble {
  const farDistance = distances[0] * (0.72 + Math.random() * 0.28);
  const nearDistance = Math.max(4, distances[1] + noise(8));
  const curve = Math.min(0.22, radius / 1000);
  return {
    near: pointAt(nearDistance, index, count, 0.04),
    middle: pointAt(farDistance * 0.72, index, count, curve),
    far: pointAt(farDistance, index, count, curve * 1.5),
    time: Math.max(420, animationTime + noise(timeVariance)),
    size: 7 + (index % 4) * 2 + noise(2),
    color: colors[Math.floor(Math.random() * colors.length)] ?? 1,
  };
}

export function GooeyNav({
  items,
  activeKey,
  onSelect,
  animationTime = 680,
  particleCount = 15,
  particleDistances = [74, 9],
  particleR = 100,
  timeVariance = 220,
  colors = defaultColors,
}: GooeyNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const burstRef = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));

  function queue(callback: () => void, delay: number) {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
  }

  function updateBurstPosition(element: HTMLElement) {
    const container = containerRef.current;
    const burst = burstRef.current;
    if (!container || !burst) return;

    const containerRect = container.getBoundingClientRect();
    const position = element.getBoundingClientRect();
    Object.assign(burst.style, {
      left: `${position.x - containerRect.x}px`,
      top: `${position.y - containerRect.y}px`,
      width: `${position.width}px`,
      height: `${position.height}px`,
    });
  }

  function clearBubbles() {
    burstRef.current?.querySelectorAll(".gooey-nav__bubble").forEach((bubble) => bubble.remove());
  }

  function makeBubbles(element: HTMLSpanElement) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    for (let index = 0; index < particleCount; index += 1) {
      const bubble = createBubble({
        index,
        count: particleCount,
        distances: particleDistances,
        radius: particleR,
        animationTime,
        timeVariance,
        colors,
      });
      const node = document.createElement("span");
      const style: BubbleStyle = {
        "--near-x": `${bubble.near[0]}px`,
        "--near-y": `${bubble.near[1]}px`,
        "--middle-x": `${bubble.middle[0]}px`,
        "--middle-y": `${bubble.middle[1]}px`,
        "--far-x": `${bubble.far[0]}px`,
        "--far-y": `${bubble.far[1]}px`,
        "--bubble-time": `${bubble.time}ms`,
        "--bubble-delay": `${(index % 4) * 18}ms`,
        "--bubble-size": `${bubble.size}px`,
        "--bubble-color": `var(--bubble-color-${bubble.color}, #1f6f62)`,
      };

      node.className = "gooey-nav__bubble";
      Object.assign(node.style, style);
      element.appendChild(node);
      queue(() => node.remove(), bubble.time + 80);
    }
  }

  function animateSelection(element: HTMLElement) {
    const burst = burstRef.current;
    if (!burst) return;

    updateBurstPosition(element);
    clearBubbles();
    burst.classList.remove("is-active");
    void burst.offsetWidth;
    makeBubbles(burst);
    window.requestAnimationFrame(() => burst.classList.add("is-active"));
    queue(() => burst.classList.remove("is-active"), animationTime + timeVariance + 160);
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>, item: GooeyNavItem) {
    const listItem = event.currentTarget.parentElement;
    if (item.href.startsWith("#")) event.preventDefault();
    if (listItem) animateSelection(listItem);
    onSelect?.(item);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key !== " ") return;
    event.preventDefault();
    event.currentTarget.click();
  }

  useLayoutEffect(() => {
    const container = containerRef.current;
    const scroller = scrollerRef.current;
    const activeItem = navRef.current?.children.item(activeIndex);
    if (!container || !scroller || !(activeItem instanceof HTMLElement)) return;

    const update = () => updateBurstPosition(activeItem);
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    resizeObserver.observe(activeItem);
    scroller.addEventListener("scroll", update, { passive: true });
    return () => {
      resizeObserver.disconnect();
      scroller.removeEventListener("scroll", update);
    };
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
      <nav className="gooey-nav" aria-label="主导航" ref={scrollerRef}>
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
      <span className="gooey-nav__burst" ref={burstRef} aria-hidden="true" />
    </div>
  );
}
