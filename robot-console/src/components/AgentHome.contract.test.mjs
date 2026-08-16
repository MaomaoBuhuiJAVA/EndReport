import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/AgentHome.tsx"), "utf8");
const mobileNav = fs.readFileSync(path.resolve("src/components/MobileAppNav.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

function cssRule(selector) {
  const selectorIndex = styles.indexOf(`${selector} {`);
  assert.notEqual(selectorIndex, -1, `Expected CSS rule for ${selector}`);

  const blockStart = styles.indexOf("{", selectorIndex);
  const blockEnd = styles.indexOf("}", blockStart);
  return styles.slice(blockStart + 1, blockEnd);
}

test("keeps the home hero title readable while using a larger image edge overlay", () => {
  assert.match(component, /text-4xl[^"`]*md:text-5xl/);
  assert.doesNotMatch(component, /md:text-6xl/);
  assert.doesNotMatch(component, /科小贝正在准备/);
  assert.doesNotMatch(component, /今天的科学探索/);
  assert.match(styles, /\.home-hero__primary-frame::after\s*\{/);
  assert.match(styles, /\.home-hero__primary-frame::after[\s\S]*?linear-gradient\(\s*180deg/);
});

test("keeps the public home focused on the 科小贝 agent instead of embedding legacy document browsing", () => {
  assert.doesNotMatch(component, /id="school-documents"/);
  assert.doesNotMatch(component, /href="#school-documents"/);
});

test("rotates the supplied seven-photo set in the 科小贝 home hero", () => {
  const expectedImages = Array.from(
    { length: 7 },
    (_, index) => `/gallery/kexiaobei-home/kexiaobei-home-${String(index + 1).padStart(2, "0")}.webp`,
  );
  const imagePaths = [...component.matchAll(/\/gallery\/kexiaobei-home\/kexiaobei-home-\d{2}\.webp/g)].map(
    ([imagePath]) => imagePath,
  );

  assert.deepEqual(imagePaths, expectedImages);
  assert.match(component, /const \[activeHeroIndex, setActiveHeroIndex\] = useState\(0\)/);
  assert.match(component, /window\.setInterval\(/);
  assert.match(component, /\}, 5000\);/);
  assert.match(component, /homeHeroImages\.map\(/);
});

test("replaces the example prompt card with a partially overlapping secondary photo", () => {
  assert.doesNotMatch(component, /可以这样问科小贝/);
  assert.doesNotMatch(component, /生成《玩转纸片》完整教案/);
  assert.match(
    component,
    /const secondaryHeroIndex = \(activeHeroIndex \+ 1\) % homeHeroImages\.length;/,
  );
  assert.match(component, /alt=\{secondaryHeroImage\.alt\}/);
  assert.match(component, /className="home-hero__secondary-frame"/);
});

test("places hero photos on diagonal layers with fade and scale transitions", () => {
  assert.match(component, /home-hero__primary-frame/);
  assert.match(component, /home-hero__secondary-frame/);
  assert.match(component, /home-hero__primary-image/);
  assert.match(component, /home-hero__secondary-image/);
  assert.match(component, /home-hero__primary-image--active/);
  assert.match(component, /home-hero__primary-image--inactive/);
  assert.doesNotMatch(component, /scale-\[/);
  assert.match(styles, /\.home-hero__primary-frame[\s\S]*?rotate\(/);
  assert.match(styles, /\.home-hero__secondary-frame[\s\S]*?rotate\(/);
  assert.match(cssRule(".home-hero__primary-image"), /transition:[\s\S]*?opacity[\s\S]*?transform/);
  assert.match(cssRule(".home-hero__primary-image--active"), /transform:\s*scale\(1\)/);
  assert.match(cssRule(".home-hero__primary-image--inactive"), /transform:\s*scale\(1\.04\)/);
  assert.match(cssRule(".home-hero__secondary-image"), /animation:\s*home-hero-image-enter/);
  assert.match(styles, /@keyframes home-hero-image-enter\s*\{[\s\S]*?from\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?transform:\s*scale\(1\.08\);[\s\S]*?to\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*scale\(1\);/);
});

test("animates the three module entries into the mobile navigation before routing", () => {
  assert.match(component, /LayoutGroup/);
  assert.match(component, /layoutId=\{`home-module-\$\{item\.key\}`\}/);
  assert.match(component, /home-page--fading/);
  assert.match(component, /router\.push\(`\/lab\?type=\$\{encodeURIComponent\(category\)\}`\)/);
  assert.match(component, /setTimeout\(\(\) => \{[\s\S]*?setHomeFade\(true\)/);
  assert.doesNotMatch(component, /scrollIntoView\(/);
});

test("keeps the mobile module transition under 400 milliseconds", () => {
  assert.match(component, /const HOME_MOBILE_MODULE_FADE_DELAY_MS = 150;/);
  assert.match(component, /const HOME_MOBILE_MODULE_ROUTE_DELAY_MS = 380;/);
  assert.match(component, /const HOME_MOBILE_MODULE_LAYOUT_DURATION_S = 0\.28;/);
  assert.match(component, /\}, HOME_MOBILE_MODULE_FADE_DELAY_MS\);/);
  assert.match(component, /\}, HOME_MOBILE_MODULE_ROUTE_DELAY_MS\);/);
  assert.match(component, /duration: HOME_MOBILE_MODULE_LAYOUT_DURATION_S/);
  assert.match(component, /layoutDuration=\{HOME_MOBILE_MODULE_LAYOUT_DURATION_S\}/);
  assert.match(mobileNav, /layoutDuration\?: number/);
  assert.match(mobileNav, /duration: layoutDuration/);
  assert.match(cssRule(".home-page"), /transition:\s*opacity 180ms ease/);
  assert.doesNotMatch(component, /\}, 720\);/);
});

test("uses the same module icon family as the lab navigation", () => {
  assert.match(component, /import \{[\s\S]*?\bBookOpen\b[\s\S]*?\bClapperboard\b[\s\S]*?\bFlaskConical\b[\s\S]*?\} from "lucide-react"/);
  assert.match(component, /icon: BookOpen/);
  assert.match(component, /icon: Clapperboard/);
  assert.match(component, /icon: FlaskConical/);
});

test("adds a slow, translucent broken-photo background layer for desktop", () => {
  assert.match(component, /home-hero__ambient-gallery/);
  assert.match(component, /homeHeroImages\.map\(\(image, index\) =>/);
  assert.match(component, /home-hero__ambient-fragment/);
  assert.match(styles, /\.home-hero__ambient-gallery\s*\{/);
  assert.match(styles, /clip-path:\s*polygon\(/);
  assert.match(styles, /mask-image:\s*linear-gradient/);
  assert.match(styles, /@keyframes home-ambient-drift/);
  assert.match(styles, /animation:\s*home-ambient-drift/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.home-hero__ambient-gallery[\s\S]*?display:\s*none/);
});
