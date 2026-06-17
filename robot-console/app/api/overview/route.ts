import { NextResponse } from "next/server";
import { getOverview } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getOverview());
}
