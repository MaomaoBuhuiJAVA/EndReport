import {smsConfig} from "./config";
import {sendAliyunSms} from "./provider";
import {SmsService, type SmsProof} from "./service";
import {postgresSmsStore} from "./store";
export {SmsError} from "./service";
export {isSmsPurpose} from "./config";
export function getSmsStatus() {
  const config = smsConfig();
  return {available: config.available, registrationVerificationRequired: false,
    message: config.available ? "验证码 5 分钟内有效。" : "短信服务正在开通，暂时请使用密码登录。"};
}
function service() {
  const config = smsConfig();
  return new SmsService(config, postgresSmsStore, (phone, purpose, code) => sendAliyunSms(config, phone, purpose, code));
}
export const sendSms = (phone: string, purpose: Parameters<SmsService["send"]>[1], sender: string, principal?: string) => service().send(phone, purpose, sender, principal);
export const verifySms = (proofs: SmsProof[]) => service().verify(proofs);
