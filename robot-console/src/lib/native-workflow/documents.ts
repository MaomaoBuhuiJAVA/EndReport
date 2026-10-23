import { existsSync } from "node:fs";
import { join } from "node:path";
import { Document, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";
import {isPresentationTopicTitle, PresentationPageCountError, type PresentationRequest} from "./presentation-request";
import { buildLessonPlanDocx } from "@/lib/lesson-plan-docx";
import type { LessonPlanDocumentRequest } from "./lesson-plan-request";

export type DocumentFormat = "docx" | "pdf" | "pptx" | "xlsx";
type Block = { kind: "heading" | "text" | "list" | "break" | "table"; text: string; level?: number; rows?: string[][] };
const mimeTypes = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
function plain(value: string) {
  return value.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, "$1 ($2)").replace(/\[([^\]]+)\]\(([^)]*)\)/g, "$1 ($2)").replace(/\*\*(.*?)\*\*|__(.*?)__/g, "$1$2").replace(/`([^`]+)`/g, "$1");
}
function cells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((cell) => plain(cell.trim().replace(/\\\|/g, "|")));
}
function blocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const result: Block[] = [];
  let code = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) { code = !code; continue; }
    if (!line.trim()) continue;
    if (!code && /\|/.test(line) && lines[index + 1] && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const rows = [cells(line)]; index++;
      while (lines[index + 1]?.trim() && /\|/.test(lines[index + 1])) rows.push(cells(lines[++index]));
      result.push({ kind: "table", text: "", rows }); continue;
    }
    if (!code && /^\s*(?:---+|\*\*\*+|<!--\s*(?:pagebreak|page-break)\s*-->)\s*$/i.test(line)) { result.push({kind: "break", text: ""}); continue; }
    const heading = !code && line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (heading) result.push({ kind: "heading", text: plain(heading[2]), level: heading[1].length });
    else result.push({ kind: !code && /^\s*(?:[-+*]|\d+[.)])\s+/.test(line) ? "list" : "text", text: plain(line) });
  }
  return result;
}
function filename(title: string, format: DocumentFormat) {
  return `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/^\.+|[. ]+$/g, "").slice(0, 100) || "教学文档"}.${format}`;
}
function wrapSlideText(line: string) {
  const chunks: string[] = [];
  let remaining = Array.from(line);
  while (remaining.length > 42) {
    const candidate = remaining.slice(0, 42).join("");
    const boundary = Math.max(...Array.from(candidate).map((char, index) => /[。！？；，、\s]/.test(char) ? index + 1 : 0));
    const count = boundary >= 21 ? boundary : 42;
    chunks.push(remaining.slice(0, count).join("")); remaining = remaining.slice(count);
  }
  chunks.push(remaining.join("")); return chunks;
}
async function word(parsed: Block[]) {
  const children = parsed.map((block) => block.kind === "table"
    ? new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: block.rows!.map((row, i) => new TableRow({ children: row.map((text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({text, bold: i === 0})] })] })) })) })
    : new Paragraph({ text: block.kind === "list" ? block.text.replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "") : block.text, ...(block.kind === "list" ? /^\s*\d/.test(block.text) ? { numbering: { reference: "ordered", level: 0 } } : { bullet: {level: Math.min(8, Math.floor((block.text.match(/^\s*/)?.[0].length ?? 0) / 2))} } : {}), pageBreakBefore: block.kind === "break", heading: block.kind === "heading" ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][block.level! - 1] : undefined, spacing: { after: 140 } }));
  return new Uint8Array(await Packer.toBuffer(new Document({ numbering: { config: [{ reference: "ordered", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", start: 1, style: {paragraph: {indent: {left: 720, hanging: 260}}} }] }] }, styles: { default: { document: { run: { font: "Noto Sans CJK SC", size: 24 } } } }, sections: [{children}] })));
}
async function pdf(parsed: Block[], title: string): Promise<Uint8Array> {
  const font = resolveChinesePdfFont();
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: title, Creator: "科小贝" } });
  const chunks: Buffer[] = [];
  const complete = new Promise<Uint8Array>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); doc.on("error", reject); });
  doc.font(font);
  const wrapCell = (text: string, width: number) => {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = ""; let used = 0;
      for (const char of Array.from(paragraph)) {
        const size = doc.widthOfString(char);
        if (line && used + size > width - 2) { lines.push(line); line = ""; used = 0; }
        line += char; used += size;
      }
      lines.push(line);
    }
    return lines;
  };
  for (const block of parsed) {
    if (block.kind === "break") { doc.addPage(); continue; }
    doc.fontSize(block.kind === "heading" ? Math.max(14, 25 - block.level! * 2) : 11);
    if (block.kind === "table") {
      const rows = block.rows!;
      const columns = Math.max(...rows.map((row) => row.length));
      const width = (doc.page.width - 96) / columns;
      if (width < 24) throw new Error("PDF 表格列数过多，请拆分为较窄的表格。");
      for (const row of rows) {
        const wrapped = Array.from({length: columns}, (_, index) => wrapCell(row[index] ?? "", width - 12));
        const lineHeight = doc.currentLineHeight(true);
        const lines = Math.max(...wrapped.map((cell) => cell.length));
        let start = 0;
        while (start < lines) {
          let available = Math.floor((doc.page.height - 48 - doc.y - 12) / lineHeight);
          if (available < 1) { doc.addPage(); available = Math.floor((doc.page.height - 96 - 12) / lineHeight); }
          const count = Math.min(available, lines - start);
          const height = count * lineHeight + 12;
          const y = doc.y;
          wrapped.forEach((cell, index) => { doc.rect(48 + index * width, y, width, height).stroke("#cbd5e1"); doc.fillColor("#172033").text(cell.slice(start, start + count).join("\n"), 54 + index * width, y + 6, { width: width - 12, height: height - 10 }); });
          doc.x = 48; doc.y = y + height; start += count;
        }
      }
    } else doc.text(block.text, { lineGap: 4 });
    doc.moveDown(0.45);
  }
  doc.end(); return complete;
}

export function resolveChinesePdfFont(moduleSearchPaths = [
  join(process.cwd(), "node_modules"),
  join(process.cwd(), ".next", "standalone", "node_modules"),
]) {
  for (const nodeModules of moduleSearchPaths) {
    const font = join(nodeModules, "@embedpdf", "fonts-sc", "fonts", "NotoSansHans-Regular.otf");
    if (existsSync(font)) return font;
  }
  throw new Error("PDFKit 中文字体资源缺失。");
}
async function presentation(parsed: Block[], title: string, request?: PresentationRequest) {
  const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.title = title; pptx.author = "科小贝";
  let pages: Block[][] = [[]];
  for (const block of parsed) { if (block.kind === "break") pages.push([]); else pages[pages.length - 1].push(block); }
  if (request) {
    pages = pages.filter(page => page.length);
    const first = pages[0];
    if (pages.length === request.slideCount + 1 && first?.length === 1
      && ["heading", "text"].includes(first[0].kind) && isPresentationTopicTitle(first[0].text, request)) {
      pages.shift();
      pages[0].unshift({...first[0], kind: "heading", level: 1});
    }
    if (pages.length !== request.slideCount) throw new PresentationPageCountError(request.slideCount, pages.length);
  }
  let slideCount = 0;
  for (const page of pages) {
    const heading = page.find((block) => block.kind === "heading")?.text ?? title;
    const notes: string[] = [];
    const body: Block[] = [];
    let isNotes = false;
    for (const block of page) {
      if (/^(?:备注|讲者备注|演讲者备注|讲稿|notes)\s*[:：]?/i.test(block.text)) { isNotes = true; notes.push(block.text); continue; }
      if (isNotes) { notes.push(block.text); continue; }
      if (block !== page.find((item) => item.kind === "heading")) body.push(block);
    }
    let slide: ReturnType<typeof pptx.addSlide>;
    let y = 1.6; let index = 0;
    const nextSlide = () => {
      slide = pptx.addSlide(); slideCount++; slide.background = { color: "FFFFFF" }; y = 1.6;
      slide.addText(index ? `${heading}（续 ${index + 1}）` : heading, { x: 0.7, y: 0.45, w: 11.9, h: 0.8, fontFace: "Noto Sans CJK SC", fontSize: 28, bold: true, color: "16324F", breakLine: false });
      if (notes.length) slide.addNotes(notes.join("\n"));
      index++;
    };
    nextSlide();
    for (const block of body) {
      if (block.kind === "table") {
        const columns = Math.max(...block.rows!.map((row) => row.length));
        const chars = Math.max(2, Math.floor(42 / columns));
        for (const [rowIndex, row] of block.rows!.entries()) {
          const wrapped = Array.from({length: columns}, (_, col) => {
            const text = Array.from(row[col] ?? "");
            return Array.from({length: Math.max(1, Math.ceil(text.length / chars))}, (_, i) => text.slice(i * chars, (i + 1) * chars).join(""));
          });
          const lines = Math.max(...wrapped.map((cell) => cell.length));
          for (let start = 0; start < lines; start += 6) {
            const height = Math.min(6, lines - start) * 0.38 + 0.14;
            if (y + height > 6.9) nextSlide();
            slide!.addTable([wrapped.map((cell) => ({text: cell.slice(start, start + 6).join("\n"), options: {bold: rowIndex === 0, fill: {color: rowIndex === 0 ? "E8F0F8" : "FFFFFF"}}}))], { x: 0.7, y, w: 11.9, h: height, rowH: height, colW: Array(columns).fill(11.9 / columns), fontFace: "Noto Sans CJK SC", fontSize: 18, color: "172033", margin: 0.06, border: {type: "solid", color: "CBD5E1", pt: 0.5}, autoPage: false });
            y += height;
          }
        }
        y += 0.12;
      } else {
        for (const line of wrapSlideText(block.text)) {
          if (y + 0.44 > 6.9) nextSlide();
          slide!.addText(line, { x: 0.7, y, w: 11.9, h: 0.42, fontFace: "Noto Sans CJK SC", fontSize: 21, bold: block.kind === "heading", color: "172033", valign: "top", margin: 0, breakLine: false }); y += 0.44;
        }
      }
    }
  }
  if (request && slideCount !== request.slideCount) throw new PresentationPageCountError(request.slideCount, slideCount);
  return new Uint8Array(await pptx.write({ outputType: "uint8array" }) as Uint8Array);
}
export async function createTeachingDocument(markdown: string, format: DocumentFormat, title: string, request?: PresentationRequest, lessonPlan?: LessonPlanDocumentRequest): Promise<{bytes: Uint8Array; name: string; mimeType: string}> {
  if (!markdown.trim()) throw new Error("文档内容为空，请先生成内容。");
  if (markdown.length > 500000) throw new Error("文档内容过长，请拆分后生成。");
  if (!Object.prototype.hasOwnProperty.call(mimeTypes, format)) throw new Error("不支持的文档格式。");
  const parsed = blocks(markdown);
  let bytes: Uint8Array;
  if (format === "docx") bytes = lessonPlan
    ? await buildLessonPlanDocx(lessonPlan.title, lessonPlan.ageGroup, lessonPlan.duration, markdown)
    : await word(parsed);
  else if (format === "pdf") bytes = await pdf(parsed, title);
  else if (format === "pptx") bytes = await presentation(parsed, title, request);
  else {
    const tables = parsed.filter((block) => block.kind === "table");
    if (!tables.length) throw new Error("内容中没有 Markdown 表格，无法生成电子表格。");
    const book = XLSX.utils.book_new();
    tables.forEach((table, i) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(table.rows!), `表格${i + 1}`));
    bytes = new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  }
  return { bytes, name: filename(title, format), mimeType: mimeTypes[format] };
}
