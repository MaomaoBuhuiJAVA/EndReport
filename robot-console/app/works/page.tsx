import type { Metadata } from "next";
import { StudentWorks } from "@/components/StudentWorks";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "科学作品展示 | 科小贝",
  description: "国科二幼科学作品展示与成长档案。",
};

export default async function WorksPage() {
  const user = await getSessionUser();
  return <StudentWorks initialUser={user} />;
}
