import {createHmac, randomInt, randomUUID, timingSafeEqual} from "node:crypto";
import type {SmsConfig, SmsPurpose} from "./config";

export class SmsError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) {super(message);}
}
export type SmsRecord = {id: string; phone: string; purpose: SmsPurpose; principal: string; codeHash: string; senderKey: string; createdAt: Date; expiresAt: Date; deliveredAt: Date | null; consumedAt: Date | null; attempts: number};
export type SmsProof = {challengeId: string; phone: string; purpose: SmsPurpose; principal?: string; code: string};
export type SmsClaim = {id: string; phone: string; purpose: SmsPurpose; principal: string; codeHash: string};
export type SmsStore = {
  reserve(record: SmsRecord): Promise<number | null>;
  markDelivered(id: string, now: Date): Promise<void>;
  markFailed(id: string, now: Date): Promise<void>;
  consume(claims: SmsClaim[], now: Date): Promise<boolean>;
};
export function validSmsRecord(record: SmsRecord, claim: SmsClaim, now: Date) {
  return record.id === claim.id && record.phone === claim.phone && record.purpose === claim.purpose && record.principal === claim.principal
    && record.deliveredAt !== null && record.consumedAt === null && record.expiresAt.getTime() > now.getTime() && record.attempts < 5
    && /^[a-f0-9]{64}$/iu.test(record.codeHash) && /^[a-f0-9]{64}$/iu.test(claim.codeHash)
    && timingSafeEqual(Buffer.from(record.codeHash, "hex"), Buffer.from(claim.codeHash, "hex"));
}
export class SmsService {
  constructor(private config: SmsConfig, private store: SmsStore, private deliver: (phone: string, purpose: SmsPurpose, code: string) => Promise<void>, private now = () => new Date()) {}
  private ready() {if (!this.config.available) throw new SmsError("短信服务尚未开通，请使用密码登录。", 503);}
  private hash(id: string, phone: string, purpose: SmsPurpose, principal: string, code: string) {
    return createHmac("sha256", this.config.verificationSecret).update(JSON.stringify([id, phone, purpose, principal, code])).digest("hex");
  }
  async send(phone: string, purpose: SmsPurpose, sender: string, principal = "") {
    this.ready();
    if (!/^1[3-9]\d{9}$/u.test(phone)) throw new SmsError("请输入有效的 11 位手机号码。");
    const id = randomUUID(); const code = String(randomInt(100000, 1000000)); const now = this.now();
    const retryAfter = await this.store.reserve({id, phone, purpose, principal, codeHash: this.hash(id, phone, purpose, principal, code),
      senderKey: createHmac("sha256", this.config.verificationSecret).update(sender).digest("hex"), createdAt: now, expiresAt: new Date(now.getTime() + 300000),
      attempts: 0, deliveredAt: null, consumedAt: null});
    if (retryAfter !== null) throw new SmsError("验证码发送较频繁，请稍后再试。", 429, retryAfter);
    try {await this.deliver(phone, purpose, code);}
    catch {
      await this.store.markFailed(id, this.now());
      throw new SmsError("短信暂时无法发送，请稍后重试。", 503);
    }
    await this.store.markDelivered(id, this.now());
    return {challengeId: id, retryAfter: 60, expiresIn: 300};
  }
  async verify(proofs: SmsProof[]) {
    this.ready();
    if (!proofs.length || proofs.length > 2 || new Set(proofs.map(proof => proof.challengeId)).size !== proofs.length
      || proofs.some(proof => !/^[0-9a-f-]{36}$/iu.test(proof.challengeId) || !/^\d{6}$/u.test(proof.code) || !/^1[3-9]\d{9}$/u.test(proof.phone)))
      throw new SmsError("请填写短信中的 6 位验证码。");
    const claims = proofs.map(proof => ({id: proof.challengeId, phone: proof.phone, purpose: proof.purpose, principal: proof.principal ?? "",
      codeHash: this.hash(proof.challengeId, proof.phone, proof.purpose, proof.principal ?? "", proof.code)}));
    if (!await this.store.consume(claims, this.now())) throw new SmsError("验证码不正确、已过期或已使用，请重新获取。");
  }
}
