import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import sharp from "sharp";
import bmp from "bmp-js";
import * as XLSX from "xlsx";
import { dirname, join, posix } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

export type ExtractedAttachment = { name: string; type: "image" | "document"; text: string; dataUrl?: string };
const LIMIT = 50000;
const NOTICE = "\n[提取内容已截断：仅展示前 50000 字符，请拆分文件以获取完整内容。]";
function check(signal?: AbortSignal) { signal?.throwIfAborted(); }
async function cancellable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  check(signal);
  if (!signal) return promise;
  let onAbort: () => void;
  const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason ?? new DOMException("已取消", "AbortError")); signal.addEventListener("abort", onAbort, { once: true }); });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort!); }
}
function cap(text: string) { return text.length > LIMIT ? text.slice(0, LIMIT - NOTICE.length) + NOTICE : text; }

/** Inspect central-directory sizes before any decompression, including every unused entry. */
function validateZip(bytes: Buffer, signal?: AbortSignal) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw new Error("ZIP 文件损坏或格式不正确。");
  const count = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  const centralStart = offset;
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count !== bytes.readUInt16LE(end + 8) || count > 2000 || offset + centralSize !== end) throw new Error("ZIP 分卷、ZIP64 或条目数量超出限制。");
  let expanded = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    check(signal);
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP 目录格式损坏。");
    const compressed = bytes.readUInt32LE(offset + 20);
    const uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const next = offset + 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    expanded += uncompressed;
    if (next > end || !name || name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || names.has(name) || bytes.readUInt16LE(offset + 8) & 1) throw new Error("ZIP 条目格式不安全或已加密。");
    if (expanded > 32 * 1024 * 1024 || uncompressed > 16 * 1024 * 1024 || (uncompressed > 1024 * 1024 && uncompressed > Math.max(1, compressed) * 300)) throw new Error("ZIP 解压大小超出安全限制，请拆分文件。");
    const local = bytes.readUInt32LE(offset + 42);
    if (local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error("ZIP 本地条目格式损坏。");
    const localNameLength = bytes.readUInt16LE(local + 26);
    const dataStart = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    const method = bytes.readUInt16LE(offset + 10);
    if (dataStart + compressed > centralStart || bytes.toString("utf8", local + 30, local + 30 + localNameLength) !== name || method !== bytes.readUInt16LE(local + 8) || ![0, 8].includes(method)) throw new Error("ZIP 本地条目格式损坏或压缩方式不受支持。");
    // Central-directory sizes are attacker controlled. Bound actual inflation too.
    try {
      const actual = method === 0 ? bytes.subarray(dataStart, dataStart + compressed) : inflateRawSync(bytes.subarray(dataStart, dataStart + compressed), { maxOutputLength: Math.max(1, uncompressed) });
      if (actual.length !== uncompressed) throw new Error("Incorrect ZIP expansion size");
    } catch { throw new Error("ZIP 解压大小不匹配或超出安全限制。"); }
    names.add(name); offset = next;
  }
  if (offset !== end) throw new Error("ZIP 目录格式损坏。");
}
async function archive(bytes: Buffer, signal?: AbortSignal) {
  validateZip(bytes, signal);
  return cancellable(JSZip.loadAsync(bytes, { checkCRC32: true }), signal);
}
function xml(value: string): Record<string, unknown> {
  if (/<!DOCTYPE|<!ENTITY/i.test(value) || XMLValidator.validate(value) !== true) throw new Error("文档 XML 格式损坏。");
  return new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false }).parse(value);
}
function textFromXml(value: string, notes = false) {
  xml(value);
  if (notes) value = value.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shape) => /<p:ph\b[^>]*\btype=["'](?:sldNum|dt|hdr|ftr)["']/.test(shape) ? "" : shape);
  // Paragraph/row boundaries remain readable; XML entities are decoded by the parser.
  const text = value.replace(/<\/(?:\w+:)?(?:p|tr)>/g, "\n").replace(/<(?:\w+:)?(?:tab|br)\b[^>]*\/?\s*>/g, "\t").replace(/<[^>]+>/g, "");
  return String(new XMLParser({ parseTagValue: false, trimValues: false }).parse(`<text>${text}</text>`).text ?? "");
}
async function unzipText(zip: JSZip, name: string, signal?: AbortSignal) {
  const entry = zip.file(name);
  if (!entry) throw new Error("文档必要内容缺失或格式损坏。");
  return cancellable(entry.async("string"), signal);
}
function values(value: unknown): Record<string, unknown>[] { return (Array.isArray(value) ? value : value ? [value] : []) as Record<string, unknown>[]; }
function packagePath(base: string, target: unknown) {
  if (typeof target !== "string" || /[:\\\u0000]/.test(target)) throw new Error("文档引用格式错误。");
  return posix.normalize(target.startsWith("/") ? target.slice(1) : posix.join(base, target));
}
async function presentation(bytes: Buffer, signal?: AbortSignal) {
  const zip = await archive(bytes, signal);
  const deck = xml(await unzipText(zip, "ppt/presentation.xml", signal));
  const relationships = xml(await unzipText(zip, "ppt/_rels/presentation.xml.rels", signal));
  const rels = values((relationships.Relationships as Record<string, unknown>)?.Relationship);
  const root = deck["p:presentation"] as Record<string, unknown>;
  const slides = values((root?.["p:sldIdLst"] as Record<string, unknown>)?.["p:sldId"]);
  let text = "";
  let hasContent = false;
  for (const [index, slide] of slides.entries()) {
    check(signal);
    const relationship = rels.find((rel) => rel["@_Id"] === slide["@_r:id"] && String(rel["@_Type"]).endsWith("/slide") && rel["@_TargetMode"] !== "External");
    if (!relationship) throw new Error("演示文稿幻灯片引用损坏。");
    const path = packagePath("ppt", relationship["@_Target"]);
    if (!path.startsWith("ppt/slides/")) throw new Error("演示文稿幻灯片引用格式错误。");
    const slideText = textFromXml(await unzipText(zip, path, signal));
    hasContent ||= !!slideText.trim();
    text += `\n第 ${index + 1} 页\n${slideText}`;
    const relPath = posix.join(posix.dirname(path), "_rels", `${posix.basename(path)}.rels`);
    if (zip.file(relPath)) {
      const slideRels = xml(await unzipText(zip, relPath, signal));
      const noteRel = values((slideRels.Relationships as Record<string, unknown>)?.Relationship).find((rel) => String(rel["@_Type"]).endsWith("/notesSlide") && rel["@_TargetMode"] !== "External");
      if (noteRel) {
        const notePath = packagePath(posix.dirname(path), noteRel["@_Target"]);
        if (!notePath.startsWith("ppt/notesSlides/")) throw new Error("演示文稿备注引用格式错误。");
        const noteText = textFromXml(await unzipText(zip, notePath, signal), true);
        hasContent ||= !!noteText.trim();
        text += `\n备注：\n${noteText}`;
      }
    }
    if (text.length > LIMIT) break;
  }
  return hasContent ? text : "";
}
async function pdf(bytes: Buffer, signal?: AbortSignal) {
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("PDF 格式损坏。");
  // A bound native resolver prevents bundlers replacing the path with a module ID.
  const resolvePackage = createRequire(import.meta.url).resolve.bind(null);
  // PDF.js is ESM. Import the installed module URL natively, rather than letting
  // the server bundler turn an externalized ESM package into CommonJS require().
  const modulePath = join(dirname(resolvePackage("pdfjs-dist/package.json")), "legacy", "build", "pdf.mjs");
  const { getDocument } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(modulePath).href) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const assets = join(dirname(modulePath), "..", "..");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, stopAtErrors: true, cMapUrl: assets.replace(/\\/g, "/") + "/cmaps/", cMapPacked: true, standardFontDataUrl: assets.replace(/\\/g, "/") + "/standard_fonts/", useWorkerFetch: false });
  const cancel = () => { void task.destroy(); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const document = await cancellable(task.promise, signal);
    let text = "";
    for (let page = 1; page <= document.numPages; page++) {
      check(signal);
      const content = await cancellable((await document.getPage(page)).getTextContent(), signal);
      text += content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") + "\n";
      if (text.length > LIMIT) break;
    }
    return text;
  } finally { signal?.removeEventListener("abort", cancel); await task.destroy(); }
}
async function spreadsheet(bytes: Buffer, extension: string, signal?: AbortSignal) {
  if (extension === "xlsx") await archive(bytes, signal);
  else if (!bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))) throw new Error("XLS 格式损坏。");
  check(signal);
  const workbook = XLSX.read(bytes, { type: "buffer", sheetRows: 20000, cellFormula: false, cellHTML: false, bookVBA: false });
  let text = "";
  for (const name of workbook.SheetNames) {
    check(signal);
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    if (range.e.c > 1000 || range.e.r > 20000) throw new Error("电子表格行列过多，请拆分后上传。");
    const hasValues = Object.entries(sheet).some(([key, cell]) => !key.startsWith("!") && cell?.v !== undefined && String(cell.v).trim() !== "");
    if (!hasValues) continue;
    text += `\n${name}\n${XLSX.utils.sheet_to_csv(sheet, { blankrows: false })}`;
    if (sheet["!fullref"] && sheet["!fullref"] !== sheet["!ref"]) text += "\n[电子表格行数过多，内容已截断，请拆分文件。]";
    if (text.length > LIMIT) break;
  }
  return text;
}
export async function extractAttachment(file: File, signal?: AbortSignal, options: {maxBytes?: number} = {}): Promise<ExtractedAttachment> {
  check(signal);
  if (!file.size) throw new Error("附件为空，请重新选择文件。");
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`附件大小不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB。`);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "ppt") throw new Error("暂不支持旧版 PPT，请另存为 PPTX 后上传。");
  if (extension === "heic" || extension === "heif") throw new Error("当前服务器未包含 HEIC/HEIF 解码器，请转换为 PNG 或 JPEG 后上传。");
  const images: Record<string, string> = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", gif: "gif", avif: "avif", bmp: "bmp" };
  if (!(extension in images) && !["txt", "docx", "pdf", "pptx", "xlsx", "doc", "xls"].includes(extension)) throw new Error("不支持此附件格式，请使用 TXT、DOC(X)、PDF、PPTX、XLS(X) 或常用图片。");
  const bytes = Buffer.from(await cancellable(file.arrayBuffer(), signal));
  try {
    if (extension in images) {
      if (extension === "bmp") {
        if (bytes.length < 54 || bytes.toString("ascii", 0, 2) !== "BM" || bytes.readUInt32LE(14) !== 40 || bytes.readUInt16LE(26) !== 1 || bytes.readUInt32LE(30) !== 0) throw new Error("BMP 图片格式损坏或压缩方式不受支持，请转换为 PNG。");
        const width = bytes.readInt32LE(18), height = Math.abs(bytes.readInt32LE(22)), depth = bytes.readUInt16LE(28), offset = bytes.readUInt32LE(10);
        if (width < 1 || height < 1 || width * height > 20_000_000 || ![1, 4, 8, 16, 24, 32].includes(depth) || offset < 54 || offset + Math.ceil(width * depth / 32) * 4 * height > bytes.length || (file.type && !["image/bmp", "image/x-ms-bmp", "application/octet-stream"].includes(file.type.toLowerCase()))) throw new Error("BMP 图片内容与格式不匹配或像素过大。");
        bmp.decode(bytes); check(signal);
        return {name: file.name, type: "image", text: "", dataUrl: `data:image/bmp;base64,${bytes.toString("base64")}`};
      }
      const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "error" });
      const metadata = await cancellable(image.metadata(), signal);
      const mime = `image/${metadata.format}`;
      if (metadata.format !== images[extension] || (file.type && file.type !== "application/octet-stream" && file.type.toLowerCase() !== mime)) throw new Error("图片内容与扩展名或 MIME 类型不匹配。");
      await cancellable(image.raw().toBuffer(), signal);
      return { name: file.name, type: "image", text: "", dataUrl: `data:${mime};base64,${bytes.toString("base64")}` };
    }
    let text: string;
    if (extension === "txt") {
      // UTF-8 and BOM-tagged UTF-16 are accepted; invalid binary is never called text.
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
      text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) throw new Error("TXT 包含二进制内容，请使用 UTF-8 文本。");
    } else if (extension === "docx") {
      const zip = await archive(bytes, signal);
      xml(await unzipText(zip, "word/document.xml", signal));
      text = (await cancellable(mammoth.extractRawText({ buffer: bytes }), signal)).value;
    } else if (extension === "pdf") text = await pdf(bytes, signal);
    else if (extension === "pptx") text = await presentation(bytes, signal);
    else if (extension === "xlsx" || extension === "xls") text = await spreadsheet(bytes, extension, signal);
    else {
      if (!bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))) throw new Error("DOC 格式损坏。");
      text = (await cancellable(new WordExtractor().extract(bytes), signal)).getBody();
    }
    check(signal);
    if (!text.trim()) throw new Error("附件没有可提取的文字；扫描件 PDF 请改为上传图片或带文字层的 PDF。");
    return { name: file.name, type: "document", text: cap(text.trim()) };
  } catch (error) {
    check(signal);
    if (error instanceof Error && /ZIP|格式|空|文字|截断|解压|过多|UTF-8|匹配|损坏/.test(error.message)) throw error;
    throw new Error(extension in images ? "图片格式损坏或不受支持，请重新上传。" : "附件格式损坏、受密码保护或无法读取，请检查后重新上传。");
  }
}
