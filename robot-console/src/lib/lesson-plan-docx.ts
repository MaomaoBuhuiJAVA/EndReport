import JSZip from "jszip";

type LessonSections = {
  goals: string[];
  preparation: string[];
  activity: string[];
  reflection: string[];
  keyPoints: string[];
  field: string;
  source: string;
  notes: string[];
  fallback: string[];
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CONTENT_TYPE_NS = "http://schemas.openxmlformats.org/package/2006/content-types";

// Matches the eight-column geometry in the provided kindergarten lesson-plan template.
const COLUMN_WIDTHS = [1332, 1647, 847, 1101, 1011, 1281, 854, 1467];

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function cleanMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[`*_~]/gu, "")
    .replace(/\s+$/u, "")
    .trim();
}

function canonicalSection(value: string) {
  const label = cleanMarkdown(value)
    .replace(/^#{1,6}\s*/u, "")
    .replace(/^[一二三四五六七八九十\d]+\s*[、.．]\s*/u, "")
    .replace(/[：:]\s*$/u, "")
    .replace(/\s+/gu, "");
  if (/^(活动目标|教学目标|目标|活动目的)$/u.test(label)) return "goals" as const;
  if (/^(活动准备|准备|材料准备|材料)$/u.test(label)) return "preparation" as const;
  if (/^(活动内容|活动过程|教学过程|活动流程|过程|核心过程)$/u.test(label)) return "activity" as const;
  if (/^(活动反思|教学反思|反思)$/u.test(label)) return "reflection" as const;
  if (/^(重点难点|重点和难点|重点|难点)$/u.test(label)) return "keyPoints" as const;
  if (/^领域$/u.test(label)) return "field" as const;
  if (/^来源$/u.test(label)) return "source" as const;
  if (/^(备注|活动提示|延伸与安全提示|安全提示)$/u.test(label)) return "notes" as const;
  return null;
}

function createSections(): LessonSections {
  return {
    goals: [],
    preparation: [],
    activity: [],
    reflection: [],
    keyPoints: [],
    field: "",
    source: "",
    notes: [],
    fallback: [],
  };
}

function appendSection(sections: LessonSections, section: keyof LessonSections | "fallback", value: string) {
  const cleaned = cleanMarkdown(value);
  if (!cleaned) return;
  if (section === "field" || section === "source") {
    sections[section] = cleaned;
    return;
  }
  const values = sections[section];
  if (Array.isArray(values)) values.push(cleaned);
}

function markdownTableCells(value: string) {
  const line = value.trim();
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  const cells = line.slice(1, -1).split("|").map((cell) => cleanMarkdown(cell));
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell)) ? [] : cells;
}

function parseLessonMarkdown(markdown: string): LessonSections {
  const sections = createSections();
  let current: keyof LessonSections | "fallback" = "fallback";
  let pendingTableSections: Array<ReturnType<typeof canonicalSection>> | null = null;

  for (const sourceLine of markdown.replace(/\r\n?/gu, "\n").split("\n")) {
    const tableCells = markdownTableCells(sourceLine);
    if (tableCells !== null) {
      if (!tableCells.length) continue;

      const tableSections = tableCells.map((cell) => canonicalSection(cell));
      const directSection = tableSections[0];
      if (tableCells.length === 2 && directSection && !tableSections[1]) {
        appendSection(sections, directSection, tableCells[1] ?? "");
        pendingTableSections = null;
        continue;
      }

      if (tableSections.some(Boolean)) {
        pendingTableSections = tableSections;
        continue;
      }

      if (pendingTableSections) {
        for (let index = 0; index < pendingTableSections.length; index += 1) {
          const section = pendingTableSections[index];
          if (section) appendSection(sections, section, tableCells[index] ?? "");
        }
        pendingTableSections = null;
      }
      continue;
    }

    pendingTableSections = null;
    const line = sourceLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^#{1,6}\s*(.+?)\s*#*$/u);
    const labelMatch = line.match(/^(?:#{1,6}\s*)?([^：:]{1,12})\s*[：:]\s*(.*)$/u);
    const heading = headingMatch?.[1] ?? null;
    const label = heading ? canonicalSection(heading) : labelMatch ? canonicalSection(labelMatch[1]) : null;

    if (label) {
      current = label;
      const inlineValue = heading ? "" : labelMatch?.[2] ?? "";
      appendSection(sections, current, inlineValue);
      continue;
    }

    appendSection(sections, current, line);
  }

  return sections;
}

function paragraphXml(
  value: string,
  options: { align?: "left" | "center"; bold?: boolean; size?: number; font?: "黑体" | "宋体" } = {},
) {
  const align = options.align ?? "left";
  const bold = options.bold ? "<w:b/><w:bCs/>" : "";
  const size = options.size ?? 22;
  const font = options.font ?? (options.bold ? "黑体" : "宋体");
  const text = escapeXml(value);
  const textNode = value.startsWith(" ") || value.endsWith(" ") ? `<w:t xml:space="preserve">${text}</w:t>` : `<w:t>${text}</w:t>`;
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold}</w:rPr>${textNode}</w:r></w:p>`;
}

function valueParagraphs(
  values: string[],
  options: { align?: "left" | "center"; bold?: boolean; size?: number; font?: "黑体" | "宋体" } = {},
) {
  if (!values.length) return paragraphXml("", options);
  return values.map((value) => paragraphXml(value, options)).join("");
}

function cellXml(
  values: string | string[],
  width: number,
  options: { label?: boolean; gridSpan?: number; align?: "left" | "center"; verticalAlign?: "center" | "top" } = {},
) {
  const valueList = Array.isArray(values) ? values : [values];
  const gridSpan = options.gridSpan && options.gridSpan > 1 ? `<w:gridSpan w:val="${options.gridSpan}"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan}<w:vAlign w:val="${options.verticalAlign ?? "center"}"/></w:tcPr>${valueParagraphs(valueList, { align: options.align ?? (options.label ? "center" : "left"), bold: options.label, size: 24, font: "宋体" })}</w:tc>`;
}

function tableRowXml(cells: string[]) {
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join("")}</w:tr>`;
}

function buildTableXml(title: string, ageGroup: string, duration: string, sections: LessonSections) {
  const [c1, c2, c3, c4, c5, c6, c7, c8] = COLUMN_WIDTHS;
  const tableGrid = COLUMN_WIDTHS.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const rows = [
    tableRowXml([
      cellXml("主题", c1, { label: true }),
      cellXml(title, c2, { align: "center" }),
      cellXml("领域", c3, { label: true }),
      cellXml(sections.field || "科学", c4, { align: "center" }),
      cellXml("班级", c5, { label: true }),
      cellXml(ageGroup, c6, { align: "center" }),
      cellXml("来源", c7, { label: true }),
      cellXml(sections.source || "科小贝智能体", c8, { align: "center" }),
    ]),
    tableRowXml([
      cellXml("教学活动", c1, { label: true }),
      cellXml(title, c2, { align: "center" }),
      cellXml("时间", c3, { label: true }),
      cellXml(duration, c4, { align: "center" }),
      cellXml("教师", c5, { label: true }),
      cellXml("", c6 + c7 + c8, { gridSpan: 3, align: "center" }),
    ]),
    tableRowXml([
      cellXml("活动目标", c1, { label: true }),
      cellXml(sections.goals, c2 + c3 + c4, { gridSpan: 3, verticalAlign: "top" }),
      cellXml("重点难点", c5, { label: true }),
      cellXml(sections.keyPoints, c6 + c7 + c8, { gridSpan: 3, verticalAlign: "top" }),
    ]),
    tableRowXml([
      cellXml("活动准备", c1, { label: true }),
      cellXml(sections.preparation, c2 + c3 + c4 + c5 + c6 + c7 + c8, { gridSpan: 7, verticalAlign: "top" }),
    ]),
    tableRowXml([
      cellXml("活动内容", c1, { label: true, verticalAlign: "top" }),
      cellXml(sections.activity.length ? sections.activity : sections.fallback, c2 + c3 + c4 + c5 + c6, { gridSpan: 5, verticalAlign: "top" }),
      cellXml(["备注:", ...sections.notes], c7 + c8, { gridSpan: 2, verticalAlign: "top", align: "left" }),
    ]),
    tableRowXml([
      cellXml("活动反思", c1, { label: true, verticalAlign: "top" }),
      cellXml(sections.reflection, c2 + c3 + c4 + c5 + c6 + c7 + c8, { gridSpan: 7, verticalAlign: "top" }),
    ]),
  ].join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid>${tableGrid}</w:tblGrid>${rows}</w:tbl>`;
}

function buildDocumentXml(title: string, ageGroup: string, duration: string, markdown: string) {
  const sections = parseLessonMarkdown(markdown);
  const heading = paragraphXml("温州市龙湾区国科温州第二幼儿园教育教学活动设计表", { align: "center", bold: true, size: 32, font: "黑体" });
  const table = buildTableXml(title, ageGroup, duration, sections);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NS}" xmlns:r="${OFFICE_REL_NS}"><w:body>${heading}${table}<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/><w:cols w:space="425" w:num="1"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${WORD_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:style></w:styles>`;
}

function settingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${WORD_NS}"><w:zoom w:percent="100"/><w:compat/><w:doNotTrackFormatting/><w:defaultTabStop w:val="720"/></w:settings>`;
}

function themeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="16A34A"/></a:accent2><a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="DC2626"/></a:accent4><a:accent5><a:srgbClr val="7C3AED"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CONTENT_TYPE_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function documentRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`;
}

function corePropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>幼儿园科学教育教学活动设计</dc:title><dc:creator>科小贝</dc:creator><cp:lastModifiedBy>科小贝</cp:lastModifiedBy></cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>科小贝智能体</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs/><TitlesOfParts/></Properties>`;
}

/** Builds a browser-safe OOXML package matching the kindergarten lesson template. */
export async function buildLessonPlanDocx(
  title: string,
  ageGroup: string,
  duration: string,
  markdown: string,
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml());
  zip.file("_rels/.rels", rootRelationshipsXml());
  zip.file("word/document.xml", buildDocumentXml(title.trim(), ageGroup.trim(), duration.trim(), markdown));
  zip.file("word/_rels/document.xml.rels", documentRelationshipsXml());
  zip.file("word/styles.xml", stylesXml());
  zip.file("word/settings.xml", settingsXml());
  zip.file("word/theme/theme1.xml", themeXml());
  zip.file("docProps/core.xml", corePropertiesXml());
  zip.file("docProps/app.xml", appPropertiesXml());
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
