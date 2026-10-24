import {describe, expect, it} from "vitest";
import {clearChatHistory, readChatHistory, writeChatHistory, type StoredChatMessage} from "./chat-history";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("chat history persistence", () => {
  it("restores completed messages and excludes transient chat state", () => {
    const storage = createStorage();
    const messages = [
      {id: 1, role: "assistant", text: "欢迎"},
      {id: 2, role: "user", text: "看这张图", userAttachment: {name: "leaf.png", kind: "image", previewUrl: "blob:temporary"}},
      {id: 3, role: "assistant", text: "正在生成", pending: true, statusText: "处理中"},
    ] as StoredChatMessage[];

    writeChatHistory(messages, "science-pet", storage);

    expect(readChatHistory("science-pet", storage)).toEqual([
      {id: 1, role: "assistant", text: "欢迎"},
      {id: 2, role: "user", text: "看这张图", userAttachment: {name: "leaf.png", kind: "image"}},
    ]);
  });

  it("returns an empty history for malformed data and tolerates unavailable storage", () => {
    const storage = createStorage();
    storage.setItem("science-pet", "not-json");
    expect(readChatHistory("science-pet", storage)).toEqual([]);

    expect(readChatHistory("science-pet", {
      getItem: () => {throw new Error("storage blocked");},
      setItem: () => {throw new Error("storage blocked");},
      removeItem: () => {throw new Error("storage blocked");},
    })).toEqual([]);
    expect(() => writeChatHistory([], "science-pet", {
      getItem: () => null,
      setItem: () => {throw new Error("storage full");},
      removeItem: () => undefined,
    })).not.toThrow();
  });

  it("clears the saved chat history without throwing when storage is unavailable", () => {
    const storage = createStorage();
    writeChatHistory([{id: 1, role: "assistant", text: "你好"}], "science-pet", storage);
    expect(readChatHistory("science-pet", storage)).toHaveLength(1);

    clearChatHistory("science-pet", storage);
    expect(readChatHistory("science-pet", storage)).toEqual([]);
  });
});
