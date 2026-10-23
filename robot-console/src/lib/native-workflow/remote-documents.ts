import { lookup } from "node:dns/promises";
import { get as getHttp } from "node:http";
import { get as getHttps } from "node:https";
import { isIP } from "node:net";
import { load } from "cheerio";
import { extractAttachment, type ExtractedAttachment } from "./attachments";
export { requestedDocumentUrl } from "./routing";

export type RemoteDocumentResponse = {status: number; headers: Headers; bytes: Uint8Array};
export type RemoteDocumentOptions = {
  resolve?: (hostname: string) => Promise<Array<{address: string; family: number}>>;
  request?: (url: URL, address: {address: string; family: number}, signal: AbortSignal) => Promise<RemoteDocumentResponse>;
};
const MAX_BYTES = 4 * 1024 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const fileTypes: Record<string, string> = {
  "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
};

function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)
      || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
      || a === 203 && b === 0 && c === 113 || address === "168.63.129.16");
  }
  if (isIP(address) !== 6) return false;
  // Global unicast only; exclude mapped, tunnelling and documentation ranges.
  return /^[23][0-9a-f]{3}:/iu.test(address) && !/^2001:(?:0*:|db8:)|^2002:/iu.test(address);
}

function publicUrl(raw: string) {
  let url: URL;
  try {url = new URL(raw);} catch {throw new Error("请使用有效的公开文档链接。");}
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  if (raw.length > 4096 || !["http:", "https:"].includes(url.protocol) || url.username || url.password
    || url.port && url.port !== (url.protocol === "https:" ? "443" : "80")
    || /(?:^|\.)(?:localhost|local|internal|test)$/iu.test(host) || !host.includes(".") && !isIP(host)
    || isIP(host) && !publicAddress(host)) throw new Error("仅支持无账号密码的公开 HTTP(S) 文档链接。");
  url.hash = "";
  return url;
}

async function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, {once: true});
    })]);
  } finally {signal.removeEventListener("abort", abort!);}
}

function requestPublic(url: URL, address: {address: string; family: number}, signal: AbortSignal): Promise<RemoteDocumentResponse> {
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? getHttps : getHttp;
    const request = get(url, {
      agent: false, signal, family: address.family,
      // Pin the approved DNS result; the request must not resolve the host again.
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: {"User-Agent": "GuokeTeachingDocument/1.0", Accept: "text/html,text/plain,application/pdf,application/octet-stream;q=0.8", "Accept-Encoding": "identity"},
    }, response => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const status = response.statusCode || 0;
      if (REDIRECTS.has(status)) {response.destroy();resolve({status, headers, bytes: new Uint8Array()});return;}
      if (Number(headers.get("content-length")) > MAX_BYTES) {response.destroy();reject(new Error("链接文件大小超过 4MB，请拆分后上传。"));return;}
      void (async () => {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response) {
          signal.throwIfAborted();
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > MAX_BYTES) {response.destroy();throw new Error("链接文件大小超过 4MB，请拆分后上传。");}
          chunks.push(bytes);
        }
        resolve({status, headers, bytes: Buffer.concat(chunks)});
      })().catch(reject);
    });
    request.on("error", reject);
  });
}

function readableText(bytes: Uint8Array, headers: Headers, html: boolean) {
  const charset = headers.get("content-type")?.match(/charset\s*=\s*["']?([^\s;"']+)/iu)?.[1] || "utf-8";
  const decoded = new TextDecoder(charset, {fatal: true}).decode(bytes);
  let text = decoded, title = "";
  if (html) {
    const $ = load(decoded);
    title = $("title").first().text().trim().slice(0, 120);
    $("script,style,nav,header,footer,iframe,form,noscript,svg,template").remove();
    const main = $("main").first();
    const article = $("article").first();
    const body = $("body").first();
    const root = main.length ? main : article.length ? article : body;
    root.find("br").replaceWith("\n");
    root.find("p,div,section,article,h1,h2,h3,h4,h5,h6,li,tr").append("\n");
    text = root.text();
  }
  text = text.split(/\r?\n/u).map(line => line.replace(/[\t \u00a0]+/gu, " ").trim()).filter(Boolean).join("\n");
  if (!text || /[\u0000-\u0008\u000e-\u001f]/u.test(text)) throw new Error("链接没有可提取的正文文字，请上传原始文档。");
  if (title && !text.includes(title)) text = `${title}\n${text}`;
  const notice = "\n[提取内容已截断：仅展示前 50000 字符，请拆分文件以获取完整内容。]";
  return {text: text.length > 50000 ? text.slice(0, 50000 - notice.length) + notice : text, title};
}

export async function extractRemoteDocument(raw: string, signal?: AbortSignal, options: RemoteDocumentOptions = {}): Promise<ExtractedAttachment & {sourceUrl: string}> {
  signal?.throwIfAborted();
  const activeSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  const resolve = options.resolve || (hostname => lookup(hostname, {all: true, verbatim: true}));
  const request = options.request || requestPublic;
  let url = publicUrl(raw);
  for (let redirects = 0; redirects <= 3; redirects++) {
    activeSignal.throwIfAborted();
    const host = url.hostname.replace(/^\[|\]$/gu, "");
    const addresses = isIP(host) ? [{address: host, family: isIP(host)}] : await cancellable(resolve(host), activeSignal);
    if (!addresses.length || addresses.some(address => !publicAddress(address.address))) throw new Error("链接必须指向公开文档服务。");
    const address = addresses.find(address => address.family === 4) || addresses[0];
    const response = await cancellable(request(url, address, activeSignal), activeSignal);
    if (REDIRECTS.has(response.status)) {
      const next = response.headers.get("location");
      if (!next || redirects === 3) throw new Error("链接重定向过多或未提供目标，请上传原始文档。");
      url = publicUrl(new URL(next, url).href);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error("链接文档暂时无法读取，请检查访问权限或上传原始文件。");
    if (!response.bytes.length || response.bytes.length > MAX_BYTES) throw new Error("链接文件为空或大小超过 4MB。");
    const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
    const name = decodeURIComponent(url.pathname.split("/").at(-1) || "在线文档").replace(/[\\/\r\n]/gu, "_").slice(-160);
    if (["text/html", "application/xhtml+xml", "text/plain", "text/markdown"].includes(type)) {
      const content = readableText(response.bytes, response.headers, /html/u.test(type));
      return {type: "document", name: content.title || name || url.hostname, text: content.text, sourceUrl: url.href};
    }
    const extension = fileTypes[type] || name.match(/\.(pdf|docx?|pptx|xlsx?)$/iu)?.[1].toLowerCase();
    if (!extension) throw new Error("链接文件格式暂不支持，请上传网页正文、TXT、Word、PDF、PPTX 或 Excel。");
    const attachment = await extractAttachment(new File([new Uint8Array(response.bytes)], `在线文档.${extension}`, {type}), activeSignal);
    return {...attachment, sourceUrl: url.href};
  }
  throw new Error("链接重定向过多。");
}
