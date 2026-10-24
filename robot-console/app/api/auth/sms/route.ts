import {authReply} from "@/lib/auth-request";
import {getSmsStatus} from "@/lib/sms";
export const dynamic = "force-dynamic";
export async function GET() {return authReply(getSmsStatus());}
