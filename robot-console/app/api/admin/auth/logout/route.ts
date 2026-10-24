import {authReply} from "@/lib/auth-request";
import {clearAdminSmsSession} from "@/lib/auth";

export async function POST() {
  await clearAdminSmsSession();
  return authReply({ok: true});
}
