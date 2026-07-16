"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ComponentProps,
} from "react";

type MotionSpanProps = ComponentProps<typeof motion.span>;
type StaggerFrom = "first" | "last" | "center" | "random" | number;
type SplitBy = "characters" | "words" | "lines" | string;

export type RotatingTextHandle = {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
};

type RotatingTextProps = Omit<MotionSpanProps, "children" | "initial" | "animate" | "exit"> & {
  texts: readonly string[];
  rotationInterval?: number;
  initial?: MotionSpanProps["initial"];
  animate?: MotionSpanProps["animate"];
  exit?: MotionSpanProps["exit"];
  animatePresenceMode?: "sync" | "wait" | "popLayout";
  animatePresenceInitial?: boolean;
  staggerDuration?: number;
  staggerFrom?: StaggerFrom;
  loop?: boolean;
  auto?: boolean;
  splitBy?: SplitBy;
  onNext?: (index: number) => void;
  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
};

const fallbackTexts = [""] as const;

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function splitIntoCharacters(text: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

export const RotatingText = forwardRef<RotatingTextHandle, RotatingTextProps>(
  function RotatingText(
    {
      texts,
      transition = { type: "spring", damping: 30, stiffness: 400 },
      initial = { y: "100%", opacity: 0 },
      animate = { y: 0, opacity: 1 },
      exit = { y: "-120%", opacity: 0 },
      animatePresenceMode = "wait",
      animatePresenceInitial = false,
      rotationInterval = 2600,
      staggerDuration = 0.025,
      staggerFrom = "last",
      loop = true,
      auto = true,
      splitBy = "characters",
      onNext,
      mainClassName,
      splitLevelClassName,
      elementLevelClassName,
      className,
      ...rest
    },
    ref,
  ) {
    const availableTexts = texts.length ? texts : fallbackTexts;
    const [currentTextIndex, setCurrentTextIndex] = useState(0);

    const handleIndexChange = useCallback(
      (newIndex: number) => {
        setCurrentTextIndex(newIndex);
        onNext?.(newIndex);
      },
      [onNext],
    );

    const next = useCallback(() => {
      setCurrentTextIndex((current) => {
        const nextIndex =
          current === availableTexts.length - 1 ? (loop ? 0 : current) : current + 1;
        if (nextIndex !== current) onNext?.(nextIndex);
        return nextIndex;
      });
    }, [availableTexts.length, loop, onNext]);

    const previous = useCallback(() => {
      setCurrentTextIndex((current) => {
        const previousIndex =
          current === 0 ? (loop ? availableTexts.length - 1 : current) : current - 1;
        if (previousIndex !== current) onNext?.(previousIndex);
        return previousIndex;
      });
    }, [availableTexts.length, loop, onNext]);

    const jumpTo = useCallback(
      (index: number) => {
        const validIndex = Math.max(0, Math.min(index, availableTexts.length - 1));
        handleIndexChange(validIndex);
      },
      [availableTexts.length, handleIndexChange],
    );

    const reset = useCallback(() => handleIndexChange(0), [handleIndexChange]);

    useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [jumpTo, next, previous, reset]);

    useEffect(() => {
      if (!auto || availableTexts.length < 2) return;
      const intervalId = window.setInterval(next, rotationInterval);
      return () => window.clearInterval(intervalId);
    }, [auto, availableTexts.length, next, rotationInterval]);

    const currentText = availableTexts[currentTextIndex] ?? availableTexts[0];
    const elements = useMemo(() => {
      if (splitBy === "characters") {
        return currentText.split(" ").map((word, index, words) => ({
          characters: splitIntoCharacters(word),
          needsSpace: index !== words.length - 1,
        }));
      }
      if (splitBy === "words") {
        return currentText.split(" ").map((word, index, words) => ({
          characters: [word],
          needsSpace: index !== words.length - 1,
        }));
      }
      if (splitBy === "lines") {
        return currentText.split("\n").map((line, index, lines) => ({
          characters: [line],
          needsSpace: index !== lines.length - 1,
        }));
      }
      return currentText.split(splitBy).map((part, index, parts) => ({
        characters: [part],
        needsSpace: index !== parts.length - 1,
      }));
    }, [currentText, splitBy]);

    const totalElements = elements.reduce((total, group) => total + group.characters.length, 0);
    const getStaggerDelay = (index: number) => {
      if (staggerFrom === "first") return index * staggerDuration;
      if (staggerFrom === "last") return (totalElements - 1 - index) * staggerDuration;
      if (staggerFrom === "center") {
        return Math.abs(Math.floor(totalElements / 2) - index) * staggerDuration;
      }
      if (staggerFrom === "random") {
        return Math.abs(Math.floor(Math.random() * totalElements) - index) * staggerDuration;
      }
      return Math.abs(staggerFrom - index) * staggerDuration;
    };

    return (
      <motion.span
        className={classes("text-rotate", mainClassName, className)}
        aria-live="polite"
        layout
        transition={transition}
        {...rest}
      >
        <span className="text-rotate-sr-only">{currentText}</span>
        <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
          <motion.span
            key={currentTextIndex}
            className={splitBy === "lines" ? "text-rotate-lines" : "text-rotate"}
            layout
            aria-hidden="true"
          >
            {elements.map((group, groupIndex) => {
              const previousCount = elements
                .slice(0, groupIndex)
                .reduce((total, item) => total + item.characters.length, 0);
              return (
                <span
                  key={`${groupIndex}-${group.characters.join("")}`}
                  className={classes("text-rotate-word", splitLevelClassName)}
                >
                  {group.characters.map((character, characterIndex) => (
                    <motion.span
                      key={`${characterIndex}-${character}`}
                      className={classes("text-rotate-element", elementLevelClassName)}
                      initial={initial}
                      animate={animate}
                      exit={exit}
                      transition={{
                        ...transition,
                        delay: getStaggerDelay(previousCount + characterIndex),
                      }}
                    >
                      {character}
                    </motion.span>
                  ))}
                  {group.needsSpace ? <span className="text-rotate-space"> </span> : null}
                </span>
              );
            })}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    );
  },
);
