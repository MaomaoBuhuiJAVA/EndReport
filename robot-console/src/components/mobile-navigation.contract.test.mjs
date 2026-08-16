import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(".");
const home = fs.readFileSync(path.join(root, "src/components/AgentHome.tsx"), "utf8");
const lab = fs.readFileSync(path.join(root, "src/components/ScienceLab.tsx"), "utf8");
const nav = fs.readFileSync(path.join(root, "src/components/MobileAppNav.tsx"), "utf8");
const pet = fs.readFileSync(path.join(root, "src/components/SciencePet.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

test("home exposes only the three science modules as mobile entry actions", () => {
  assert.match(home, /home-category-actions/);
  assert.match(home, /科学诗/);
  assert.match(home, /科学故事/);
  assert.match(home, /科学实验/);
  assert.match(home, /\/lab\?type=/);
  assert.match(home, /home-page__bottom-anchor/);
  assert.match(home, /LayoutGroup/);
  assert.match(home, /layoutId=\{`home-module-\$\{item\.key\}`\}/);
  assert.match(home, /home-page--fading/);
  assert.doesNotMatch(home, />开始对话<\/button>/);
  assert.doesNotMatch(home, />进入科小贝实验室<\/Link>/);
});

test("lab accepts a type query and uses the three modules as mobile navigation", () => {
  assert.match(lab, /initialCategory\?:\s*string/);
  assert.match(lab, /key: "科学诗"/);
  assert.match(lab, /key: "科学故事"/);
  assert.match(lab, /key: "科学实验"/);
  assert.match(lab, /activeKey=\{selection\.category\}/);
  assert.match(lab, /compact-filter-row--type/);
});

test("mobile navigation supports an optional icon without changing existing links", () => {
  assert.match(nav, /icon\?:/);
  assert.match(nav, /item\.icon/);
  assert.match(nav, /layoutIdPrefix\?:/);
  assert.match(nav, /const layoutId = `\$\{layoutIdPrefix\}-\$\{item\.key\}`/);
  assert.match(nav, /layoutId=\{layoutId\}/);
});

test("mobile layout removes chrome and keeps search plus bottom module navigation", () => {
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.home-site-header,[\s\S]*?\.lab-site-header/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.home-hero__media[\s\S]*?order:\s*-1/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.lab-hero__copy[\s\S]*?display:\s*none/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.lab-hero__photos[\s\S]*?display:\s*none/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.compact-filter-row--type[\s\S]*?display:\s*none/);
  assert.match(styles, /\.home-bottom-nav[\s\S]*?grid-template-columns:\s*repeat\(3/);
});

test("keeps the mobile assistant clear of module actions and bottom navigation", () => {
  assert.match(
    styles,
    /\.home-page \.home-hero__copy > p\s*\{[\s\S]*?padding-inline-end:\s*clamp\(58px, 17vw, 78px\)/,
  );
  const homePetRule = styles.match(/\.home-page \.science-pet\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(homePetRule, /width:\s*62px[\s\S]*?height:\s*68px/);
  assert.doesNotMatch(homePetRule, /\b(?:position|top|right|left|bottom):[^;]*!important/);
  assert.match(pet, /const mobilePosition = \{ right: 8, bottom: 82 \}/);
  assert.match(
    styles,
    /\.lab-page \.science-pet\s*\{[\s\S]*?right:\s*max\(8px, env\(safe-area-inset-right\)\)[^;]*;[\s\S]*?bottom:\s*calc\(82px \+ env\(safe-area-inset-bottom\)\)[^;]*;/,
  );
});

test("keeps the home slogan intact on narrow phones", () => {
  assert.match(
    styles,
    /@media \(max-width: 340px\)\s*\{[\s\S]*?\.home-page \.home-hero__copy h1\s*\{[\s\S]*?font-size:\s*30px/,
  );
});
