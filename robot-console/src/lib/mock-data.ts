import type { DeviceLog, LearningTask, RobotCommand, RobotDevice } from "./types";

const now = Date.now();

export const devices: RobotDevice[] = [
  {
    id: "kb-001",
    code: "KINDER-ALPHA-01",
    name: "云朵一号",
    classroom: "小一班",
    status: "online",
    mode: "learning",
    battery: 86,
    temperature: 36.5,
    lastHeartbeat: new Date(now - 24_000).toISOString(),
    firmware: "kb-1.2.0",
  },
  {
    id: "kb-002",
    code: "KINDER-MOON-02",
    name: "月芽二号",
    classroom: "中二班",
    status: "idle",
    mode: "companion",
    battery: 64,
    temperature: 36.1,
    lastHeartbeat: new Date(now - 88_000).toISOString(),
    firmware: "kb-1.1.8",
  },
  {
    id: "kb-003",
    code: "KINDER-BELL-03",
    name: "铃兰三号",
    classroom: "大一班",
    status: "warning",
    mode: "patrol",
    battery: 22,
    temperature: 37.2,
    lastHeartbeat: new Date(now - 210_000).toISOString(),
    firmware: "kb-1.1.5",
  },
  {
    id: "kb-004",
    code: "KINDER-SEED-04",
    name: "种子四号",
    classroom: "绘本角",
    status: "offline",
    mode: "sleep",
    battery: 7,
    temperature: 35.8,
    lastHeartbeat: new Date(now - 960_000).toISOString(),
    firmware: "kb-1.0.9",
  },
];

export const commands: RobotCommand[] = [
  {
    id: "cmd-1008",
    deviceId: "kb-001",
    type: "story",
    label: "播放故事：小熊整理玩具",
    status: "success",
    createdAt: new Date(now - 180_000).toISOString(),
  },
  {
    id: "cmd-1007",
    deviceId: "kb-003",
    type: "move_stop",
    label: "停止移动",
    status: "success",
    createdAt: new Date(now - 260_000).toISOString(),
  },
  {
    id: "cmd-1006",
    deviceId: "kb-002",
    type: "mode_companion",
    label: "切换陪伴模式",
    status: "running",
    createdAt: new Date(now - 420_000).toISOString(),
  },
  {
    id: "cmd-1005",
    deviceId: "kb-001",
    type: "move_forward",
    label: "前进 1 米",
    status: "success",
    createdAt: new Date(now - 640_000).toISOString(),
  },
];

export const logs: DeviceLog[] = [
  {
    id: "log-1",
    deviceId: "kb-003",
    level: "warning",
    message: "铃兰三号电量低于 25%，建议返回充电区。",
    createdAt: new Date(now - 130_000).toISOString(),
  },
  {
    id: "log-2",
    deviceId: "kb-001",
    level: "info",
    message: "云朵一号完成英语单词卡互动，共 12 次回答。",
    createdAt: new Date(now - 300_000).toISOString(),
  },
  {
    id: "log-3",
    deviceId: "kb-004",
    level: "error",
    message: "种子四号超过 15 分钟未上报心跳。",
    createdAt: new Date(now - 940_000).toISOString(),
  },
];

export const tasks: LearningTask[] = [
  {
    id: "task-1",
    title: "晨间问候与情绪识别",
    type: "campus_qa",
    schedule: "08:30",
    progress: 82,
  },
  {
    id: "task-2",
    title: "绘本故事：彩虹桥",
    type: "story",
    schedule: "10:15",
    progress: 45,
  },
  {
    id: "task-3",
    title: "动物英文单词卡",
    type: "word_card",
    schedule: "15:20",
    progress: 64,
  },
];
