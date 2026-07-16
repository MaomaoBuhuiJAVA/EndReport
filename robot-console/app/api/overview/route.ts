import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSiteData } from "@/lib/site-data";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json(await getSiteData(user?.role));
}
