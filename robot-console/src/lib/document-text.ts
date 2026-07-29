const displaySuffix = String.raw`(?:\(\s*(?:\d+|定稿)\s*\)|（\s*(?:\d+|定稿)\s*）)`;

const terminalSuffixPattern = new RegExp(`(?:\\s*${displaySuffix})+\\s*$`, "u");
const quotedSuffixPattern = new RegExp(`(?:\\s*${displaySuffix})+(?=\\s*》)`, "gu");

/** Removes duplicate/version markers appended to imported document names. */
export function cleanDocumentTitle(value: string): string {
  return value.replace(terminalSuffixPattern, "").trim();
}

export function cleanDocumentText(value: string): string {
  return value
    .replace(quotedSuffixPattern, "")
    .split("\n")
    .map((line) => line.replace(terminalSuffixPattern, "").trimEnd())
    .join("\n");
}
