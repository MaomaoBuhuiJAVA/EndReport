import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/SciencePet.tsx"), "utf8");
const home = fs.readFileSync(path.resolve("src/components/AgentHome.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

test("uses the same 科小贝 chat from the focused home page", () => {
  assert.match(home, /import \{ SciencePet \} from "@\/components\/SciencePet"/);
  assert.match(home, /<SciencePet\s*\/>/);
  assert.doesNotMatch(home, /className="pet-chat"/);
});

test("keeps the conversation scrollable instead of dropping earlier messages", () => {
  assert.doesNotMatch(component, /messages\.slice\(-8\)/);
  assert.match(component, /window\.addEventListener\("kexiaobei:open"/);
  assert.match(component, /<Link className="pet-message__lab-link" href=\{link\.href\}/);
});

test("keeps the external home-page open event listener available", () => {
  assert.match(component, /useLayoutEffect\(\(\) => \{[\s\S]*?window\.addEventListener\("kexiaobei:open"/);
  assert.match(component, /__kexiaobeiOpenRequested/);
});

test("anchors the chat window to the draggable pet instead of the viewport", () => {
  assert.match(styles, /\.pet-chat\s*\{[\s\S]*?position:\s*absolute[\s\S]*?right:\s*calc\(100% \+ 14px\)/);
  assert.match(styles, /\.science-pet\.is-left \.pet-chat\s*\{[\s\S]*?left:\s*calc\(100% \+ 14px\)/);
  assert.match(component, /style=\{positionReady \? \{ right: position\.right, bottom: position\.bottom \} : undefined\}/);
  assert.match(component, /setDock\(\{[\s\S]*?left: centerX < window\.innerWidth \/ 2/);
  assert.match(styles, /\.science-pet\.is-top \.pet-chat\s*\{[\s\S]*?top:\s*calc\(100% \+ 14px\)/);
});

test("keeps touch dragging available on mobile pointers", () => {
  assert.match(component, /if \(event\.pointerType === "mouse" && event\.button !== 0\) return;/);
  assert.match(component, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
});

test("does not lock the home-page pet away from its inline drag position", () => {
  const homePetRule = styles.match(/\.home-page \.science-pet\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.doesNotMatch(homePetRule, /\b(?:position|top|right|left|bottom):[^;]*!important/);
});

test("keeps the pet position stable during SSR hydration before applying mobile placement", () => {
  assert.match(component, /const \[position, setPosition\] = useState<PetPosition>\(\{ right: 18, bottom: 10 \}\);/);
  assert.match(component, /const \[positionReady, setPositionReady\] = useState\(false\);/);
  assert.match(component, /useLayoutEffect\(\(\) => \{[\s\S]*?requestAnimationFrame\([\s\S]*?if \(window\.innerWidth <= 1023\) \{[\s\S]*?positionRef\.current = mobilePosition;[\s\S]*?setPosition\(mobilePosition\);[\s\S]*?setPositionReady\(true\);/);
  assert.match(component, /setPositionReady\(true\);/);
  assert.doesNotMatch(component, /useState<PetPosition>\(\(\) => \{\s*const isMobile = typeof window/);
});

test("gives the 科小贝 chat a full usable mobile viewport instead of a half-height panel", () => {
  assert.match(styles, /\.pet-chat__messages\s*\{[\s\S]*?flex:\s*1[\s\S]*?max-height:\s*none/);
  assert.match(styles, /\.pet-chat\s*\{[\s\S]*?max-height:\s*min\(640px,\s*calc\(100dvh - 154px\)[^;]*;/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.pet-chat\s*\{[\s\S]*?height:\s*min\(680px,\s*calc\(100dvh - 84px\)[^;]*;/);
  assert.match(styles, /\.pet-chat\s*\{\s*position:\s*fixed;[\s\S]*?left:\s*6px;[\s\S]*?width:\s*auto;[\s\S]*?max-width:\s*none;/);
});

test("keeps generated lesson plans readable inside the chat bubble", () => {
  assert.match(component, /className="pet-message__markdown"/);
  assert.match(styles, /\.pet-message__markdown\s+h1,[\s\S]*?font-size:\s*12px/);
  assert.match(styles, /\.pet-message__markdown\s+ul,[\s\S]*?padding-left:\s*18px/);
});

test("renders trusted Dify output files as explicit download controls", () => {
  assert.match(component, /files\?: AiChatOutputFile\[\];/);
  assert.match(component, /import \{ buildAiChatDocumentDownloadUrl \} from "@\/lib\/ai-chat-download";/);
  assert.match(component, /message\.files\?\.length/);
  assert.match(component, /className="pet-message__output-files"/);
  assert.match(component, /className="pet-message__output-file"/);
  assert.match(component, /const downloadUrl = buildAiChatDocumentDownloadUrl\(file\);/);
  assert.match(component, /href=\{downloadUrl\}/);
  assert.doesNotMatch(component, /href=\{file\.url\}/);
  assert.match(component, /download/);
  assert.match(component, /aria-label=\{`下载文件 \$\{file\.name\}`\}/);
  assert.match(styles, /\.pet-message__output-file\s*\{/);
});

test("rejects oversized attachments before creating a local preview", () => {
  assert.match(component, /const MAX_ATTACHMENT_BYTES = 4 \* 1024 \* 1024;/);
  assert.match(
    component,
    /if \(attachment\.size > MAX_ATTACHMENT_BYTES\) \{[\s\S]*?event\.currentTarget\.value = "";[\s\S]*?setAttachmentNotice\("附件不能超过 4MB，请压缩后重试。"\);[\s\S]*?return;/,
  );
  assert.match(component, /className="pet-chat__attachment-notice" role="alert"/);
});

test("rejects direct video and MIME-extension conflicts before creating a local preview", () => {
  assert.match(component, /const DIRECT_VIDEO_ATTACHMENT_NOTICE = "暂不支持直接上传视频，请先提取关键帧或整理文字记录后再上传。";/);
  assert.match(component, /const ATTACHMENT_TYPE_MISMATCH_NOTICE = "附件类型与文件扩展名不一致，请重新选择原始文件。";/);
  assert.match(component, /function attachmentValidationMessage\(attachment: File\)/);
  assert.match(
    component,
    /const attachmentError = attachmentValidationMessage\(attachment\);[\s\S]*?if \(attachmentError\) \{[\s\S]*?event\.currentTarget\.value = "";[\s\S]*?setAttachmentNotice\(attachmentError\);[\s\S]*?return;/,
  );
});

test("normalizes undersized images before submitting them to the visual analysis route", () => {
  assert.match(component, /const VISION_MIN_IMAGE_EDGE = 512;/);
  assert.match(component, /async function normalizeSmallImageForVision\(attachment: File\): Promise<File>/);
  assert.match(component, /context\.fillStyle = "#ffffff";/);
  assert.match(component, /canvas\.toBlob\(resolve, "image\/jpeg", 0\.9\)/);
  assert.match(component, /const visionAttachment = await normalizeSmallImageForVision\(attachment\);/);
  assert.match(component, /setSelectedAttachment\(visionAttachment\);/);
});

test("adds assistant-only copy and Xunfei speech actions without changing user bubbles", () => {
  assert.match(component, /import \{[^}]*\bCopy\b[^}]*\bVolume2\b[^}]*\} from "lucide-react"/);
  assert.match(component, /function handleCopyMessage\(/);
  assert.match(component, /function toggleMessageSpeech\(/);
  assert.match(
    component,
    /\{message\.role === "assistant" \? \([\s\S]*?className="pet-message__actions"[\s\S]*?\) : null\}/,
  );
  assert.match(component, /aria-label=\{[^}]*复制回复/);
  assert.match(component, /aria-label=\{[^}]*播放回复/);
});

test("keeps phone calls isolated from press-and-hold recognition and cleans up on close", () => {
  assert.match(component, /\bPhoneCall\b/);
  assert.match(component, /const callRecognitionRef = useRef<SpeechRecognitionLike \| null>\(null\)/);
  assert.match(component, /function startVoiceCall\(/);
  assert.match(component, /const stopAllVoice = useCallback\(/);
  assert.match(component, /onClick=\{startVoiceCall\}/);
  assert.match(component, /onClick=\{handleCloseChat\}/);
  assert.match(component, /disabled=\{busy \|\| callPhase !== "idle"/);
  assert.match(component, /className="pet-call"/);
});

test("uses a stable voice cleanup callback when the chat component unmounts", () => {
  assert.match(component, /const stopAllVoice = useCallback\(/);
  assert.match(component, /stopAllVoice\(\{ resetUi: false \}\)/);
  assert.match(component, /\[stopAllVoice\]/);
});

test("releases a rejected audio play only when that audio is still current", () => {
  assert.match(component, /let audio: HTMLAudioElement \| null = null;/);
  assert.match(
    component,
    /catch \{\s*const shouldReportPlayFailure = !controller\.signal\.aborted;[\s\S]*?if \(audio && audioRef\.current === audio\) \{\s*stopActiveAudio\(\);\s*\}[\s\S]*?if \(shouldReportPlayFailure\) \{/,
  );
});

test("ignores stale recognition callbacks and applies call errors only to the current session", () => {
  assert.match(
    component,
    /function setVoiceCallError\(sessionId: number, message: string\) \{\s*const session = callSessionRef\.current;\s*if \(!isCurrentVoiceCall\(sessionId\)\) return;/,
  );
  assert.match(
    component,
    /recognition\.onerror = \(event\) => \{\s*if \(callRecognitionRef\.current !== recognition \|\| !isCurrentVoiceCall\(sessionId\)\) return;/,
  );
  assert.match(
    component,
    /recognition\.onend = \(\) => \{\s*if \(callRecognitionRef\.current !== recognition\) return;\s*callRecognitionRef\.current = null;[\s\S]*?!isCurrentVoiceCall\(sessionId\)/,
  );
});

test("buffers final recognition fragments while listening and sends one debounced request", () => {
  assert.match(component, /const callFinalTranscriptRef = useRef\(""\)/);
  assert.match(
    component,
    /recognition\.onresult = \(event\) => \{\s*if \(callRecognitionRef\.current !== recognition \|\| !isCurrentVoiceCallListening\(sessionId\)\) return;\s*const fragment = extractFinalTranscript\(event\)\.trim\(\);\s*if \(!fragment\) return;\s*callFinalTranscriptRef\.current \+= fragment;/,
  );
  assert.match(
    component,
    /const transcript = callFinalTranscriptRef\.current\.trim\(\);\s*callFinalTranscriptRef\.current = "";\s*void processVoiceCallTranscript\(transcript, sessionId\);/,
  );
  assert.match(component, /const clearCallTimers = useCallback\(\(\) => \{\s*callFinalTranscriptRef\.current = "";/);
  assert.match(
    component,
    /async function processVoiceCallTranscript\(transcript: string, sessionId: number\) \{\s*const session = callSessionRef\.current;\s*if \(!session \|\| !isCurrentVoiceCallListening\(sessionId\)\) return;\s*callFinalTranscriptRef\.current = "";/,
  );
});

test("stops active call audio before unmuting into a fresh listening session", () => {
  assert.match(
    component,
    /if \(callMutedRef\.current\) \{\s*stopActiveAudio\(\);\s*clearCallTimers\(\);\s*const session = beginVoiceSession\(callSessionIdRef\.current\);/,
  );
});

test("cleans active voice work when the pet button closes the chat", () => {
  assert.match(
    component,
    /function handlePetClick\(\) \{\s*if \(suppressClickRef\.current\) \{[\s\S]*?\}\s*if \(open\) \{\s*stopAllVoice\(\);\s*setOpen\(false\);\s*return;/,
  );
});

test("uses the real floating pet sprite inside the merged call card", () => {
  assert.match(component, /className="pet-call__pet-stage"/);
  assert.match(component, /className="science-pet__sprite pet-call__pet"/);
  assert.match(component, /style=\{spriteStyle\}/);
  assert.match(styles, /\.pet-call__pet\s*\{[\s\S]*?image-rendering:\s*auto/);
});

test("uses the supplied six-by-eight 科小贝 science sprite without a checkerboard backdrop", () => {
  assert.match(component, /const spriteColumns = 6;/);
  assert.match(component, /const spriteRows = 8;/);
  assert.match(component, /idle:\s*\{ row: 0,/);
  assert.match(component, /"running-right":\s*\{ row: 1,/);
  assert.match(component, /"running-left":\s*\{ row: 2,/);
  assert.match(component, /waiting:\s*\{ row: 4,/);
  assert.match(component, /moving:\s*\{ row: 5,/);
  assert.match(component, /working:\s*\{ row: 6,/);
  assert.match(component, /visibleFrame \/ \(spriteColumns - 1\)/);
  assert.match(component, /animation\.row \/ \(spriteRows - 1\)/);
  assert.match(component, /aria-label="科小贝科学实验员"/);
  assert.match(component, /title="拖动科小贝，点击开始对话"/);
  assert.match(styles, /background-image:\s*url\("\/assets\/kexiaobei-lab-spritesheet-v3\.png"\)/);
  assert.match(styles, /background-size:\s*600%\s+800%/);
  assert.match(styles, /image-rendering:\s*auto/);
  assert.doesNotMatch(styles, /seedy-spritesheet-v10\.webp/);
  assert.ok(fs.existsSync(path.resolve("public/assets/kexiaobei-lab-spritesheet-v3.png")));
});

test("uses the scoped Uiverse ghost loader instead of the square typing dots", () => {
  assert.match(component, /function ThinkingGhost\(\)/);
  assert.match(component, /className="thinking-ghost"/);
  assert.match(component, /const thinkingGhostPieces = \[[\s\S]*"top0"[\s\S]*"an18"/);
  assert.match(component, /data-piece=\{piece\}/);
  assert.match(styles, /\.thinking-ghost__body\s*\{[\s\S]*?grid-template-areas:/);
  assert.match(styles, /@keyframes thinking-ghost-up/);
  assert.doesNotMatch(styles, /#ghost\s*\{/);
});

test("keeps call bubbles between the voiceprint and the three call controls", () => {
  assert.match(component, /className="pet-call__messages"/);
  assert.match(component, /className="pet-call__bubble pet-call__bubble--assistant"/);
  assert.match(component, /className="pet-call__bubble pet-call__bubble--user"/);
  assert.match(component, /<ThinkingGhost \/>/);
  assert.match(component, /aria-label="扬声器"/);
  assert.match(component, /aria-label="结束通话"/);
  assert.match(component, /callPhase === "idle" \?/);
  assert.doesNotMatch(component, /className="pet-call__status"/);
  assert.doesNotMatch(component, /className="pet-call__turns"/);
});

test("re-measures the moving pet before placing the mobile chat window", () => {
  assert.match(
    component,
    /useLayoutEffect\(\(\) => \{\s*if \(!open\) return;\s*const frame = window\.requestAnimationFrame\(\(\) => \{/,
  );
  assert.match(component, /return \(\) => window\.cancelAnimationFrame\(frame\);\s*\}, \[open, position, autoWalk\]\);/);
});

test("starts each new voice turn with a fresh reply while retaining the latest chat context", () => {
  assert.match(component, /const messagesRef = useRef<PetMessage\[\]>\(messages\);/);
  assert.match(component, /useEffect\(\(\) => \{\s*messagesRef\.current = messages;\s*\}, \[messages\]\);/);
  assert.match(
    component,
    /setCallPhase\("thinking"\);\s*setCallReply\(""\);\s*setCallTranscript\(transcript\);/,
  );
  assert.match(component, /const history = messagesRef\.current\.slice\(-12\)\.map\(\(message\) => \(\{/);
});

test("uses the latest call speaker setting when a later TTS response begins", () => {
  assert.match(component, /const speakerEnabledRef = useRef\(true\);/);
  assert.match(component, /audio\.muted = options\.callSessionId !== undefined && !speakerEnabledRef\.current;/);
  assert.match(component, /speakerEnabledRef\.current = true;\s*setSpeakerEnabled\(true\);/);
  assert.match(component, /const nextEnabled = !speakerEnabledRef\.current;\s*speakerEnabledRef\.current = nextEnabled;/);
});

test("keeps the supplied floating pixel-loader compact inside a message bubble and recolored leaf green", () => {
  assert.match(component, /className="thinking-ghost__scene"/);
  assert.match(styles, /\.thinking-ghost\s*\{[\s\S]*?width:\s*48px[\s\S]*?height:\s*48px/);
  assert.match(styles, /\.thinking-ghost__scene\s*\{[\s\S]*?width:\s*140px[\s\S]*?height:\s*140px[\s\S]*?scale:\s*0\.34/);
  assert.match(styles, /\.thinking-ghost__piece\[data-piece\^="top"\],[\s\S]*?background:\s*#4fb86b/);
  assert.match(styles, /\.thinking-ghost__shadow\s*\{[\s\S]*?width:\s*140px[\s\S]*?height:\s*140px[\s\S]*?transform:\s*rotateX\(80deg\)[\s\S]*?filter:\s*blur\(20px\)/);
});

test("keeps only the inner icon button outlined in the call controls", () => {
  const controlRule = styles.match(/\.pet-call__control\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const endControlRule = styles.match(/\.pet-call__control--end\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(controlRule, /\bborder\s*:/);
  assert.match(styles, /\.pet-call__control svg\s*\{[\s\S]*?border:\s*1px solid/);
  assert.doesNotMatch(endControlRule, /\bborder-color\s*:/);
});

test("keeps the call-card pet out of the compact floating-pet sprite rule", () => {
  assert.match(styles, /\.home-page \.science-pet__button \.science-pet__sprite\s*\{/);
  assert.doesNotMatch(styles, /\.home-page \.science-pet__sprite\s*\{/);
});
