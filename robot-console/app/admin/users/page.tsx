import type {Metadata} from "next";
import {getAdminSmsSession} from "@/lib/auth";
import {AdminSmsGate} from "@/components/AdminSmsGate";
import {AdminUsersDashboard} from "@/components/AdminUsersDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "用户管理 | 科小贝", robots: {index: false, follow: false}};

export default async function AdminUsersPage() {
  const admin = await getAdminSmsSession();
  return admin ? <AdminUsersDashboard adminName={admin.name} /> : <AdminSmsGate />;
}
