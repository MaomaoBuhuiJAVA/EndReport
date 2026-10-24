import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("next/image", () => ({default: (props: Record<string, unknown>) => {const imageProps = {...props}; delete imageProps.priority; delete imageProps.unoptimized; return React.createElement("img", imageProps);}}));
vi.mock("next/link", () => ({default: ({children, ...props}: {children: React.ReactNode}) => React.createElement("a", props, children)}));
import {AuthPanel} from "./AuthPanel";
const render = (props: Partial<React.ComponentProps<typeof AuthPanel>> = {}) => renderToStaticMarkup(<AuthPanel initialUser={null} {...props} />);
describe("account service availability", () => {
  it("opens username settings directly for signed-in accounts", () => {
    const html = render({initialUser: {id: "u1", name: "用户", username: "teacher_1", role: "USER"}, initialMode: "username"});
    expect(html).toContain('value="teacher_1"');
    expect(html).toContain("保存用户名");
    expect(html).toContain('name="password"');
  });
  it("gives the password-reset confirmation a unique label target", () => {
    const html = render({initialMode: "reset", smsAvailable: true});
    expect(html.match(/id="auth-field-confirmPassword"/gu)).toHaveLength(1);
  });
  it("keeps a compact login form with username and no service promotion", () => {
    const html = render();
    expect(html).toContain('name="identifier"');expect(html).toContain("请输入用户名或手机号");
    expect(html).not.toContain("账号服务");expect(html).not.toContain("想先逛一逛");
    expect(html).toContain("验证码登录");expect(html).toContain("注册账号");expect(html).toContain("忘记密码了？");
  });
  it("requires policy consent before unauthenticated submission", () => {
    const html = render();
    expect(html).toContain('name="acceptedPolicies"');
    expect(html).toContain("我已阅读并同意");
    expect(html).toContain("用户协议");
    expect(html).toContain("隐私政策");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/u);
  });
  it("does not enable SMS submission before activation", () => {
    const html = render({initialMode: "smsLogin"}); expect(html).toMatch(/type="submit"[^>]*disabled=""/u); expect(html).toContain("短信服务开通后可用");
    expect(html).toMatch(/id="auth-tab-smsLogin"[^>]*aria-selected="true"/u);
    expect(html).toContain('aria-labelledby="auth-tab-smsLogin"');
    expect(html).not.toContain("用验证码轻松登录"); expect(html).not.toContain("验证已注册的手机号码，继续你的探索。");
    expect(render({initialMode: "smsLogin", smsAvailable: true})).not.toContain("请先获取验证码，再填写短信中的数字。");
  });
  it.each([false, true])("keeps registration compact and usable with SMS availability %s", (smsAvailable) => {
    const html = render({initialMode: "register", smsAvailable});
    expect(html).toMatch(/type="submit"[^>]*disabled=""/u);
    expect(html).toContain('name="acceptedPolicies"');
    expect(html).toContain("返回登录");
    expect(html).not.toContain("one-time-code");
    expect(html).not.toContain("获取验证码");
    expect(html).not.toContain("2–24 位，以中文或字母开头；也可以登录后设置。");
    expect(html).not.toContain("注册时需要验证手机号码。");
    expect(html).not.toContain("家长注册后可浏览公开资源、体验 AI。本园家长投稿需联系园方核验身份。");
  });
  it("retains SMS codes for login and reset and bound-phone management", () => {
    expect(render({initialMode: "smsLogin", smsAvailable: true})).toContain("one-time-code");
    expect(render({initialMode: "reset", smsAvailable: true})).toContain("one-time-code");
    expect(render({initialUser: {id: "u1", name: "用户", phone: "13800138000", role: "USER"}})).toContain("修改绑定手机号");
  });
});
