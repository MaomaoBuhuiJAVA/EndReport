import gsap from 'gsap';
import { useId, useLayoutEffect, useRef } from 'react';

interface PillNavProps<T extends string> {
  label: string;
  items: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

export function PillNav<T extends string>({ label, items, value, onChange }: PillNavProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLSpanElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(0, items.indexOf(value));

  useLayoutEffect(() => {
    const root = rootRef.current;
    const slider = sliderRef.current;
    const active = buttonRefs.current[activeIndex];
    if (!root || !slider || !active) return;

    const update = () => {
      gsap.to(slider, {
        x: active.offsetLeft,
        width: active.offsetWidth,
        duration: 0.34,
        ease: 'power3.out',
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [activeIndex]);

  return (
    <div className="filter-row">
      <span id={`${id}-label`} className="filter-row__label">
        {label}
      </span>
      <div ref={rootRef} className="pill-nav" role="group" aria-labelledby={`${id}-label`}>
        <span ref={sliderRef} className="pill-nav__slider" aria-hidden="true" />
        {items.map((item, index) => (
          <button
            key={item}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            className={`pill-nav__button${value === item ? ' is-active' : ''}`}
            aria-pressed={value === item}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
