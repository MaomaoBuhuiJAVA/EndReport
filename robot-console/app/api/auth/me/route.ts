import { NextResponse } from "next/server";
import { getFreshSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getFreshSessionUser();
  return NextResponse.json({ user });
}
