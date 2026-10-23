import { describe, expect, it } from "vitest";
import { extractRemoteDocument, requestedDocumentUrl, type RemoteDocumentOptions } from "./remote-documents";
import { createTeachingDocument } from "./documents";

const publicAddress = {address: "93.184.215.14", family: 4};
const network = (body: string, type = "text/html"): RemoteDocumentOptions => ({
  resolve: async () => [publicAddress],
  request: async () => ({status: 200, headers: new Headers({"content-type": type}), bytes: Buffer.from(body)}),
});

describe("remote teaching documents", () => {
  it("recognizes explicit document links while leaving unrelated video requests alone", () => {
    expect(requestedDocumentUrl("请提取 https://example.com/ 的正文，并用三句中文概括。")).toBe("https://example.com/");
    expect(requestedDocumentUrl("请诊断活动记录", "https://example.com/record.docx")).toBe("https://example.com/record.docx");
    expect(requestedDocumentUrl("这个实验视频 https://example.com/video.mp4 在哪里")).toBeUndefined();
    expect(requestedDocumentUrl("请提取 https://example.com/，并用三句中文概括正文。")).toBe("https://example.com/");
  });
  it("preserves the page title when its heading is outside the main body", async () => {
    const result = await extractRemoteDocument("https://example.com/record", undefined, network("<title>Example Domain</title><body><header>Example Domain</header><main>真实正文。</main></body>"));
    expect(result.text).toContain("Example Domain");
    expect(result.text).toContain("真实正文。");
  });

  it("accepts public hosting addresses in 192.0 while rejecting reserved ranges", async () => {
    const result = await extractRemoteDocument("https://example.com/record", undefined, {
      ...network("真实正文。", "text/plain"), resolve: async () => [{address: "192.0.78.17", family: 4}],
    });
    expect(result.text).toBe("真实正文。");
    await expect(extractRemoteDocument("http://192.0.2.1/record", undefined, network("text"))).rejects.toThrow(/公开/u);
  });

  it("extracts actual main-page text and HTML entities without menus or executable content", async () => {
    const html = '<html><head><title>水滴活动记录</title><script>fabricated secret</script></head><body><nav>网站菜单</nav><main><h1>水滴的旅行</h1><p>幼儿观察水汽&nbsp;和云朵。</p><p>2 &lt; 3，安全用水。</p></main><footer>无关页脚</footer></body></html>';
    const result = await extractRemoteDocument("https://example.com/record", undefined, network(html));
    expect(result.type).toBe("document");
    expect(result.text).toContain("水滴的旅行");
    expect(result.text).toContain("幼儿观察水汽 和云朵。");
    expect(result.text).toContain("2 < 3，安全用水。");
    expect(result.text).not.toMatch(/fabricated|网站菜单|无关页脚/u);
    expect(result.sourceUrl).toBe("https://example.com/record");
  });

  it("reads downloaded Word bytes with the existing real attachment parser", async () => {
    const file = await createTeachingDocument("# 科学活动记录\n纸片被磁铁吸住了。", "docx", "活动记录");
    const result = await extractRemoteDocument("https://example.com/record.docx", undefined, {
      resolve: async () => [publicAddress],
      request: async () => ({status: 200, headers: new Headers({"content-type": file.mimeType}), bytes: file.bytes}),
    });
    expect(result.text).toContain("纸片被磁铁吸住了。");
  });

  it.each(["file:///C:/secret.txt", "http://127.0.0.1/a", "http://127.1/a", "http://[::1]/a", "http://[::ffff:127.0.0.1]/a", "http://169.254.169.254/a", "http://168.63.129.16/a", "https://localhost/a", "https://user:pass@example.com/a", "https://example.com:8080/a"])("rejects a non-public document endpoint %s", async url => {
    await expect(extractRemoteDocument(url, undefined, network("must never be read"))).rejects.toThrow(/公开/u);
  });

  it("rejects a host whose DNS includes a private address before sending a request", async () => {
    await expect(extractRemoteDocument("https://example.com/a", undefined, {
      resolve: async () => [publicAddress, {address: "192.168.1.2", family: 4}],
      request: async () => {throw new Error("A private destination must never receive the request");},
    })).rejects.toThrow(/公开/u);
  });

  it("validates a redirect's destination before requesting its body", async () => {
    await expect(extractRemoteDocument("https://example.com/a", undefined, {
      resolve: async () => [publicAddress],
      request: async () => ({status: 302, headers: new Headers({location: "http://127.0.0.1/internal"}), bytes: new Uint8Array()}),
    })).rejects.toThrow(/公开/u);
  });

  it("limits redirects, downloaded size and extracted text", async () => {
    await expect(extractRemoteDocument("https://example.com/a", undefined, {
      resolve: async () => [publicAddress],
      request: async () => ({status: 302, headers: new Headers({location: "/another"}), bytes: new Uint8Array()}),
    })).rejects.toThrow(/重定向/u);
    await expect(extractRemoteDocument("https://example.com/huge", undefined, network("x".repeat(4 * 1024 * 1024 + 1), "text/plain"))).rejects.toThrow(/4\s?MB|大小/u);
    const result = await extractRemoteDocument("https://example.com/long", undefined, network("水".repeat(60000), "text/plain"));
    expect(result.text.length).toBeLessThanOrEqual(50000);
    expect(result.text).toContain("截断");
  });

  it("rejects an empty page and an unsupported remote file instead of inventing text", async () => {
    await expect(extractRemoteDocument("https://example.com/empty", undefined, network("<html><script>only JavaScript</script></html>"))).rejects.toThrow(/正文|文字|空/u);
    await expect(extractRemoteDocument("https://example.com/video.mp4", undefined, network("binary video", "video/mp4"))).rejects.toThrow(/格式|支持/u);
  });

  it("cancels both before and during DNS resolution", async () => {
    const cancelled = AbortSignal.abort();
    await expect(extractRemoteDocument("https://example.com/a", cancelled, network("text"))).rejects.toMatchObject({name: "AbortError"});
    const controller = new AbortController();
    const result = extractRemoteDocument("https://example.com/a", controller.signal, {resolve: () => new Promise(() => {})});
    controller.abort();
    await expect(result).rejects.toMatchObject({name: "AbortError"});
  });
});
