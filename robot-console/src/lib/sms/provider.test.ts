import {afterEach, describe, expect, it, vi} from "vitest";
import {smsConfig} from "./config";
import {sendAliyunSms} from "./provider";
afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals();});
function configure() {
  vi.stubEnv("SMS_ENABLED", "true");
  vi.stubEnv("SMS_ACCESS_KEY_ID", "test-id");
  vi.stubEnv("SMS_ACCESS_KEY_SECRET", "test-secret");
  vi.stubEnv("SMS_VERIFICATION_SECRET", "a-dedicated-verification-secret-of-32-chars");
  vi.stubEnv("SMS_TEMPLATE_LOGIN", "");
  vi.stubEnv("SMS_TEMPLATE_REGISTER", "");
  vi.stubEnv("SMS_TEMPLATE_RESET_PASSWORD", "");
  vi.stubEnv("SMS_TEMPLATE_CHANGE_PHONE", "");
  vi.stubEnv("SMS_CODE_PARAMETER", "code");
}
describe("Aliyun SMS configuration and delivery", () => {
  it("keeps SMS disabled by default even when OSS credentials exist", () => {
    vi.stubEnv("SMS_ENABLED", "false");
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "oss-id");
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "oss-secret");
    expect(smsConfig().available).toBe(false);
  });
  it("maps all four screenshot templates and requires a real verification secret", () => {
    configure();
    expect(smsConfig()).toMatchObject({available: true, templates: {login: "SMS_51215901", register: "SMS_512585836", reset_password: "SMS_512685888", phone_current: "SMS_512520955", phone_new: "SMS_512520955"}});
    vi.stubEnv("SMS_VERIFICATION_SECRET", "short");
    expect(smsConfig().available).toBe(false);
  });
  it("sends the selected template through a signed server request and includes STS when configured", async () => {
    configure(); vi.stubEnv("SMS_SECURITY_TOKEN", "temporary-token");
    const fetcher = vi.fn(async () => Response.json({Code: "OK", Message: "OK"}));
    vi.stubGlobal("fetch", fetcher);
    await sendAliyunSms(smsConfig(), "13900000000", "reset_password", "123456");
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://dysmsapi.aliyuncs.com/");
    expect(options.method).toBe("POST");
    const body = new URLSearchParams(String(options.body));
    expect(body.get("PhoneNumbers")).toBe("13900000000");
    expect(body.get("TemplateCode")).toBe("SMS_512685888");
    expect(JSON.parse(body.get("TemplateParam")!)).toEqual({code: "123456"});
    expect(body.get("SecurityToken")).toBe("temporary-token");
    expect(body.get("Signature")).toBeTruthy();
    expect(String(options.body)).not.toContain("test-secret");
  });
  it("rejects a provider denial without leaking provider response details", async () => {
    configure(); vi.stubGlobal("fetch", async () => Response.json({Code: "isv.SMS_SIGNATURE_ILLEGAL", Message: "sensitive provider diagnostic"}));
    await expect(sendAliyunSms(smsConfig(), "13900000000", "login", "123456")).rejects.toThrow("短信暂时无法发送");
  });
});
