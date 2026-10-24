import {describe, expect, it, vi} from "vitest";
import {SmsService, validSmsRecord, type SmsRecord, type SmsStore, type SmsClaim} from "./service";
import type {SmsConfig, SmsPurpose} from "./config";
function fixture() {
  let now = new Date("2026-10-10T00:00:00Z"); const records: SmsRecord[] = [];
  const store: SmsStore = {
    reserve: vi.fn(async r => {records.push(r); return null;}),
    markDelivered: vi.fn(async (id, at) => {records.find(r => r.id === id)!.deliveredAt = at;}),
    markFailed: vi.fn(async (id, at) => {records.find(r => r.id === id)!.consumedAt = at;}),
    consume: vi.fn(async (claims: SmsClaim[], at: Date) => {
      const selected = claims.map(c => records.find(r => r.id === c.id));
      const valid = claims.every((c, i) => selected[i] && validSmsRecord(selected[i]!, c, at));
      for (const r of selected) if (r && !r.consumedAt && r.attempts < 5) r.attempts++;
      if (valid) selected.forEach(r => {r!.consumedAt = at;});
      return valid;
    }),
  };
  const config = {available: true, verificationSecret: "a-secret-used-only-in-tests-with-enough-length"} as SmsConfig;
  const deliver = vi.fn(async (phone: string, purpose: SmsPurpose, code: string) => {expect(phone).toMatch(/^1\d{10}$/u); expect(purpose).toBeTruthy(); expect(code).toMatch(/^\d{6}$/u);});
  return {service: new SmsService(config, store, deliver, () => now), phone: "13900000000", store, deliver, records, setNow: (date: Date) => {now = date;}, config};
}
describe("SMS verification lifecycle", () => {
  it("returns no code, saves only a bound digest and rejects replay", async () => {
    const f = fixture(); const sent = await f.service.send(f.phone, "login", "client-address"); const code = f.deliver.mock.calls[0][2];
    expect(code).toMatch(/^\d{6}$/u); expect(JSON.stringify(sent)).not.toContain(code);
    expect(f.records[0].codeHash).toMatch(/^[a-f0-9]{64}$/u); expect(JSON.stringify(f.records)).not.toContain("client-address");
    const proof = {challengeId: sent.challengeId, phone: f.phone, purpose: "login" as const, code};
    await f.service.verify([proof]); await expect(f.service.verify([proof])).rejects.toThrow("已使用");
  });
  it("rejects cross-purpose, cross-phone and cross-account codes", async () => {
    const f = fixture(); const sent = await f.service.send(f.phone, "phone_new", "client", "u1");
    const proof = {challengeId: sent.challengeId, phone: f.phone, purpose: "phone_new" as const, principal: "u1", code: f.deliver.mock.calls[0][2]};
    for (const patch of [{purpose: "login" as const}, {phone: "13800000000"}, {principal: "u2"}]) await expect(f.service.verify([{...proof, ...patch}])).rejects.toThrow("验证码");
    await f.service.verify([proof]);
  });
  it("expires at five minutes and blocks a code after five failed guesses", async () => {
    const f = fixture(); const sent = await f.service.send(f.phone, "login", "client"); const code = f.deliver.mock.calls[0][2];
    const proof = {challengeId: sent.challengeId, phone: f.phone, purpose: "login" as const, code};
    for (let i = 0; i < 5; i++) await expect(f.service.verify([{...proof, code: "000000"}])).rejects.toThrow("验证码");
    await expect(f.service.verify([proof])).rejects.toThrow("验证码");
    const next = await f.service.send(f.phone, "login", "client"); f.setNow(new Date("2026-10-10T00:05:00Z"));
    await expect(f.service.verify([{...proof, challengeId: next.challengeId, code: f.deliver.mock.calls[1][2]}])).rejects.toThrow("验证码");
  });
  it("does not deliver after a quota denial and invalidates a failed provider delivery", async () => {
    const f = fixture(); vi.mocked(f.store.reserve).mockResolvedValueOnce(60);
    await expect(f.service.send(f.phone, "login", "client")).rejects.toMatchObject({status: 429, retryAfter: 60}); expect(f.deliver).not.toHaveBeenCalled();
    f.deliver.mockRejectedValueOnce(new Error("provider details")); await expect(f.service.send(f.phone, "login", "client")).rejects.toMatchObject({status: 503});
    expect(f.records[0].deliveredAt).toBeNull(); expect(f.records[0].consumedAt).toBeTruthy();
  });
  it("does not touch persistence or delivery before activation", async () => {
    const f = fixture(); f.config.available = false; await expect(f.service.send(f.phone, "login", "client")).rejects.toMatchObject({status: 503});
    expect(f.store.reserve).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled();
  });
  it("validates both phone-change proofs before consuming either", async () => {
    const f = fixture(); const old = await f.service.send(f.phone, "phone_current", "client", "u1"); const next = await f.service.send("13800000000", "phone_new", "client", "u1");
    const proofs = [{challengeId: old.challengeId, phone: f.phone, purpose: "phone_current" as const, principal: "u1", code: f.deliver.mock.calls[0][2]}, {challengeId: next.challengeId, phone: "13800000000", purpose: "phone_new" as const, principal: "u1", code: f.deliver.mock.calls[1][2]}];
    await expect(f.service.verify([proofs[0], {...proofs[1], code: "000000"}])).rejects.toThrow("验证码"); expect(f.records.every(r => !r.consumedAt)).toBe(true);
    await f.service.verify(proofs); expect(f.records.every(r => r.consumedAt)).toBe(true);
  });
});
