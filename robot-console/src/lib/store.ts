import { commands, devices, logs, tasks } from "./mock-data";
import type { RobotCommand } from "./types";

export function getOverview() {
  const online = devices.filter((device) => device.status === "online").length;
  const warning = devices.filter((device) => device.status === "warning").length;
  const avgBattery = Math.round(
    devices.reduce((total, device) => total + device.battery, 0) / devices.length,
  );

  return {
    devices,
    commands,
    logs,
    tasks,
    stats: {
      totalDevices: devices.length,
      onlineDevices: online,
      warningDevices: warning,
      avgBattery,
      interactionsToday: 236,
      commandSuccessRate: 96,
    },
  };
}

export function createMockCommand(deviceId: string, type: string, label: string) {
  const command: RobotCommand = {
    id: `cmd-${Date.now()}`,
    deviceId,
    type,
    label,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  commands.unshift(command);
  logs.unshift({
    id: `log-${Date.now()}`,
    deviceId,
    level: "info",
    message: `教师端下发指令：${label}`,
    createdAt: new Date().toISOString(),
  });

  return command;
}

export function updateMockHeartbeat(deviceId: string, battery?: number, mode?: string) {
  const device = devices.find((item) => item.id === deviceId);

  if (!device) {
    return null;
  }

  device.lastHeartbeat = new Date().toISOString();
  device.status = battery !== undefined && battery < 20 ? "warning" : "online";

  if (typeof battery === "number") {
    device.battery = Math.max(0, Math.min(100, Math.round(battery)));
  }

  if (mode === "companion" || mode === "learning" || mode === "patrol" || mode === "sleep") {
    device.mode = mode;
  }

  logs.unshift({
    id: `log-${Date.now()}`,
    deviceId,
    level: device.status === "warning" ? "warning" : "info",
    message: `${device.name} 已上报心跳，电量 ${device.battery}%。`,
    createdAt: new Date().toISOString(),
  });

  return device;
}
