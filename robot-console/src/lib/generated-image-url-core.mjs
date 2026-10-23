/** Exact observed provider buckets; arbitrary Alibaba/OSS hosts are insufficient. */
/** @param {URL} url */
export function isGeneratedImageUrl(url) {
  const resultHost = /^dashscope-result[-a-z0-9]*\.oss[-a-z0-9]*\.aliyuncs\.com$/u.test(url.hostname)
    || url.hostname === "dashscope-0484.oss-accelerate.aliyuncs.com"
    || url.hostname === "dashscope-5859.oss-cn-wulanchabu-acdr-1.aliyuncs.com";
  return url.protocol === "https:" && !url.username && !url.password
    && (!url.port || url.port === "443") && resultHost;
}
