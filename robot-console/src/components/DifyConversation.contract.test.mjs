import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const component of ["SciencePet.tsx", "FloatingChat.tsx"]) {
  test(`${component} 将 Dify 会话标识随请求传递`, () => {
    const source = readFileSync(fileURLToPath(new URL(`./${component}`, import.meta.url)), "utf8");

    assert.match(source, /userId/);
    assert.match(source, /conversationId/);
    assert.match(source, /text\/event-stream/);
    assert.match(source, /readAiChatResponse/);
  });
}
