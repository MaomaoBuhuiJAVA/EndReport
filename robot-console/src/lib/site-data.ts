import campusManifest from "@/data/gallery-manifest.json";
import roomManifest from "@/data/room-manifest.json";
import { prisma } from "@/lib/prisma";

export type SiteData = {
  profile: {
    name: string;
    shortName: string;
    slogan: string;
    summary: string;
    address?: string | null;
    credentials?: unknown;
    highlights?: unknown;
  };
  campusPhotos: Array<{ id: string; title: string; description?: string | null; url: string; width?: number | null; height?: number | null }>;
  rooms: Array<{
    id: string;
    name: string;
    slug: string;
    summary: string;
    description: string;
    features?: unknown;
    assets: Array<{ id: string; title: string; url: string; description?: string | null }>;
  }>;
  documents: Array<{ id: string; title: string; category: string; summary: string }>;
  devices: Array<{ id: string; code?: string; name: string; classroom?: string; status?: string; mode?: string; battery?: number; temperature?: number; streamUrl?: string | null; description: string }>;
  logs: Array<{ id: string; level: string; message: string; createdAt: string }>;
  commands: Array<{ id: string; type: string; status: string; createdAt: string }>;
};

const fallbackProfile = {
  name: "龙湾区国科温州第二幼儿园",
  shortName: "国科温州二幼",
  slogan: "筑可探之境，润向美童心",
  summary:
    "龙湾区国科温州第二幼儿园以儿童真实生活、科学探究和审美体验为核心，构建可观察、可探索、可表达的学习环境。平台汇聚园所资料、功能室、成长影像与云宝机器能力，服务公开展示、教师管理和家园沟通。",
  address: "浙江省温州市龙湾区",
  credentials: { status: "资料库已同步" },
  highlights: ["科学启蒙", "体验式学习", "智慧校园", "家园共育"],
};

export async function getSiteData(viewerRole?: "USER" | "ADMIN"): Promise<SiteData> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("USER:PASSWORD") || process.env.DATABASE_URL.includes("HOST:PORT")) {
    return getFallbackSiteData(viewerRole);
  }

  try {
    const isAdmin = viewerRole === "ADMIN";
    const documentWhere = isAdmin
      ? {}
      : {
          category: {
            notIn: ["STAFF" as const],
          },
          NOT: [
            { title: { contains: "花名册", mode: "insensitive" as const } },
            { title: { contains: "教职工名单", mode: "insensitive" as const } },
          ],
        };

    const [profile, campusPhotos, rooms, documents, devices, logs, commands] = await Promise.all([
      prisma.schoolProfile.findFirst(),
      prisma.mediaAsset.findMany({ where: { kind: "CAMPUS" }, orderBy: { createdAt: "asc" }, take: 80 }),
      prisma.functionRoom.findMany({ include: { assets: { orderBy: { createdAt: "asc" } } }, orderBy: { sortOrder: "asc" } }),
      prisma.knowledgeDocument.findMany({
        where: documentWhere,
        orderBy: { updatedAt: "desc" },
        take: 36,
        select: { id: true, title: true, category: true, summary: true, content: true },
      }),
      prisma.device.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.deviceLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
      prisma.command.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ]);

    return {
      profile: profile ?? fallbackProfile,
      campusPhotos,
      rooms,
      documents: documents.map((document) => ({
        id: document.id,
        title: document.title,
        category: document.category.toString(),
        summary: document.summary || document.content.slice(0, 900),
      })),
      devices: devices.map((device) =>
        isAdmin
          ? { ...device, status: device.status.toString(), mode: device.mode.toString() }
          : {
              id: device.id,
              name: device.name,
              streamUrl: device.streamUrl,
              description: "云宝用于园所问答、活动陪伴、安全提醒与课程互动。教师管理员登录后可查看实时监控、控制和日志。",
            },
      ),
      logs: isAdmin ? logs.map((log) => ({ id: log.id, level: log.level, message: log.message, createdAt: log.createdAt.toISOString() })) : [],
      commands: isAdmin ? commands.map((command) => ({ id: command.id, type: command.type, status: command.status.toString(), createdAt: command.createdAt.toISOString() })) : [],
    };
  } catch {
    return getFallbackSiteData(viewerRole);
  }
}

function getFallbackSiteData(viewerRole?: "USER" | "ADMIN"): SiteData {
  const isAdmin = viewerRole === "ADMIN";

  return {
    profile: fallbackProfile,
    campusPhotos: campusManifest.map((asset, index) => ({
      id: asset.src,
      title: `成长影像 ${index + 1}`,
      description: "本地素材，等待数据库同步",
      url: asset.src,
      width: asset.width,
      height: asset.height,
    })),
    rooms: roomManifest.map((asset, index) => ({
      id: asset.src,
      name: asset.title || `功能室 ${index + 1}`,
      slug: `room-${index + 1}`,
      summary: "功能室资料等待数据库同步",
      description: "该功能室图片已完成网页资源优化，执行 seed 后会写入数据库并支持管理员维护。",
      features: ["功能室展示"],
      assets: [{ id: asset.src, title: asset.title, url: asset.src, description: asset.original }],
    })),
    documents: [],
    devices: isAdmin
      ? [
          {
            id: "yunbao-local",
            code: "YUNBAO-001",
            name: "云宝一号",
            classroom: "未来工作坊",
            status: "ONLINE",
            mode: "COMPANION",
            battery: 86,
            temperature: 36.4,
            streamUrl: "/rooms/room-04.webp",
            description: "云宝小陪伴机器人用于园所问答、活动陪伴、安全提醒与课程互动。",
          },
        ]
      : [
          {
            id: "yunbao-local",
            name: "云宝一号",
            streamUrl: "/rooms/room-04.webp",
            description: "云宝用于园所问答、活动陪伴、安全提醒与课程互动。教师管理员登录后可查看实时监控、控制和日志。",
          },
        ],
    logs: [],
    commands: [],
  };
}
