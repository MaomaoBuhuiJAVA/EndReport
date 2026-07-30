import WordExtractor from "word-extractor";

function cleanText(text) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extracts readable text from legacy OLE Word and WPS documents. */
export async function extractWordCompatibleText(filePath) {
  try {
    const document = await new WordExtractor().extract(filePath);
    const text = cleanText(document.getBody());
    return text.length > 80 ? text.slice(0, 30000) : "";
  } catch {
    return "";
  }
}
