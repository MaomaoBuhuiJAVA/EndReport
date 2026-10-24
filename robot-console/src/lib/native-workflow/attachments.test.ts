import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import sharp from "sharp";
import bmp from "bmp-js";
import { extractAttachment } from "./attachments";
import { createTeachingDocument } from "./documents";

describe("attachment extraction", () => {
  it("reads the actual UTF-8 text and explicitly marks truncation", async () => {
    const file = new File(["中文正文" + "甲".repeat(50000)], "通知.txt", { type: "text/plain" });
    const result = await extractAttachment(file);
    expect(result.text).toContain("中文正文");
    expect(result.text).toMatch(/截断/);
    expect(result.text.length).toBeLessThanOrEqual(50000);
  });
  it.each(["docx", "pdf", "pptx"] as const)("extracts Chinese content from actual %s bytes", async (format) => {
    const generated = await createTeachingDocument("# 春天\n幼儿观察花朵。", format, "观察");
    const result = await extractAttachment(new File([Buffer.from(generated.bytes)], generated.name, { type: generated.mimeType }));
    expect(result.text.replace(/\s/g, "")).toContain("幼儿观察花朵。");
  });
  it.each(["xlsx", "xls"])("reads spreadsheet values from actual %s workbook", async (format) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["姓名", "人数"], ["幼儿", 20]]), "班级");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: format === "xls" ? "xls" : "xlsx" });
    expect((await extractAttachment(new File([bytes], `名册.${format}`))).text).toContain("幼儿");
  });
  it("validates image bytes and derives data URL MIME from content", async () => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    expect((await extractAttachment(new File([bytes], "图.png", { type: "image/png" }))).dataUrl).toMatch(/^data:image\/png;base64,/);
    await expect(extractAttachment(new File(["not an image"], "伪造.png", { type: "image/png" }))).rejects.toThrow(/图片|格式/);
    await expect(extractAttachment(new File([bytes], "错.jpg", { type: "image/jpeg" }))).rejects.toThrow(/匹配|格式/);
  });
  it("rejects empty, oversized, malformed and unsupported input with useful errors", async () => {
    await expect(extractAttachment(new File([], "空.txt"))).rejects.toThrow(/空/);
    await expect(extractAttachment(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "大.txt"))).rejects.toThrow(/4\s?MB/);
    await expect(extractAttachment(new File(["hello"], "坏.docx"))).rejects.toThrow(/损坏|格式/);
    await expect(extractAttachment(new File(["hello"], "旧.ppt"))).rejects.toThrow(/PPTX|pptx/);
    await expect(extractAttachment(new File(["hello"], "未知.exe"))).rejects.toThrow(/支持/);
  });
  it("rejects oversized ZIP expansion before unpacking", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "a".repeat(33 * 1024 * 1024));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    await expect(extractAttachment(new File([Buffer.from(bytes)], "压缩.docx"))).rejects.toThrow(/解压|ZIP/);
  });
  it("honors an already cancelled extraction", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(extractAttachment(new File(["正文"], "通知.txt"), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects archives with too many entries and traversing paths", async () => {
    const many = new JSZip();
    for (let index = 0; index < 2001; index++) many.file(`entry${index}`, "x");
    await expect(extractAttachment(new File([await many.generateAsync({type: "arraybuffer"})], "多.docx"))).rejects.toThrow(/ZIP|条目/);
    const traversal = new JSZip(); traversal.file("../secret.xml", "x");
    await expect(extractAttachment(new File([await traversal.generateAsync({type: "arraybuffer"})], "路径.docx"))).rejects.toThrow(/ZIP|安全/);
  });
  it("rejects forged ZIP size fields before unbounded decompression", async () => {
    const zip = new JSZip(); zip.file("word/document.xml", "a".repeat(2 * 1024 * 1024));
    const bytes = Buffer.from(await zip.generateAsync({type: "uint8array", compression: "DEFLATE"}));
    const central = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const local = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    bytes.writeUInt32LE(1, central + 24); bytes.writeUInt32LE(1, local + 22);
    await expect(extractAttachment(new File([new Uint8Array(bytes)], "伪造.docx"))).rejects.toThrow(/解压大小/);
  });
  it("rejects a valid but textless PDF with an explicit scan/OCR explanation", async () => {
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument(); const chunks: Buffer[] = [];
    const bytes = new Promise<Buffer>((resolve) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); }); doc.end();
    await expect(extractAttachment(new File([new Uint8Array(await bytes)], "扫描.pdf"))).rejects.toThrow(/扫描件|文字层/);
  });
  it("validates BMP pixels before returning a correctly typed image URL", async () => {
    const image = bmp.encode({width: 1, height: 1, data: Buffer.from([255, 0, 0, 255])}).data;
    const result = await extractAttachment(new File([new Uint8Array(image)], "图.bmp", {type: "image/bmp"}));
    expect(result.type).toBe("image"); expect(result.dataUrl).toMatch(/^data:image\/bmp;base64,/);
    await expect(extractAttachment(new File(["BM invalid"], "坏.bmp"))).rejects.toThrow(/图片|格式/);
  });
  it.each(["heic", "heif"])("explains the HEIF decoder limitation for %s", async (extension) => {
    await expect(extractAttachment(new File(["heif"], `照片.${extension}`))).rejects.toThrow(/HEIC|HEIF/);
    await expect(extractAttachment(new File(["heif"], `照片.${extension}`))).rejects.toThrow(/PNG|JPEG/);
  });
  it("uses presentation relationship order, including valid absolute package references", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>');
    zip.file("ppt/_rels/presentation.xml.rels", '<Relationships><Relationship Id="first" Type="example/slide" Target="slides/slide1.xml"/><Relationship Id="second" Type="example/slide" Target="/ppt/slides/slide9.xml"/></Relationships>');
    zip.file("ppt/slides/slide1.xml", '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:t>后讲花朵</a:t></a:p></p:sld>');
    zip.file("ppt/slides/slide9.xml", '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:t>先讲小草</a:t></a:p></p:sld>');
    const result = await extractAttachment(new File([await zip.generateAsync({type: "arraybuffer"})], "顺序.pptx"));
    expect(result.text.indexOf("先讲小草")).toBeLessThan(result.text.indexOf("后讲花朵"));
  });
  it("rejects empty worksheets and blank presentation slides instead of extracting only labels", async () => {
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), "空班级");
    const sheet = XLSX.write(workbook, {type: "buffer", bookType: "xlsx"});
    await expect(extractAttachment(new File([sheet], "空.xlsx"))).rejects.toThrow(/文字|空/);
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS(); pptx.addSlide();
    const bytes = await pptx.write({outputType: "uint8array"}) as Uint8Array;
    await expect(extractAttachment(new File([new Uint8Array(bytes)], "空.pptx"))).rejects.toThrow(/文字|空/);
  });
});
