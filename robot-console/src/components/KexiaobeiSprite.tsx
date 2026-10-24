"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { PetAnimationState } from "@/lib/pet-motion";

const labels: Record<PetAnimationState, string> = {
  idle: "科小贝在休息", waiting: "科小贝在认真倾听", working: "科小贝正在思考",
  speaking: "科小贝正在回答", moving: "科小贝正在移动",
  "running-left": "科小贝向左走", "running-right": "科小贝向右走",
};

function Artwork({ asset }: { asset: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {/* A small poster stays visible until the animated image has decoded. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="science-pet__poster" src={`${asset}-poster.webp`} alt="" width={240} height={260} style={{ opacity: loaded ? 0 : 1 }} draggable={false} />
      <picture className="science-pet__playback">
        <source media="(prefers-reduced-motion: reduce)" srcSet={`${asset}-poster.webp`} />
        {/* Native image playback preserves animated WebP and its full alpha. */}
        <img src={`${asset}.webp`} width={240} height={260} alt="" draggable={false} decoding="async" onLoad={() => setLoaded(true)} style={{ opacity: loaded ? 1 : 0 }} />
      </picture>
    </>
  );
}

export function KexiaobeiSprite({ state, className = "" }: {
  state: PetAnimationState;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const asset = `/assets/pet-motion-v4/${state}`;

  return (
    <span className={`science-pet__sprite ${className}`} role="img" aria-label={labels[state]} data-pet-state={state}>
      <AnimatePresence initial={false}>
        <motion.span
          key={state}
          className="science-pet__artwork"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
          aria-hidden="true"
        >
          <Artwork asset={asset} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
