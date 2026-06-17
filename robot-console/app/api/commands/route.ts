import { NextResponse } from "next/server";
import { createMockCommand } from "@/lib/store";

const commandLabels: Record<string, string> = {
  move_forward: "前进 1 米",
  move_back: "后退 1 米",
  turn_left: "左转",
  turn_right: "右转",
  move_stop: "停止移动",
  mode_learning: "切换学习模式",
  mode_companion: "切换陪伴模式",
  mode_sleep: "进入休眠模式",
  story: "播放绘本故事",
  song: "播放儿歌",
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    deviceId?: string;
    type?: string;
    label?: string;
  };

  if (!body.deviceId || !body.type) {
    return NextResponse.json(
      { error: "deviceId and type are required" },
      { status: 400 },
    );
  }

  const command = createMockCommand(
    body.deviceId,
    body.type,
    body.label ?? commandLabels[body.type] ?? body.type,
  );

  return NextResponse.json({ command });
}
