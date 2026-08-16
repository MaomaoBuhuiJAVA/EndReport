import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/AgentHome.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

function cssRule(selector) {
  const selectorIndex = styles.indexOf(`${selector} {`);
  assert.notEqual(selectorIndex, -1, `Expected CSS rule for ${selector}`);

  const blockStart = styles.indexOf("{", selectorIndex);
  const blockEnd = styles.indexOf("}", blockStart);
  return styles.slice(blockStart + 1, blockEnd);
}

test("keeps the home hero title and image label clear at a standard desktop width", () => {
  assert.match(component, /text-4xl[^"`]*md:text-5xl/);
  assert.doesNotMatch(component, /md:text-6xl/);
  assert.match(component, /bg-gradient-to-b from-\[#173b42\]\/85/);
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
