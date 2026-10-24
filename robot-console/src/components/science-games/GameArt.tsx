"use client";

/* Art is deliberately served without an optimizer so newly supplied PNGs can
 * replace assets immediately, including on a running local preview. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { CSSProperties } from "react";
import { ART_BASE, GAME_ARTWORK } from "@/lib/science-games/artwork";
import styles from "./ScienceGames.module.css";
import { useGameProgress } from "./GameProvider";

function Placeholder({ id }: { id: string }) {
  if (id.startsWith("guide-")) return <img src={`/assets/pet-motion-v4/${id === "guide-cheer" ? "speaking" : id === "guide-thinking" ? "working" : "idle"}-poster.webp`} alt="" className={styles.existingGuide} />;
  return <svg viewBox="0 0 240 180" fill="none" aria-hidden="true" className={styles.placeholderSvg} style={id === "magnet-tool" ? { transform: "rotate(-90deg)" } : undefined}>
    {id === "park-hero" ? <>
      <circle cx="188" cy="36" r="24" fill="#f7d58a" /><path d="M0 124Q66 73 132 126T265 113V180H0Z" fill="#c0ded0" /><path d="M0 158Q89 104 169 160T270 142V180H0Z" fill="#90beaa" /><path d="M150 116V79L181 53L212 79V116Z" fill="#fff7df" /><path d="M144 80L181 47L218 80" stroke="#4e8c79" strokeWidth="9" strokeLinejoin="round" /><rect x="174" y="88" width="15" height="28" rx="5" fill="#84b9a5" /><path d="M47 120V78M27 91Q16 47 45 48Q70 26 78 58Q95 85 47 99" fill="#72a88f" stroke="#4c856d" strokeWidth="4" />
    </> : id.includes("scene") ? <>
      <path fill="#e6efe7" d="M0 0H240V180H0Z" /><rect x="153" y="15" width="62" height="61" rx="12" fill="#faf7e8" /><path d="M184 16V76M154 46H214" stroke="#b2d2c3" strokeWidth="4" /><path d="M0 130H240V180H0Z" fill="#e4cda9" /><path d="M0 130H240" stroke="#c2a77c" strokeWidth="4" />
    </> : id === "iron-nail" ? <g transform="rotate(28 120 90)"><path d="M114 49H126V129L120 142L114 129Z" fill="#a4b4be" stroke="#536b79" strokeWidth="3" /><rect x="98" y="39" width="44" height="13" rx="5" fill="#ced7dc" stroke="#536b79" strokeWidth="3" /></g>
      : id === "wood-block" || id === "water-wood" ? <><path d="M68 63L119 39L173 63V123L120 147L68 123Z" fill="#dfbb80" stroke="#a9804b" strokeWidth="3" /><path d="M68 63L120 88L173 63M120 88V147" stroke="#a9804b" strokeWidth="3" /><path d="M82 85L106 96M82 100L105 110M136 105L158 96" stroke="#bd955c" strokeWidth="3" strokeLinecap="round" /></>
      : id === "steel-clip" ? <path d="M99 118L143 66C165 41 190 65 169 88L116 149C82 181 46 147 77 110L126 54C144 34 169 57 150 78L105 129C95 140 82 127 91 116L133 67" transform="translate(1 -14)" stroke="#718895" strokeWidth="8" strokeLinecap="round" />
      : id === "plastic-brick" ? <><path d="M63 78L117 53L177 78V125L121 150L63 125Z" fill="#efc36d" stroke="#bb8f3f" strokeWidth="3" /><path d="M63 78L121 104L177 78M121 104V150" stroke="#bb8f3f" strokeWidth="3" />{[[94,64],[121,54],[120,76],[147,65]].map(([x,y])=><ellipse key={`${x}-${y}`} cx={x} cy={y} rx="12" ry="7" fill="#f6d68d" stroke="#bb8f3f" strokeWidth="2" />)}</>
      : id === "aluminum-can" ? <><path d="M83 48H157V136C157 153 83 153 83 136Z" fill="#bacbd1" stroke="#6d8791" strokeWidth="3" /><ellipse cx="120" cy="48" rx="37" ry="11" fill="#e2e9e9" stroke="#6d8791" strokeWidth="3" /><ellipse cx="120" cy="47" rx="12" ry="5" stroke="#6d8791" strokeWidth="3" /><path d="M95 67V126" stroke="#e9efed" strokeWidth="7" strokeLinecap="round" /></>
      : id === "rubber-eraser" ? <><path d="M62 89L143 52L181 75V110L100 148L62 124Z" fill="#ecb3aa" stroke="#bd867f" strokeWidth="3" /><path d="M62 89L100 113L181 75M100 113V148" stroke="#bd867f" strokeWidth="3" /></>
      : id.includes("water") ? <><path d="M50 62H190V134Q120 156 50 134Z" fill="#b2dfe5" stroke="#548f9c" strokeWidth="4" /><path d="M52 91Q74 81 98 92T144 92T188 91" stroke="#fff9e9" strokeWidth="4" /><path d="M85 70L120 54L147 70L120 88Z" fill="#deba81" /><circle cx="153" cy="126" r="12" fill="#7e929f" /></>
      : id.includes("shadow") ? <><path d="M65 121L150 46L185 128Z" fill="#f5df98" /><rect x="41" y="111" width="65" height="27" rx="9" transform="rotate(-25 41 111)" fill="#5a8b9a" /><path d="M156 120V88Q140 61 150 57Q161 55 164 80Q177 51 185 59Q192 67 178 91V121Z" fill="#667582" /></>
      : id.includes("growth") || id.includes("seed") ? <><path d="M120 119V77" stroke="#4e8d69" strokeWidth="7" strokeLinecap="round" /><path d="M120 92Q67 95 77 51Q119 46 120 92Z" fill="#8dbc86" /><path d="M121 80Q121 39 166 43Q175 84 121 80Z" fill="#579c76" /><path d="M81 116H159L148 155H92Z" fill="#d6a27b" /><rect x="76" y="109" width="88" height="15" rx="6" fill="#e9b995" /></>
      : id.includes("cloud") ? <path d="M64 121Q30 116 44 86Q51 69 73 73Q75 38 109 40Q139 39 149 68Q186 60 196 89Q207 123 173 126H64Z" fill="#cce1e7" stroke="#7eabb6" strokeWidth="3" />
      : id.includes("planet") ? <><circle cx="120" cy="90" r="46" fill="#9fcac5" /><ellipse cx="120" cy="93" rx="79" ry="18" transform="rotate(-24 120 93)" stroke="#d2b36b" strokeWidth="10" /><path d="M86 61Q122 23 159 65" stroke="#a4d1cc" strokeWidth="12" /></>
      : id.includes("ranking") || id.includes("badge") ? <><path d="M84 46H156V87Q156 120 120 125Q84 120 84 87Z" fill="#efcf84" stroke="#c29a49" strokeWidth="3" /><path d="M84 58H60Q60 98 89 98M156 58H180Q180 98 151 98M120 125V145M97 149H143" stroke="#c29a49" strokeWidth="7" strokeLinecap="round" /><path d="M120 62L126 77L142 78L129 89L133 105L120 96L107 105L111 89L98 78L114 77Z" fill="#fff6d8" /></>
      : id.includes("result") ? <>{[[35,45],[190,25],[205,130],[42,141],[120,24]].map(([x,y],index)=><path key={index} d="M0-10L3-3L10 0L3 3L0 10L-3 3L-10 0L-3-3Z" transform={`translate(${x} ${y})`} fill={index%2 ? "#98c7b6" : "#efcd7e"} />)}</>
      : <><path d="M95 42V103Q95 128 120 128Q145 128 145 103V42" stroke="#d87568" strokeWidth="30" /><path d="M95 41V60M145 41V60" stroke="#becdd2" strokeWidth="30" />{id !== "magnet-tool" && <><path d="M65 75L48 67M65 95H43M175 75L192 67M175 95H197" stroke="#d0b061" strokeWidth="4" strokeLinecap="round" /><circle cx="171" cy="135" r="11" fill="#91baa8" /></>}</>}
  </svg>;
}

export function GameArt({ id, className = "", decorative = false, style }: { id: string; className?: string; decorative?: boolean; style?: CSSProperties }) {
  const asset = GAME_ARTWORK.find(item => item.id === id);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const { artworkIds } = useGameProgress();
  if (!asset) return null;
  return <span className={`${styles.art} ${className}`} style={style} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : asset.name} aria-hidden={decorative || undefined}>
    {loadedId !== id && <Placeholder id={id} />}
    {failedId !== id && artworkIds.includes(id) && <img className={`${styles.assetImage} ${loadedId === id ? styles.assetLoaded : ""}`} src={`${ART_BASE}${asset.file}`} width={asset.width} height={asset.height} alt="" draggable={false} onLoad={() => setLoadedId(id)} onError={() => setFailedId(id)} />}
  </span>;
}
