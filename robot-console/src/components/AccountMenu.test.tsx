import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("next/link", () => ({default: ({children, ...props}: {children: React.ReactNode}) => React.createElement("a", props, children)}));
import {AccountMenu} from "./AccountMenu";
import type {SessionUser} from "@/lib/auth";
const user: SessionUser = {id: "u1", name: "小贝", phone: "13800138000", role: "USER", avatarKey: "sprout"};
describe("account avatar menu", () => {
  it("shows a login entry only to visitors", () => {
    expect(renderToStaticMarkup(<AccountMenu initialUser={null} />)).toContain("登录 / 注册");
    const html = renderToStaticMarkup(<AccountMenu initialUser={user} />);
    expect(html).not.toContain("登录 / 注册");
    expect(html).toContain("小贝的账号菜单");
    expect(html).toContain("138****8000"); expect(html).not.toContain("13800138000");
    for (const label of ["修改用户名", "修改头像", "修改密码", "修改绑定手机号", "退出登录"]) expect(html).toContain(label);
    for (const mode of ["username", "password", "phone"]) expect(html).not.toContain(`href="/auth?mode=${mode}"`);
    expect(html).toContain("修改昵称");
  });
  it("shows the review shortcut only to administrators", () => {
    expect(renderToStaticMarkup(<AccountMenu initialUser={user} />)).not.toContain("审核中心");
    expect(renderToStaticMarkup(<AccountMenu initialUser={{...user, role: "ADMIN"}} />)).toContain("审核中心");
  });
  it("serves uploaded avatars through the current account endpoint", () => {
    const html = renderToStaticMarkup(<AccountMenu initialUser={{...user, avatarKey: "upload_example"}} />);
    expect(html).toContain('src="/api/auth/avatar?v=u1%3Aupload_example"');
  });
});
