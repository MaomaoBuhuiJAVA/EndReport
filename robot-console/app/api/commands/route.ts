import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const commandLabels: Record<string, string> = {
  wasd_W: "W 前进",
  wasd_A: "A 左转",
  wasd_S: "S 后退",
  wasd_D: "D 右转",
  move_stop: "停止移动",
  mode_learning: "切换学习模式",
  mode_companion: "切换陪伴模式",
  mode_sleep: "进入休眠模式",
  story: "播放绘本故事",
  song: "播放儿歌",
};

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "管理员才能下发控制指令" }, { status: 403 });
  }

  const body = (await request.json()) as {
    deviceId?: string;
    type?: string;
    label?: string;
  };

  if (!body.deviceId || !body.type) {
    return NextResponse.json({ error: "deviceId and type are required" }, { status: 400 });
  }

  const label = body.label ?? commandLabels[body.type] ?? body.type;

  try {
    const command = await prisma.command.create({
      data: {
        deviceId: body.deviceId,
        teacherId: user.id,
        type: body.type,
        payload: { label },
        status: "PENDING",
      },
    });

    await prisma.deviceLog.create({
      data: {
        deviceId: body.deviceId,
        level: "info",
        message: `管理员 ${user.name} 下发指令：${label}`,
        metadata: { commandId: command.id },
      },
    });

    return NextResponse.json({ command });
  } catch {
    return NextResponse.json({
      command: {
        id: `mock-${Date.now()}`,
        deviceId: body.deviceId,
        type: body.type,
        label,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      },
      provider: "fallback",
    });
  }
}
