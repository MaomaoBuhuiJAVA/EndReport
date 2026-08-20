import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const secret = process.env.DEVICE_HEARTBEAT_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "设备心跳服务未配置" }, { status: 503 });
  const timestamp = request.headers.get("x-device-timestamp") ?? "";
  const signature = request.headers.get("x-device-signature") ?? "";
  const timestampMs = Number(timestamp);
  if (!/^\d{10,13}$/u.test(timestamp) || !Number.isFinite(timestampMs) || Math.abs(Date.now() - (timestamp.length === 10 ? timestampMs * 1000 : timestampMs)) > 5 * 60 * 1000) {
    return NextResponse.json({ error: "设备心跳已过期" }, { status: 401 });
  }
  const rawBody = await request.text();
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody}`).digest("hex");
  const provided = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
    return NextResponse.json({ error: "设备心跳签名无效" }, { status: 401 });
  }
  const body = (() => { try { return JSON.parse(rawBody || "{}"); } catch { return {}; } })() as {
    battery?: number;
    mode?: string;
  };
  if (typeof body.battery !== "undefined" && (typeof body.battery !== "number" || !Number.isFinite(body.battery))) {
    return NextResponse.json({ error: "电量格式无效" }, { status: 400 });
  }

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
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "设备不存在" }, { status: 404 });
    }
    return NextResponse.json({ error: "设备状态更新失败" }, { status: 500 });
  }
}
