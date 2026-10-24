import { useId } from "react";

/** The cover illustrations stay crisp on small phones and large displays. */
export function MagnetIllustration() {
  const id = useId().replaceAll(":", "");
  return <svg viewBox="0 0 680 440" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}rim`} x1="180" y1="160" x2="480" y2="420" gradientUnits="userSpaceOnUse"><stop stopColor="#fff3d1" /><stop offset="1" stopColor="#d8b77c" /></linearGradient>
      <linearGradient id={`${id}water`} x1="345" y1="190" x2="345" y2="390" gradientUnits="userSpaceOnUse"><stop stopColor="#448b9c" /><stop offset="1" stopColor="#2e687c" /></linearGradient>
      <filter id={`${id}shadow`} x="-25%" y="-25%" width="150%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="9" floodColor="#59462c" floodOpacity=".16" /></filter>
      <filter id={`${id}objectShadow`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="5" stdDeviation="3" floodColor="#132d40" floodOpacity=".3" /></filter>
    </defs>
    <path d="M573 68h33m-16-16v32M154 124h17m-8-8v16" stroke="#c3b08b" strokeWidth="2" strokeLinecap="round" />
    <circle cx="599" cy="132" r="4" fill="#bcb08f" /><circle cx="107" cy="228" r="3" fill="#c0ac85" />
    <g filter={`url(#${id}shadow)`} transform="rotate(-6 365 286)">
      <rect x="119" y="158" width="509" height="252" rx="43" fill="#b9975f" />
      <rect x="119" y="149" width="509" height="252" rx="43" fill={`url(#${id}rim)`} />
      <rect x="138" y="168" width="471" height="214" rx="30" fill="#b3905d" />
      <rect x="141" y="173" width="465" height="207" rx="27" fill={`url(#${id}water)`} />
      <path d="M164 201c23-10 45-10 67-2m245 0c43-12 82-11 105 1M165 352c24 7 49 8 73 2m243 0c38 9 72 7 101-3" stroke="#c6e4db" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
      <path d="M179 242c16-5 29-5 42-1m253 80c18-6 34-6 49-2m-243 26c13-4 23-5 35-1" stroke="#81bcc0" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
      <circle cx="159" cy="151" r="3" fill="#b2925e" /><circle cx="586" cy="152" r="3" fill="#b2925e" /><circle cx="590" cy="395" r="3" fill="#b2925e" /><circle cx="157" cy="394" r="3" fill="#b2925e" />
      <g filter={`url(#${id}objectShadow)`}>
        <g transform="translate(480 276) rotate(21)"><rect x="-19" y="-23" width="38" height="45" rx="6" fill="#e9bb64" /><path d="M-9-13h18M-9-4h18M-9 5h11" stroke="#b98743" strokeWidth="2" strokeLinecap="round" /><path d="M-18-19l7-6h28l2 4" fill="#f3d28c" /></g>
        <g transform="translate(226 299) rotate(-27)"><path d="M0-28v45c0 18 23 18 23 0v-37c0-11-13-11-13 0v34" stroke="#a1b6b1" strokeWidth="7" strokeLinecap="round" /><path d="M-1-28v45c0 18 23 18 23 0v-37c0-11-13-11-13 0v34" stroke="#e5eee5" strokeWidth="4" strokeLinecap="round" /></g>
        <g transform="translate(376 326) rotate(24)"><path d="M-23 0h46m-39-10v20" stroke="#a8bdbc" strokeWidth="7" strokeLinecap="round" /><path d="M-23-1h46m-39-10V9" stroke="#e6eee8" strokeWidth="4" strokeLinecap="round" /></g>
        <g transform="translate(543 225) rotate(-17)"><rect x="-15" y="-9" width="30" height="34" rx="4" fill="#e77e67" /><path d="M-10-14h5v7h-5m14-7h5v7H4" fill="#f8a18a" /><path d="M-15 16h30v6a3 3 0 0 1-3 3h-24a3 3 0 0 1-3-3z" fill="#c56553" /></g>
      </g>
      <circle cx="301" cy="255" r="7" stroke="#a8d1cb" strokeOpacity=".7" strokeWidth="2" /><circle cx="556" cy="321" r="5" stroke="#a8d1cb" strokeOpacity=".7" strokeWidth="2" />
    </g>
    <path d="M422-10v48c0 19-56 13-56 43v37" stroke="#223a4b" strokeWidth="4" strokeLinecap="round" />
    <g transform="rotate(13 365 160)" filter={`url(#${id}shadow)`}>
      <path d="M329 150v35a37 37 0 0 0 74 0v-35" stroke="#bf4e3b" strokeWidth="34" />
      <path d="M329 143v35a37 37 0 0 0 74 0v-35" stroke="#ec7356" strokeWidth="34" />
      <path d="M329 143v23m74-23v23" stroke="#f3eee0" strokeWidth="34" />
      <path d="M319 143v18m74-18v18" stroke="#fff7e7" strokeWidth="5" strokeLinecap="round" />
      <path d="M360 216c-11-2-18-8-21-17" stroke="#ffa68a" strokeWidth="4" strokeLinecap="round" />
      <path d="M356 112a10 10 0 0 1 20 0v13h-20z" fill="#f2d28b" stroke="#ad8e52" strokeWidth="2" />
      <circle cx="366" cy="113" r="4" fill="#233d4b" />
    </g>
    <path d="M311 162l-13-7m12 24-16 1m121-32 13-7m-7 30 16 1" stroke="#fcf5dc" strokeWidth="3" strokeLinecap="round" />
    <g transform="translate(299 197) rotate(-27)" filter={`url(#${id}objectShadow)`}><path d="M0-22v36c0 14 19 14 19 0v-29c0-8-11-8-11 0v26" stroke="#9fb4af" strokeWidth="7" strokeLinecap="round" /><path d="M-1-22v36c0 14 19 14 19 0v-29c0-8-11-8-11 0v26" stroke="#e8efe6" strokeWidth="4" strokeLinecap="round" /></g>
    <g transform="translate(559 92) rotate(9)"><path d="M-23-21h47v43h-47z" fill="#fcf4dd" /><path d="M-14-8h26m-26 9h26m-26 9h17" stroke="#af9c74" strokeWidth="2" strokeLinecap="round" /><rect x="-7" y="-27" width="15" height="10" rx="3" fill="#d1af69" /></g>
  </svg>;
}

export function WaterIllustration() {
  const id = useId().replaceAll(":", "");
  return <svg viewBox="0 0 420 300" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}water`} x1="210" y1="119" x2="210" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#8ec7d8" /><stop offset="1" stopColor="#6aa8c4" /></linearGradient>
      <filter id={`${id}shadow`} x="-30%" y="-40%" width="170%" height="200%"><feDropShadow dx="1" dy="6" stdDeviation="4" floodColor="#315776" floodOpacity=".15" /></filter>
    </defs>
    <ellipse cx="212" cy="271" rx="147" ry="11" fill="#78a3b8" fillOpacity=".14" />
    <path d="M66 99h288v141a26 26 0 0 1-26 26H92a26 26 0 0 1-26-26z" fill="#e8f2ee" fillOpacity=".75" stroke="#668d9c" strokeWidth="3" />
    <path d="M73 145c22-10 44 10 66 0s44 10 66 0 44 10 66 0 44 10 76 0v94a20 20 0 0 1-20 20H93a20 20 0 0 1-20-20z" fill={`url(#${id}water)`} />
    <path d="M73 145c22-10 44 10 66 0s44 10 66 0 44 10 66 0 44 10 76 0" stroke="#4c91ac" strokeWidth="2" />
    <path d="M85 110v122a12 12 0 0 0 12 12m231-134v14" stroke="white" strokeOpacity=".65" strokeWidth="5" strokeLinecap="round" />
    <path d="M333 175h13m-13 25h13m-13 25h13" stroke="#568ca1" strokeWidth="2" />
    <g filter={`url(#${id}shadow)`} transform="rotate(-7 152 128)">
      <path d="M105 123h91l-19 23h-51z" fill="#e96c4f" />
      <path d="M105 123h91l-8 8h-77z" fill="#f58a66" />
      <path d="M150 68v56" stroke="#725b43" strokeWidth="3" strokeLinecap="round" />
      <path d="M155 76l30 39h-30z" fill="#fff8db" /><path d="M146 86l-24 29h24z" fill="#f2ca6d" />
    </g>
    <g filter={`url(#${id}shadow)`} transform="rotate(9 267 231)"><path d="m239 236 5-22 17-12 22 4 13 23-8 17-27 6z" fill="#85949b" /><path d="m244 214 17-12 22 4 2 17-27 3z" fill="#a9b7b9" /><path d="m258 226 27-3 11 6-8 17-27 6z" fill="#71858e" /><path d="m249 218 10-6m10 24 12-4" stroke="#c5ceca" strokeWidth="2" strokeLinecap="round" /></g>
    <path d="M266 159v25m-6-7 6 8 6-8" stroke="#497e98" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" />
    <circle cx="285" cy="192" r="4" stroke="#e4f4ec" strokeWidth="2" /><circle cx="294" cy="174" r="2.5" stroke="#e4f4ec" strokeWidth="1.5" /><circle cx="130" cy="220" r="5" stroke="#e4f4ec" strokeWidth="2" />
    <path d="M319 65h20m-10-10v20M89 58h12m-6-6v12" stroke="#86aebb" strokeWidth="2" strokeLinecap="round" />
    <path d="M206 181c10-4 21-4 31-1m-122 66c10-3 20-3 29-1" stroke="#c8e5e5" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

export function ShadowIllustration() {
  const id = useId().replaceAll(":", "");
  return <svg viewBox="0 0 680 300" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}beam`} x1="172" y1="147" x2="548" y2="147" gradientUnits="userSpaceOnUse"><stop stopColor="#f4dba0" stopOpacity=".16" /><stop offset="1" stopColor="#f4dba0" stopOpacity=".06" /></linearGradient>
      <linearGradient id={`${id}wall`} x1="526" y1="55" x2="612" y2="251" gradientUnits="userSpaceOnUse"><stop stopColor="#d9d5c5" /><stop offset="1" stopColor="#a7afaa" /></linearGradient>
      <radialGradient id={`${id}ball`} cx="0" cy="0" r="1" gradientTransform="translate(318 130) rotate(47) scale(45)" gradientUnits="userSpaceOnUse"><stop stopColor="#f7aa80" /><stop offset=".55" stopColor="#e17c5d" /><stop offset="1" stopColor="#ad5749" /></radialGradient>
      <filter id={`${id}shadow`} x="-50%" y="-50%" width="200%" height="210%"><feDropShadow dx="1" dy="5" stdDeviation="4" floodColor="#0d1922" floodOpacity=".24" /></filter>
      <filter id={`${id}soft`} x="-40%" y="-30%" width="180%" height="160%"><feGaussianBlur stdDeviation="2" /></filter>
    </defs>
    <path d="M113 244h447" stroke="#637079" strokeOpacity=".45" strokeWidth="1.5" />
    <path d="m177 146 376-102v207L177 146Z" fill={`url(#${id}beam)`} />
    <path d="m180 145 369-99m-369 99 369 104" stroke="#b7b89a" strokeOpacity=".2" strokeWidth="1" strokeDasharray="4 6" />
    <g filter={`url(#${id}shadow)`}>
      <path d="m526 55 59-17 7 204-66 13V55Z" fill={`url(#${id}wall)`} />
      <path d="m585 38 8 4 7 197-8 3-7-204Z" fill="#858f8c" />
      <path d="m526 255 66-13 8-3v8l-73 14-1-6Z" fill="#647372" />
      <path d="m537 66 34-9m-33 13 20-5" stroke="#f8f5e8" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round" />
    </g>
    <ellipse cx="555" cy="151" rx="16" ry="51" transform="rotate(-2 555 151)" fill="#293b48" fillOpacity=".52" filter={`url(#${id}soft)`} />
    <ellipse cx="555" cy="151" rx="15" ry="47" transform="rotate(-2 555 151)" stroke="#e7a574" strokeWidth="2" strokeDasharray="5 4" />
    <path d="M327 163v75" stroke="#8f9180" strokeWidth="4" /><ellipse cx="327" cy="242" rx="26" ry="6" fill="#1a2d3a" /><path d="M304 239h46l-5 5h-36l-5-5Z" fill="#68777b" />
    <g filter={`url(#${id}shadow)`}><circle cx="327" cy="145" r="27" fill={`url(#${id}ball)`} /><path d="M314 130c4-5 9-6 15-5" stroke="#f8c59c" strokeOpacity=".75" strokeWidth="2.7" strokeLinecap="round" /></g>
    <path d="m354 125 184-25m-184 63 185 36" stroke="#d6c69b" strokeOpacity=".25" strokeWidth="1.2" />
    <path d="m244 225 21-1m-15-5-6 6 6 6m139-6-20-1m14-5 6 6-6 6" stroke="#939e9c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <g filter={`url(#${id}shadow)`}>
      <path d="M154 174v61" stroke="#a5a791" strokeWidth="4" />
      <path d="M151 176h7v17h-7z" fill="#68777c" />
      <path d="M131 235h47l-6 8h-35l-6-8Z" fill="#85918a" />
      <path d="m132 124 43 7v31l-43 8v-46Z" fill="#d0ad62" />
      <path d="m132 124-7 7v32l7 7v-46Z" fill="#89764e" />
      <path d="m175 131 7 5v21l-7 5v-31Z" fill="#f4d99c" />
      <ellipse cx="180" cy="147" rx="4" ry="10" fill="#fff2bb" />
      <path d="m138 134 10 2m-10 5 10 1" stroke="#e9c985" strokeWidth="2" strokeLinecap="round" />
    </g>
    <path d="M397 58h13m-6-6v12M469 234h8m-4-4v8" stroke="#839294" strokeOpacity=".7" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="231" cy="83" r="2" fill="#899d9c" fillOpacity=".6" /><circle cx="468" cy="81" r="2" fill="#899d9c" fillOpacity=".6" />
  </svg>;
}
