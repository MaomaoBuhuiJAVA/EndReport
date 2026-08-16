import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/AgentHome.tsx"), "utf8");

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
    /const secondaryHeroImage = homeHeroImages\[\(activeHeroIndex \+ 1\) % homeHeroImages\.length\];/,
  );
  assert.match(component, /alt=\{secondaryHeroImage\.alt\}/);
  assert.match(component, /absolute bottom-0 left-5 z-10/);
});
