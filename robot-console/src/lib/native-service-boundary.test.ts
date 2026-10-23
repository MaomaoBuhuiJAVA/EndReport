import { expect, it } from "vitest";
import { normalizeAiChatOutputFiles } from "./ai-chat-files";
import { parseAgentResult } from "./agent-result";
import { buildAiChatDocumentDownloadUrl } from "./ai-chat-download";

it.each(["https://upload.dify.ai/files/cover.png", "https://app.udify.app/files/cover.png"])("rejects a removed-service output URL: %s", url => {
  expect(normalizeAiChatOutputFiles([{type: "image", name: "cover.png", url}], {sameOrigin: "https://school.example"})).toEqual([]);
  const result = parseAgentResult({text: `\`\`\`agent-result\n${JSON.stringify({kind: "poetry_cover", cover_url: url, title: "风的旅行", aspect_ratio: "1:1"})}\n\`\`\``, sameOrigin: "https://school.example"});
  expect(result?.kind).toBe("degraded");
});

it("does not offer a removed workflow download token as a native file", () => {
  expect(buildAiChatDocumentDownloadUrl({type: "document", name: "教案.docx", url: "/api/ai-chat/download?token=payload.signature"})).toBeNull();
});
