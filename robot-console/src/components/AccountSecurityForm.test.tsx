import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {AccountSecurityForm, type AccountSecurityView} from "./AccountSecurityForm";
import type {SessionUser} from "@/lib/auth";

const user: SessionUser = {id: "u1", name: "小贝", username: "xiaobei", phone: "13800138000", role: "USER"};
function render(view: AccountSecurityView, account = user, busy = false) {
  return renderToStaticMarkup(<AccountSecurityForm view={view} user={account} busy={busy} setBusy={vi.fn()} onSaved={vi.fn()} onCancel={vi.fn()} />);
}
describe("account security dialogs", () => {
  it("prefills the login username without requiring the current password", () => {
    const html = render("username");
    expect(html).toContain('value="xiaobei"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("当前密码");
    expect(html).not.toContain('href="/auth');
  });
  it("requires a new password and confirmation without exposing existing credentials", () => {
    const html = render("password");
    expect(html.match(/type="password"/g)).toHaveLength(3);
    expect(html).toContain('name="confirmPassword"');
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
  });
  it("masks the bound phone and blocks save until SMS availability is known", () => {
    const html = render("phone");
    expect(html).toContain("138****8000");
    expect(html).not.toContain("13800138000");
    expect(html).not.toContain('name="oldPassword"');
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });
  it("requires the account password when binding the first phone", () => {
    expect(render("phone", {...user, phone: null})).toContain('name="oldPassword"');
  });
  it("disables editing during an active save", () => {
    expect(render("username", user, true)).toContain("disabled=\"\"");
    expect(render("username", user, true)).toContain("正在保存…");
  });
});
