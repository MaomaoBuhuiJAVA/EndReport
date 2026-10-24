import type { Metadata } from "next";
import { getFreshSessionUser } from "@/lib/auth";
import { AuthPanel } from "@/components/AuthPanel";
import {getSmsStatus} from "@/lib/sms";
import {redirect} from "next/navigation";

export const metadata: Metadata = {
  title: "登录与注册 | 科小贝",
  robots: { index: false, follow: false },
};
export default async function AuthPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const params = await searchParams;
  const user = await getFreshSessionUser();
  const sms = getSmsStatus();
  const returnTo = params.next === "/admin/reviews" || params.next === "/games/growth" ? params.next : undefined;
  if (user && !["password", "phone", "username", "reset"].includes(params.mode || "")) redirect(returnTo === "/games/growth" || user.role === "ADMIN" && returnTo ? returnTo : "/lab");
  const mode = user && (params.mode === "password" || params.mode === "phone" || params.mode === "username") ? params.mode : params.mode === "register" ? "register" : params.mode === "sms" ? "smsLogin" : params.mode === "reset" ? "reset" : "login";
  return <AuthPanel initialUser={user} smsAvailable={sms.available} initialMode={mode} returnTo={returnTo} />;
}
