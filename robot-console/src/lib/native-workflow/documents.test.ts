import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createTeachingDocument, resolveChinesePdfFont } from "./documents";

const content = "# 家长通知\n\n请带好水杯。\n\n## 春天的诗\n小草绿了，花儿开了。\n\n- 第一项\n- 第二项\n\n| 班级 | 人数 |\n| --- | --- |\n| 大班 | 25 |";
describe("native teaching documents", () => {
  it("finds the traced Chinese font without package metadata across nested module paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "pdf-font-resolution-"));
    const appModules = join(root, "node_modules");
    const nestedModules = join(appModules, ".pnpm", "pdfkit@0.20.2", "node_modules");
    const font = join(appModules, "@embedpdf", "fonts-sc", "fonts", "NotoSansHans-Regular.otf");
    try {
      await mkdir(dirname(font), { recursive: true });
      await writeFile(font, new Uint8Array([1]));
      expect(resolveChinesePdfFont([nestedModules, appModules])).toBe(font);
      expect(() => resolveChinesePdfFont([nestedModules])).toThrow("PDFKit 中文字体资源缺失");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves the Chinese font from the app working directory in a bundled server", async () => {
    const root = await mkdtemp(join(tmpdir(), "pdf-font-app-root-"));
    const previous = process.cwd();
    const font = join(root, "node_modules", "@embedpdf", "fonts-sc", "fonts", "NotoSansHans-Regular.otf");
    try {
      await mkdir(dirname(font), { recursive: true });
      await writeFile(font, new Uint8Array([1]));
      process.chdir(root);
      expect(resolveChinesePdfFont()).toBe(font);
    } finally {
      process.chdir(previous);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves arbitrary Chinese headings, prose, lists and tables in real Word structure", async () => {
    const file = await createTeachingDocument(content, "docx", "家长通知");
    const zip = await JSZip.loadAsync(file.bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const text of ["请带好水杯。", "春天的诗", "小草绿了，花儿开了。", "第一项", "第二项", "大班", "25"]) expect(xml).toContain(text);
    expect(xml).toContain("w:tbl");
    expect(xml).toContain("Heading");
    expect(file.name).toBe("家长通知.docx");
  });
  it("embeds a redistributable Chinese font and readable Chinese text in a valid PDF", async () => {
    const file = await createTeachingDocument(content, "pdf", "通知");
    const pdf = await getDocument({ data: file.bytes.slice(), useSystemFonts: false }).promise;
    const texts: string[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const data = await (await pdf.getPage(page)).getTextContent();
      texts.push(...data.items.map((item) => "str" in item ? item.str : ""));
    }
    expect(texts.join("")).toContain("小草绿了，花儿开了。");
    expect(texts.join("")).toContain("第二项");
    expect(Buffer.from(file.bytes).toString("latin1")).toMatch(/FontFile[23]/);
    await pdf.destroy();
  });
  it("preserves page order, all long content and presenter notes in a real presentation", async () => {
    const file = await createTeachingDocument("# 第一页\n认识春天\n\n备注：请幼儿观察\n\n---\n\n# 第二页\n" + "完整句子。".repeat(160), "pptx", "春天");
    const zip = await JSZip.loadAsync(file.bytes);
    expect(await zip.file("ppt/slides/slide1.xml")!.async("string")).toContain("第一页");
    expect(await zip.file("ppt/slides/slide2.xml")!.async("string")).toContain("第二页");
    const slides = await Promise.all(Object.values(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/.test(file.name)).map((file) => file.async("string")));
    expect(slides.join("").replace(/<[^>]+>/g, "").match(/完整句子。/g)).toHaveLength(160);
    expect(await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string")).toContain("请幼儿观察");
  });
  it("exports actual Markdown tables as worksheet cells, including escaped pipes", async () => {
    const file = await createTeachingDocument("# 名册\n| 名字 | 说明 |\n| :--- | ---: |\n| 小明 | A\\|B |\n\n| 项目 | 数量 |\n| --- | --- |\n| 积木 | 3 |", "xlsx", "名册");
    const workbook = XLSX.read(file.bytes, { type: "array" });
    expect(workbook.SheetNames).toHaveLength(2);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })).toEqual([["名字", "说明"], ["小明", "A|B"]]);
  });
  it("merges an extra standalone topic title into the first requested slide without losing any content", async () => {
    const paragraphs = Array.from({length: 10}, (_, index) => `第${index + 1}项空气观察记录。`);
    const markdown = ["空气在哪里？", ...paragraphs].join("\n---\n");
    const file = await createTeachingDocument(markdown, "pptx", "教学文稿", {slideCount: 10, query: "中班空气在哪里10页PPT，不另加封面"});
    const zip = await JSZip.loadAsync(file.bytes);
    const slides = await Promise.all(Object.values(zip.files).filter(file => /^ppt\/slides\/slide\d+\.xml$/u.test(file.name)).map(file => file.async("string")));
    expect(slides).toHaveLength(10);
    expect(slides[0]).toContain("空气在哪里？");
    const text = slides.join("").replace(/<[^>]+>/gu, "");
    for (const paragraph of paragraphs) expect(text.split(paragraph)).toHaveLength(2);
  });
  it("rejects a real slide-count mismatch instead of truncating teaching content", async () => {
    const markdown = Array.from({length: 5}, (_, index) => `# 观察${index + 1}\n真实观察记录${index + 1}`).join("\n---\n");
    const message = await createTeachingDocument(markdown, "pptx", "空气观察", {slideCount: 4, query: "制作4页空气观察PPT"}).then(() => "resolved", (error: Error) => error.message);
    expect(message).toMatch(/页数/u);
  });
  it("rejects overflow beyond an explicit slide count while retaining automatic pagination for ordinary exports", async () => {
    const message = await createTeachingDocument("# 观察\n" + "完整句子。".repeat(160), "pptx", "空气观察", {slideCount: 1, query: "制作1页空气观察PPT"}).then(() => "resolved", (error: Error) => error.message);
    expect(message).toMatch(/页数/u);
  });
  it("rejects empty output and spreadsheets without tables", async () => {
    await expect(createTeachingDocument(" ", "docx", "空")).rejects.toThrow(/空|内容/);
    await expect(createTeachingDocument("这是通知", "xlsx", "通知")).rejects.toThrow(/表格/);
  });
  it("uses Word numbering semantics for ordered and unordered lists", async () => {
    const file = await createTeachingDocument("# 步骤\n1. 观察\n2. 分享\n- 带水杯", "docx", "步骤");
    const zip = await JSZip.loadAsync(file.bytes);
    expect(await zip.file("word/document.xml")!.async("string")).toContain("w:numPr");
    const numbering = await zip.file("word/numbering.xml")!.async("string");
    expect(numbering).toContain("decimal"); expect(numbering).toContain("bullet");
  });
  it("represents presentation tables as editable table cells", async () => {
    const file = await createTeachingDocument("# 名册\n| 姓名 | 人数 |\n| --- | --- |\n| 大班 | 25 |", "pptx", "名册");
    const zip = await JSZip.loadAsync(file.bytes);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain("<a:tbl>"); expect(xml).toContain("大班"); expect(xml).toContain("25");
  });
  it("paginates long PDF table cells without placing their text outside the visible page", async () => {
    const file = await createTeachingDocument("| 记录 | 数量 |\n| --- | --- |\n| " + "完整资料。".repeat(500) + "最后一项 | 1 |", "pdf", "长表格");
    const pdf = await getDocument({data: file.bytes.slice(), useSystemFonts: false}).promise;
    let text = "";
    for (let page = 1; page <= pdf.numPages; page++) {
      const current = await pdf.getPage(page);
      const height = current.getViewport({scale: 1}).height;
      for (const item of (await current.getTextContent()).items) if ("str" in item) {
        text += item.str;
        expect(item.transform[5]).toBeGreaterThan(20);
        expect(item.transform[5]).toBeLessThan(height - 20);
      }
    }
    expect(text).toContain("最后一项");
    expect(text.replace(/记录|数量|1/g, "").match(/完整资料。/g)).toHaveLength(500);
    expect(pdf.numPages).toBeGreaterThan(1);
    await pdf.destroy();
  });
});
