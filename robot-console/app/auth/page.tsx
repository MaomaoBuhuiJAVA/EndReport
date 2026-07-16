import { getSessionUser } from "@/lib/auth";
import { AuthPanel } from "@/components/AuthPanel";

export default async function AuthPage() {
  const user = await getSessionUser();
  return <AuthPanel initialUser={user} />;
}
