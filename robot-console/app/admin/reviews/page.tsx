import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFreshSessionUser } from "@/lib/auth";
import { ReviewDashboard } from "@/components/ReviewDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "投稿审核 | 科小贝", robots: { index: false, follow: false } };

export default async function ReviewPage() {
  let user;
  try { user = await getFreshSessionUser(); }
  catch {
    return <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center"><h1 className="text-2xl font-bold">审核中心暂时无法连接</h1><p>请稍后刷新重试。</p><Link className="text-[#176b5d] underline" href="/auth">返回账号中心</Link></main>;
  }
  if (!user) redirect("/auth?next=/admin/reviews");
  if (user.role !== "ADMIN") {
    return <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center"><h1 className="text-2xl font-bold">这里需要审核管理员账号</h1><p>请联系园方确认审核权限，或切换到管理员账号。</p><Link className="text-[#176b5d] underline" href="/auth">前往账号中心</Link></main>;
  }
  return <ReviewDashboard reviewerName={user.name} />;
}
