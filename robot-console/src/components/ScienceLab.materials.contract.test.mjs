import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/ScienceLab.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

test("adds the material entry only for science poems and stories", () => {
  assert.match(component, /selection\.category === "科学诗" \|\| selection\.category === "科学故事"/);
  assert.match(component, /className="science-material-add"/);
  assert.match(component, /aria-label="添加新材料"/);
  assert.match(component, /title="添加新材料"/);
  assert.match(component, /<Plus size=\{16\} aria-hidden="true" \/>/);
  assert.match(component, /setMaterialCategory\(selection\.category as MaterialCategory\)/);
});

test("collects the required poem and story fields in the existing laboratory dialog", () => {
  assert.match(component, /<h2 id="science-material-dialog-title">添加新材料<\/h2>/);
  assert.match(component, /科学诗正文 <b>\*<\/b>/);
  assert.match(component, /故事视频 <b>\*<\/b>/);
  assert.match(component, /内容简介 \/ 教学提示 <b>\*<\/b>/);
  assert.match(component, /\/api\/science-resources\/recognize/);
});

test("offers an optional cover-image upload and includes it in the material submit payload", () => {
  const dialog = component.match(/function ScienceMaterialDialog\([\s\S]*?\n}\n\nexport function ScienceLab/)?.[0] ?? component;

  assert.match(component, /coverFile: File \| null/);
  assert.match(dialog, /const \[coverFile, setCoverFile\] = useState<File \| null>\(null\)/);
  assert.match(dialog, /<span>封面图片（可选）<\/span>/);
  assert.match(dialog, /accept="image\/\*,\.jpg,\.jpeg,\.png,\.webp"/);
  assert.match(dialog, /setCoverFile\(event\.target\.files\?\.\[0\] \?\? null\)/);
  assert.match(dialog, /category,\s*form,\s*coverFile,\s*poemFile,\s*videoFile,\s*supportingFile,/);
});

test("uploads files directly to Blob before saving catalogue metadata", () => {
  assert.match(component, /import \{ upload \} from "@vercel\/blob\/client"/);
  assert.match(component, /handleUploadUrl: "\/api\/science-resources\/upload"/);
  assert.match(component, /multipart: file\.size > 8 \* 1024 \* 1024/);
  assert.match(component, /uploadMaterialFile\(videoFile, "stories", onUploadProgress\)/);
  assert.match(component, /requestBody\.set\("videoUrl", videoUrl\)/);
  assert.match(component, /requestBody\.set\("documentUrl", await uploadMaterialFile/);
});

test("uses a user-uploaded cover before submitting the material", () => {
  const submitFlow = component.match(/const submitMaterial = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0] ?? component;

  assert.match(submitFlow, /form,\s*coverFile,\s*poemFile,\s*videoFile,\s*supportingFile,/);
  assert.match(
    submitFlow,
    /if \(coverFile\) \{[\s\S]*?uploadMaterialFile\(coverFile, "covers", onUploadProgress\)[\s\S]*?requestBody\.set\("coverUrl", coverUrl\);/,
  );
});

test("uses the first story-video frame as a WebP cover before submitting the story", () => {
  assert.match(component, /function extractVideoFirstFrame\(file: File\)/);
  assert.match(component, /document\.createElement\("video"\)/);
  assert.match(component, /canvas\.toBlob\([\s\S]*?"image\/webp"/);
  assert.match(component, /URL\.revokeObjectURL\(/);
  assert.match(component, /"poems" \| "stories" \| "supporting" \| "covers"/);

  const submitFlow = component.match(/const submitMaterial = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0] ?? component;
  assert.match(submitFlow, /category === "科学故事" && videoFile/);
  assert.match(submitFlow, /extractVideoFirstFrame\(videoFile\)/);
  assert.match(submitFlow, /uploadMaterialFile\(storyCover, "covers", onUploadProgress\)/);
  assert.match(submitFlow, /requestBody\.set\("coverUrl",/);
  assert.match(submitFlow, /requestBody\.set\("videoUrl", videoUrl\)/);
  assert.match(submitFlow, /uploadedCoverReady \? Promise\.resolve\(null\) : extractVideoFirstFrame\(videoFile\)/);
  assert.match(submitFlow, /if \(!uploadedCoverReady && storyCover\)/);
});

test("generates and persists a poem cover only when no user cover was uploaded", () => {
  const poemFlow = component.match(/if \(category === "科学诗" && !uploadedCoverReady\) \{[\s\S]*?\n      \}/)?.[0] ?? "";
  assert.match(poemFlow, /\/api\/science-resources\/generate-cover/);
  assert.match(poemFlow, /method: "PATCH"/);
  assert.match(poemFlow, /卡通封面已自动生成/);
  assert.doesNotMatch(poemFlow, /DIFY_API_KEY/);
});

test("shows a dismissible success card after material creation", () => {
  assert.match(component, /title: "添加成功"/);
  assert.match(component, /className="science-material-success-toast"/);
  assert.match(component, /<CheckCircle2 /);
  assert.match(component, /onClick=\{\(\) => setMaterialSuccessNotice\(null\)\}/);
});

test("uses generated literature covers as a full card image instead of a framed thumbnail", () => {
  const coverRule = styles.match(/\.knowledge-card__media > \.knowledge-card__literature-art \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(coverRule, /position: absolute/);
  assert.match(coverRule, /inset: 0/);
  assert.match(coverRule, /width: 100%/);
  assert.match(coverRule, /height: 100%/);
  assert.match(coverRule, /object-fit: cover/);
  assert.doesNotMatch(coverRule, /object-fit: contain/);
});

test("does not repeat a user-submitted poem or story cover in its detail gallery", () => {
  assert.match(component, /const userSubmittedLiterature =/);
  assert.match(component, /display\.category === "科学诗" \|\| display\.category === "科学故事"/);
  assert.match(component, /item\?\.allocationBasis === "用户提交"/);
  assert.match(component, /const detailImages = userSubmittedLiterature/);
  assert.match(component, /images\.filter\(\(image\) => !\/\(\?:封面\|cover\)\/iu\.test\(image\.title\)\)/);

  const literatureGallery = component.match(/\{detailImages\.length && display\.category !== "科学实验" \?[\s\S]*?\) : null\}/)?.[0] ?? "";
  assert.match(literatureGallery, /detailImages\.map\(\(image\) =>/);
  assert.doesNotMatch(literatureGallery, /\{images\.map/);
});
