"use client";

import Link from "next/link";

export type MobileAppNavItem = {
  key: string;
  label: string;
  href: string;
};

export function MobileAppNav({
  items,
  activeKey,
  onSelect,
}: {
  items: MobileAppNavItem[];
  activeKey: string;
  onSelect?: (item: MobileAppNavItem) => void;
}) {
  return (
    <nav className="home-bottom-nav lg:hidden" aria-label="移动端主导航">
      {items.map((item) =>
        item.href.startsWith("#") ? (
          <button
            type="button"
            key={item.key}
            className={`home-bottom-nav__item${activeKey === item.key ? " is-active" : ""}`}
            onClick={() => onSelect?.(item)}
            aria-current={activeKey === item.key ? "page" : undefined}
          >
            {item.label}
          </button>
        ) : (
          <Link
            className={`home-bottom-nav__item${activeKey === item.key ? " is-active" : ""}`}
            href={item.href}
            key={item.key}
            onClick={() => onSelect?.(item)}
            scroll
            aria-current={activeKey === item.key ? "page" : undefined}
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
