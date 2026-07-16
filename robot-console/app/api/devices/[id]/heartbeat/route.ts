import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    battery?: number;
    mode?: string;
  };

  try {
    const device = await prisma.device.update({
      where: { id },
      data: {
        lastOnlineAt: new Date(),
        status: typeof body.battery === "number" && body.battery < 20 ? "WARNING" : "ONLINE",
        battery:
          typeof body.battery === "number"
            ? Math.max(0, Math.min(100, Math.round(body.battery)))
            : undefined,
        mode:
          body.mode === "COMPANION" ||
          body.mode === "LEARNING" ||
          body.mode === "PATROL" ||
          body.mode === "SLEEP"
            ? body.mode
            : undefined,
      },
    });

    await prisma.deviceLog.create({
      data: {
        deviceId: id,
        level: device.status === "WARNING" ? "warning" : "info",
        message: `${device.name} 已更新在线状态，电量 ${device.battery}%。`,
      },
    });

    return NextResponse.json({ device });
  } catch {
    return NextResponse.json({ error: "设备状态更新失败" }, { status: 500 });
  }
}
