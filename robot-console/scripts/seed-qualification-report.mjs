import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chunkReportText, legacyReportTitles, reportFile, reportTitle } from "./qualification-report-migration.mjs";
import { extractWordCompatibleText } from "./wps-document-text.mjs";

const prisma = new PrismaClient();

try {
  const reportPath = path.resolve("ziliao", reportFile);
  if (!fs.existsSync(reportPath)) throw new Error(`Missing provincial report: ${reportFile}`);

  const content = await extractWordCompatibleText(reportPath);
  if (content.length <= 80) throw new Error("Provincial report text extraction returned insufficient content");

  const summary = content.slice(0, 420);
  const existingDocument = await prisma.knowledgeDocument.findFirst({ where: { sourcePath: reportFile } });
  const document = existingDocument
    ? await prisma.knowledgeDocument.update({
        where: { id: existingDocument.id },
        data: { title: reportTitle, category: "QUALIFICATION", summary, content, fileType: "wps" },
      })
    : await prisma.knowledgeDocument.create({
        data: { title: reportTitle, category: "QUALIFICATION", summary, content, fileType: "wps", sourcePath: reportFile },
      });

  await prisma.knowledgeChunk.deleteMany({ where: { documentId: document.id } });
  await prisma.knowledgeChunk.createMany({
    data: chunkReportText(content).map((chunk) => ({ ...chunk, documentId: document.id })),
  });

  const removedLegacyDocuments = await prisma.knowledgeDocument.deleteMany({
    where: { title: { in: legacyReportTitles } },
  });

  console.log(
    `Provincial report imported: ${document.id} (${content.length} characters); removed ${removedLegacyDocuments.count} legacy report(s)`,
  );
} finally {
  await prisma.$disconnect();
}
