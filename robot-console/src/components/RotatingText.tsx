import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface RotatingTextProps {
  words: string[];
  interval?: number;
}

export function RotatingText({ words, interval = 2600 }: RotatingTextProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % words.length), interval);
    return () => window.clearInterval(timer);
  }, [interval, words.length]);

  const word = words[index];
  return (
    <span className="rotating-text" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={word}
          className="rotating-text__word"
          initial={{ y: '70%', opacity: 0, rotateX: -55 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          exit={{ y: '-70%', opacity: 0, rotateX: 55 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
