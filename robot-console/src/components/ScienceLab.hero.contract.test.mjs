import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const componentPath = path.resolve("src/components/ScienceLab.tsx");
const stylesPath = path.resolve("app/globals.css");

test("keeps the original lab hero and limits the redesign to the option bar", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /className="lab-hero"/);
  assert.match(component, /lab-hero__photos/);
  assert.match(component, /className="rotating-text">实验室<\/span>/);
  assert.doesNotMatch(component, /className="lab-shell lab-intro"/);
  assert.match(component, /label="类型"/);
  assert.match(component, /label="年龄段"/);
  assert.doesNotMatch(component, /label="主题"/);
});

test("keeps only type and age controls in the filter panel", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /lab-category-buttons\/poetry\.png/);
  assert.match(component, /lab-category-buttons\/story\.png/);
  assert.match(component, /lab-category-buttons\/experiment\.png/);
  assert.match(component, /compact-filter-row--type/);
  assert.doesNotMatch(component, /compact-filter-row--topic/);
  assert.doesNotMatch(component, /items=\{\["全部", \.\.\.topics\]\}/);
  assert.doesNotMatch(component, /function changeTopic/);
});

test("shows each type name below its mobile illustration", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(component, /compact-filter-choice__label/);
  assert.match(styles, /\.compact-filter-row--type\s+\.compact-filter-choice\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(styles, /\.compact-filter-row--type\s+\.compact-filter-choice__label\s*\{[\s\S]*?display:\s*block/);
});

test("opens the requested resource in the existing detail dialog", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /initialResourceId\?:\s*string/);
  assert.match(component, /initialResourceId[\s\S]*initialItems\.find/);
  assert.match(component, /window\.setTimeout\(\(\) => \{[\s\S]*?void openDetail\(summary\)/);
  assert.match(component, /window\.clearTimeout\(autoOpenTimer\)/);
});

test("keeps age choices broad after removing the topic control", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(
    component,
    /normalizeScienceSelection\(initialItems, \{ category: "", topic: "", ageLabel: "" \}\)/,
  );
  assert.match(component, /items=\{\["全部", \.\.\.categories\]\}/);
  assert.match(component, /items=\{\["全部", \.\.\.ages\]\}/);
  assert.match(component, /availableAges\(initialItems, selection\.category, ""\)/);
  assert.doesNotMatch(component, /selection\.topic/);
});

test("renders ordered experiment images after the experiment instructions", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /className="markdown-content knowledge-detail__content"[\s\S]*className="knowledge-detail__steps"/);
  assert.match(component, /className="knowledge-detail__steps"[\s\S]*images\.map/);
});

test("groups source experiment images by their role with meaningful captions", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /experimentImageCaption/);
  assert.match(component, /experimentImageRole/);
  assert.match(component, /材料准备/);
  assert.match(component, /操作步骤/);
  assert.doesNotMatch(component, /figcaption>实验步骤图片 \{index \+ 1\}<\/figcaption>/);
});

test("shows every collected video QR and links the resources that have a playback URL", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(component, /const videoResources = display\.resources\.filter/);
  assert.match(component, /videoResources\.map/);
  assert.match(component, /videoResource\.externalUrl/);
  assert.match(component, /className="video-resource"/);
  assert.match(component, /className="video-qr-code"/);
  assert.match(component, /const videoLabel = `视频资源 \$\{index \+ 1\}`/);
  assert.match(styles, /\.video-qr-code\s*\{/);
});
