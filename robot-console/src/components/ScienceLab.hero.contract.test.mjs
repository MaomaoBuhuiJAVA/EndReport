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
    /normalizeScienceSelection\(initialItems, \{[\s\S]*?category: initialCategory \?\? "",[\s\S]*?topic: "",[\s\S]*?ageLabel: "",[\s\S]*?\}\)/,
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

test("embeds public video resources for direct playback in the detail dialog", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(component, /<video[\s\S]*controls[\s\S]*playsInline[\s\S]*preload="metadata"/);
  assert.match(component, /function videoMimeType\(value: string\)/);
  assert.match(component, /<source[\s\S]*src=\{videoUrl \?\? ""\}[\s\S]*type=\{videoMimeType\(videoUrl \?\? ""\)\}/);
  assert.match(component, /className="video-resource__player"/);
  assert.match(styles, /\.video-resource__player\s*\{/);
});

test("adds a compact mobile return-home control beside the lab search", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(component, /import \{[\s\S]*?\bHouse\b[\s\S]*?\} from "lucide-react"/);
  assert.match(component, /className="lab-search__home" href="\/"/);
  assert.match(component, /aria-label="返回首页"/);
  assert.match(styles, /\.lab-search__home\s*\{/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.lab-search__home[\s\S]*?display:\s*grid/);
});

test("uses two-column illustrated cover cards for science poems and stories", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(component, /knowledge-card--literature/);
  assert.match(component, /knowledge-card__cover-title/);
  assert.match(component, /categoryVisual\.image/);
  assert.match(styles, /\.knowledge-card--literature/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.knowledge-grid--literature[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.match(styles, /\.knowledge-card--literature[\s\S]*?background:\s*linear-gradient/);
  assert.match(styles, /\.knowledge-card--literature[\s\S]*?box-shadow:/);
});

test("uses each science story video cover with an illustrated fallback", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /function scienceStoryCoverPath\(item: ScienceKnowledgeSummary\)/);
  assert.match(component, /science-story-covers\/\$\{item\.id\}\.webp/);
  assert.match(component, /const \[failedStoryCover, setFailedStoryCover\] = useState\(""\)/);
  assert.match(component, /const storyCoverFailed = Boolean\(storyCover && failedStoryCover === storyCover\)/);
  assert.match(
    component,
    /setFailedStoryCover\(storyCover\)/,
  );
  assert.match(component, /setFailedPoemCover\(poemCover\)/);
  assert.match(component, /storyCoverFailed \? categoryVisual\.image : storyCover/);
});

test("ships one generated cover for every science story record", () => {
  const catalog = JSON.parse(
    fs.readFileSync(path.resolve("src/data/science-knowledge.json"), "utf8"),
  );
  const storyIds = catalog
    .filter((item) => item.category === "科学故事")
    .map((item) => item.id);
  const coverDirectory = path.resolve("public/science-story-covers");
  const coverFiles = new Set(fs.readdirSync(coverDirectory));

  assert.equal(storyIds.length, 28);
  for (const storyId of storyIds) {
    assert.ok(coverFiles.has(`${storyId}.webp`), `missing cover for ${storyId}`);
  }
});

test("only embeds direct video URLs and keeps QR redirects as links", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /function isDirectVideoUrl\(value: string\)/);
  assert.match(component, /const isPlayableVideo = Boolean\(videoUrl && isDirectVideoUrl\(videoUrl\)\)/);
  assert.match(component, /\{isPlayableVideo \? \([\s\S]*?<video/);
  assert.match(component, /\{videoUrl \? \([\s\S]*?className="video-link"/);
  assert.match(component, /isPlayableVideo \? "播放视频" : "打开视频页面"/);
});

test("bypasses Next image optimization for public external detail covers", () => {
  const component = fs.readFileSync(componentPath, "utf8");

  assert.match(component, /unoptimized=\{\/\^https\?:\\\/\\\//);
});

test("keeps literature card icons and age labels in separate top corners", () => {
  const styles = fs.readFileSync(stylesPath, "utf8");
  const literatureSemesterRule =
    styles.match(/\.knowledge-card--literature \.knowledge-card__semester\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const mobileLiteratureSemesterRule =
    styles.match(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.knowledge-card--literature \.knowledge-card__semester\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.match(literatureSemesterRule, /left:\s*auto/);
  assert.match(literatureSemesterRule, /right:\s*10px/);
  assert.match(literatureSemesterRule, /z-index:\s*3/);
  assert.match(mobileLiteratureSemesterRule, /right:\s*8px/);
});

test("moves experiment age labels into the body before the category", () => {
  const component = fs.readFileSync(componentPath, "utf8");
  const styles = fs.readFileSync(stylesPath, "utf8");

  assert.match(
    component,
    /className="knowledge-card__category-row"[\s\S]*?item\.category === "科学实验"[\s\S]*?className="knowledge-card__experiment-age"[\s\S]*?className="knowledge-card__category"/,
  );
  assert.match(
    styles,
    /\.knowledge-card__category-row\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-wrap:\s*wrap/,
  );
  const experimentAgeRule =
    styles.match(/\.knowledge-card__experiment-age\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(experimentAgeRule, /position:\s*static/);
  assert.match(experimentAgeRule, /background:\s*#e3f3ed/);
  assert.match(experimentAgeRule, /border:\s*1px\s+solid\s+#b8ddd1/);
});
