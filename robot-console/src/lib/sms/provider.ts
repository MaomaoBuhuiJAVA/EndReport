import type {SmsConfig, SmsPurpose} from "./config";
import {createHmac, randomUUID} from "node:crypto";

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/gu, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export async function sendAliyunSms(config: SmsConfig, phone: string, purpose: SmsPurpose, code: string) {
  if (!config.available) throw new Error("短信服务尚未开通，请使用密码登录。");
  const params: Record<string, string> = {Action: "SendSms", Version: "2017-05-25", Format: "JSON", AccessKeyId: config.accessKeyId,
    SignatureMethod: "HMAC-SHA1", SignatureVersion: "1.0", SignatureNonce: randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
    PhoneNumbers: phone, SignName: config.signName, TemplateCode: config.templates[purpose], TemplateParam: JSON.stringify({[config.codeParameter]: code})};
  if (config.securityToken) params.SecurityToken = config.securityToken;
  const query = Object.keys(params).sort().map(key => `${encode(key)}=${encode(params[key])}`).join("&");
  params.Signature = createHmac("sha1", `${config.accessKeySecret}&`).update(`POST&%2F&${encode(query)}`).digest("base64");
  try {
    const response = await fetch("https://dysmsapi.aliyuncs.com/", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(10000), cache: "no-store"});
    const data = await response.json() as {Code?: string};
    if (!response.ok || data.Code !== "OK") throw new Error("Provider denied delivery");
  } catch { throw new Error("短信暂时无法发送，请稍后重试。"); }
}
