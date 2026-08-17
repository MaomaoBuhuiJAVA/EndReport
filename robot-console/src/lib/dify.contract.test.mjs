import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const adapterPath = fileURLToPath(new URL("./dify.ts", import.meta.url));

test("Dify 适配器同时支持 blocking 和 streaming chat-messages 协议", () => {
  assert.equal(existsSync(adapterPath), true, "应提供 Dify 服务端适配器");

  const source = readFileSync(adapterPath, "utf8");
  assert.match(source, /chat-messages/);
  assert.match(source, /response_mode:\s*(?:["']blocking["']|responseMode)/);
  assert.match(source, /response_mode:\s*(?:["']streaming["']|responseMode)/);
  assert.match(source, /openDifyStream/);
  assert.match(source, /conversation_id/);
  assert.match(source, /Authorization:\s*`Bearer \$\{apiKey\}`/);
});
