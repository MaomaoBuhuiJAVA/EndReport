export type SmsPurpose = "login" | "register" | "reset_password" | "phone_current" | "phone_new" | "admin";
export type SmsConfig = { available: boolean; enabled: boolean; accessKeyId: string; accessKeySecret: string; securityToken: string; signName: string; verificationSecret: string; templates: Record<SmsPurpose, string>; codeParameter: string };
export function smsConfig(): SmsConfig {
  const env = (name: string) => process.env[name]?.trim() ?? "";
  const enabled = env("SMS_ENABLED") === "true";
  const accessKeyId = env("SMS_ACCESS_KEY_ID") || env("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = env("SMS_ACCESS_KEY_SECRET") || env("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  const verificationSecret = env("SMS_VERIFICATION_SECRET");
  const signName = env("SMS_SIGN_NAME") || "温州市龙湾区国科温州第二幼儿园";
  const templates = {
    login: env("SMS_TEMPLATE_LOGIN") || "SMS_51215901",
    register: env("SMS_TEMPLATE_REGISTER") || "SMS_512585836",
    reset_password: env("SMS_TEMPLATE_RESET_PASSWORD") || "SMS_512685888",
    phone_current: env("SMS_TEMPLATE_CHANGE_PHONE") || "SMS_512520955",
    phone_new: env("SMS_TEMPLATE_CHANGE_PHONE") || "SMS_512520955",
    admin: env("SMS_TEMPLATE_LOGIN") || "SMS_51215901",
  };
  return {enabled, available: enabled && Boolean(accessKeyId && accessKeySecret && signName) && verificationSecret.length >= 32
    && Object.values(templates).every(value => /^SMS_\d+$/u.test(value)), accessKeyId, accessKeySecret, verificationSecret, signName,
    securityToken: env("SMS_SECURITY_TOKEN") || env("ALIBABA_CLOUD_SECURITY_TOKEN"), templates, codeParameter: env("SMS_CODE_PARAMETER") || "code"};
}

export function isSmsPurpose(value: unknown): value is SmsPurpose {
  return typeof value === "string" && ["login", "register", "reset_password", "phone_current", "phone_new", "admin"].includes(value);
}
