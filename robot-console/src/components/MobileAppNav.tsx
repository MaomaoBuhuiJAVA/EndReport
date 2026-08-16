"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ComponentType } from "react";

type MobileAppNavIcon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  "aria-hidden"?: boolean | string;
}>;

export type MobileAppNavItem = {
  key: string;
  label: string;
  href: string;
  icon?: MobileAppNavIcon;
};

export function MobileAppNav({
  items,
  activeKey,
  layoutIdPrefix = "mobile-nav",
  layoutDuration = 0.56,
  onSelect,
}: {
  items: MobileAppNavItem[];
  activeKey: string;
  layoutIdPrefix?: string;
  layoutDuration?: number;
  onSelect?: (item: MobileAppNavItem) => void;
}) {
  return (
    <nav
      className="home-bottom-nav lg:hidden"
      aria-label="移动端主导航"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const layoutId = `${layoutIdPrefix}-${item.key}`;

        return item.href.startsWith("#") ? (
          <motion.button
            type="button"
            key={item.key}
            className={`home-bottom-nav__item${activeKey === item.key ? " is-active" : ""}`}
            layoutId={layoutId}
            onClick={() => onSelect?.(item)}
            aria-current={activeKey === item.key ? "page" : undefined}
            transition={{ layout: { duration: layoutDuration, ease: [0.22, 1, 0.36, 1] } }}
          >
            {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2.1} /> : null}
            {item.label}
          </motion.button>
        ) : (
          <Link
            className={`home-bottom-nav__item${activeKey === item.key ? " is-active" : ""}`}
            href={item.href}
            key={item.key}
            onClick={() => onSelect?.(item)}
            scroll
            aria-current={activeKey === item.key ? "page" : undefined}
          >
            {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2.1} /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
