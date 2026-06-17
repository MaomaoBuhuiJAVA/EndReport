import { NextResponse } from "next/server";
import { updateMockHeartbeat } from "@/lib/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    battery?: number;
    mode?: string;
  };

  const device = updateMockHeartbeat(id, body.battery, body.mode);

  if (!device) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }

  return NextResponse.json({ device });
}
