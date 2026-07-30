export const reportFile = "国科第二幼儿园省二级评估自评报告.wps";
export const reportTitle = "国科第二幼儿园省二级评估自评报告";
export const legacyReportTitles = ["省二终极"];

export function chunkReportText(content) {
  const chunks = [];
  const size = 850;
  const overlap = 120;

  for (let index = 0; index < content.length; index += size - overlap) {
    const contentSlice = content.slice(index, index + size).trim();
    if (contentSlice.length > 20) {
      chunks.push({
        title: `${reportTitle} ${chunks.length + 1}`,
        content: contentSlice,
        keywords: reportTitle,
      });
    }
  }

  return chunks;
}
