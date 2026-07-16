export type DeviceStatus = "online" | "idle" | "offline" | "warning";

export type RobotMode = "companion" | "learning" | "patrol" | "sleep";

export type CommandStatus = "pending" | "running" | "success" | "failed";

export type RobotDevice = {
  id: string;
  code: string;
  name: string;
  classroom: string;
  status: DeviceStatus;
  mode: RobotMode;
  battery: number;
  temperature: number;
  lastHeartbeat: string;
  firmware: string;
};

export type RobotCommand = {
  id: string;
  deviceId: string;
  type: string;
  label: string;
  status: CommandStatus;
  createdAt: string;
};

export type DeviceLog = {
  id: string;
  deviceId: string;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: string;
};

export type LearningTask = {
  id: string;
  title: string;
  type: "story" | "song" | "word_card" | "quiz" | "campus_qa";
  schedule: string;
  progress: number;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
