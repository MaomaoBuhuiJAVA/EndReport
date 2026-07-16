import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import nextEnv from "@next/env";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { loadEnvConfig } = nextEnv;

const root = process.cwd();
loadEnvConfig(root);

const prisma = new PrismaClient();
const extractor = new WordExtractor();

const schoolName = "龙湾区国科温州第二幼儿园";

const categoryRules = [
  [/基本情况/, "BASIC_INFO"],
  [/省二|资质|终极|等级|创建/, "QUALIFICATION"],
  [/荣誉|获奖|汇总表|优秀教师|课题|赛课/, "HONOR"],
  [/课程|学习|指南|纲要|环境|社团|0-8岁/, "COURSE"],
  [/教职工|名单|花名册/, "STAFF"],
  [/发言稿|智慧校园/, "SPEECH"],
  [/conversion-log/i, "ARCHIVE"],
];

const hugeTeacherBookPattern = /教师用书|体验式学习与发展课程教师用书|体验式教师用书/;
const privateArchivePattern = /花名册|班级花名册/;

const structuredKnowledgeDocuments = [
  {
    title: "园所概览结构化资料",
    category: "BASIC_INFO",
    sourcePath: "structured:overview",
    content: `龙湾区国科温州第二幼儿园，又称国科温州二幼、国科二幼。园所围绕“筑可探之境，润向美童心”的办园表达，强调儿童真实生活、科学探究、审美体验和家园共育。
园所概览可重点回答：园所名称、办园理念、课程方向、空间环境、资料建设、智慧校园和家园沟通。网页展示的园所概览应以正式、温和、可信的官方网站语气呈现。
园所资料库目前包含基本情况、省二相关资质资料、教师荣誉与获奖汇总、社团资料、智慧校园发言稿、课程指南与教育纲要、教职工名单索引等。涉及幼儿个人信息的花名册类资料仅建立索引，不公开展开。
当用户询问“这是什么幼儿园”“国科二幼介绍”“园所概览”“基本情况”“资质”等问题时，可以优先引用本条结构化资料，并结合资料库中的《基本情况》《省二终极》等原始资料。`,
  },
  {
    title: "功能室与空间结构化资料",
    category: "BASIC_INFO",
    sourcePath: "structured:rooms",
    content: `园所功能室和空间照片包含：园所全景、园所大厅、建构空间坊、未来工作坊、纵深科学廊、绘本阅读坊等。
园所大厅用于集中展示园所文化、课程成果、儿童作品、家园沟通内容和荣誉资质。
绘本阅读坊支持幼儿沉浸阅读、故事表达、语言发展和亲子共读。
建构空间坊通过积木、结构材料和项目挑战，支持幼儿空间认知、合作探究、计划执行和问题解决。
未来工作坊面向科学启蒙、机器人体验、简单工程挑战和创意制作。
纵深科学廊把走廊转化为可观察、可记录、可交流的科学探索场。
当用户询问“功能室有哪些”“有没有功能室照片”“阅读坊照片”“建构空间”“科学廊”“参观环境”等问题时，应说明页面有相关照片展示，并返回功能室图片。`,
  },
  {
    title: "教师获奖与荣誉结构化摘要",
    category: "HONOR",
    sourcePath: "structured:honors",
    content: `资料库收录了 2022 学年第一学期教师荣誉、2022 学年第二学期教师荣誉、2024 学年第一学期获奖汇总表、2024 学年第二学期获奖汇总表、2025 学年第一学期获奖汇总表等资料。
教师发展资料主要涉及论文、教育叙事、课题研究、公开课、专题讲座、托班环境创设评比、书香班级、养育照护工作评比、园级赛课、幼儿教育教学优质课、心理辅导个案和活动力操舞等类别。
页面可概括呈现“教师获奖情况”“荣誉记录”“教研成果”“课题与赛课”等栏目。用户询问教师获奖、老师荣誉、某学期获奖汇总时，应优先检索获奖汇总表和教师荣誉文档。`,
  },
  {
    title: "课程、社团与学习环境结构化摘要",
    category: "COURSE",
    sourcePath: "structured:course",
    content: `园所课程资料包含《3-6岁儿童学习与发展指南》《幼儿园教育指导纲要》、社团资料、0-8岁儿童学习环境创设以及体验式学习与发展课程教师用书索引。
课程表达可围绕体验式学习、科学探究、功能室课程、绘本阅读、建构活动、社团活动、儿童表达、环境创设和家园共育展开。大体积教师用书只建立索引，不导入全文，以避免网页知识库过重。
用户询问课程、社团、儿童学习、环境创设、教育纲要、指南、活动设计时，应结合课程类资料回答，并说明资料库中有相关文档。`,
  },
  {
    title: "智慧校园与云宝结构化摘要",
    category: "SPEECH",
    sourcePath: "structured:yunbao",
    content: `云宝是面向园所场景的小陪伴机器人。普通用户可查看机器人简介和展示照片，了解其用于园所问答、活动陪伴、安全提醒和课程互动。教师端或管理员登录后，可查看实时监控画面、设备状态、运行日志，并通过 WASD 控制机器人移动。
普通用户不应看到云宝设备状态、监控细节、日志和控制信息。管理员可进入控制台相关区域查看这些信息。用户询问云宝简介时，可以说明其陪伴、问答和课程互动定位；询问控制、监控、日志等敏感信息时，应提示需要管理员权限。`,
  },
];

function categoryFor(name) {
  return categoryRules.find(([regex]) => regex.test(name))?.[1] ?? "ARCHIVE";
}

function shouldSkipHeavyContent(file, size) {
  return hugeTeacherBookPattern.test(file) || size > 60 * 1024 * 1024;
}

function cleanText(text) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractReadableTextFromBinary(filePath) {
  const buffer = fs.readFileSync(filePath);
  const candidates = [buffer.toString("utf16le"), buffer.toString("latin1"), buffer.toString("utf8")];
  const fragments = [];

  for (const candidate of candidates) {
    const matches =
      candidate
        .replace(/[\u0000-\u001f]+/g, " ")
        .match(/[\u4e00-\u9fa5A-Za-z0-9，。；：、“”《》（）\-—·\s]{8,}/g) ?? [];

    for (const match of matches) {
      const normalized = cleanText(match);
      if (/[\u4e00-\u9fa5]/.test(normalized) && normalized.length > 8 && !fragments.includes(normalized)) {
        fragments.push(normalized);
      }
    }
  }

  return cleanText(fragments.join("\n")).slice(0, 30000);
}

async function readDocumentText(filePath, file) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);

  if (shouldSkipHeavyContent(file, stat.size)) {
    return `《${path.parse(file).name}》为大体积教师用书资料，已建立资料索引，未导入全文。可用于标记园所课程资源来源，不作为网页 AI 的公开全文知识库。`;
  }

  if (privateArchivePattern.test(file) && ext === ".zip") {
    return `《${path.parse(file).name}》包含班级花名册等归档资料。为保护幼儿个人信息，系统仅建立资料索引，不展开导入名单正文。`;
  }

  if (ext === ".txt") {
    return cleanText(fs.readFileSync(filePath, "utf8")).slice(0, 30000);
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return cleanText(result.value).slice(0, 30000);
  }

  if (ext === ".xlsx" || ext === ".xls" || ext === ".et") {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const rows = [];

    for (const sheetName of workbook.SheetNames.slice(0, 10)) {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" }).slice(0, 320);
      rows.push(`【${sheetName}】`);
      rows.push(...json.map((row) => row.map((cell) => String(cell).trim()).filter(Boolean).join(" / ")).filter(Boolean));
    }

    return cleanText(rows.join("\n")).slice(0, 40000);
  }

  if (ext === ".doc") {
    try {
      const document = await extractor.extract(filePath);
      const text = cleanText(document.getBody());
      if (text.length > 80) return text.slice(0, 30000);
    } catch {
      const extracted = extractReadableTextFromBinary(filePath);
      if (extracted.length > 80) return extracted;
    }
  }

  if (ext === ".zip") {
    return `《${path.parse(file).name}》为压缩归档资料，系统已按文件名和类别建立资料索引。`;
  }

  return `《${path.parse(file).name}》已建立资料索引，当前格式暂未提取到可检索正文。`;
}

function chunkText(title, content) {
  const normalized = cleanText(content);
  const chunks = [];
  const size = 850;
  const overlap = 120;

  for (let index = 0; index < normalized.length; index += size - overlap) {
    const contentSlice = normalized.slice(index, index + size);
    if (contentSlice.trim().length > 20) {
      chunks.push({
        title: `${title} ${chunks.length + 1}`,
        content: contentSlice,
        keywords: title,
      });
    }
  }

  return chunks.length ? chunks : [{ title, content: `${title} 资料索引`, keywords: title }];
}

async function upsertDocumentFromFile(file) {
  const filePath = path.join(root, "ziliao", file);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;

  const title = path.parse(file).name;
  const fileType = path.extname(file).replace(".", "").toLowerCase() || "file";
  const content = await readDocumentText(filePath, file);
  const category = categoryFor(file);
  const summary = cleanText(content).slice(0, 420) || `${title} 资料索引`;

  const existingDocument = await prisma.knowledgeDocument.findFirst({ where: { sourcePath: file } });
  const document = existingDocument
    ? await prisma.knowledgeDocument.update({
        where: { id: existingDocument.id },
        data: { title, category, summary, content, fileType },
      })
    : await prisma.knowledgeDocument.create({
        data: { title, category, summary, content, fileType, sourcePath: file },
      });

  await prisma.knowledgeChunk.deleteMany({ where: { documentId: document.id } });
  await prisma.knowledgeChunk.createMany({
    data: chunkText(title, content).map((chunk) => ({ ...chunk, documentId: document.id })),
  });

  return document;
}

async function upsertStructuredDocument(item) {
  const summary = cleanText(item.content).slice(0, 420);
  const existingDocument = await prisma.knowledgeDocument.findFirst({ where: { sourcePath: item.sourcePath } });
  const document = existingDocument
    ? await prisma.knowledgeDocument.update({
        where: { id: existingDocument.id },
        data: { title: item.title, category: item.category, summary, content: item.content, fileType: "structured" },
      })
    : await prisma.knowledgeDocument.create({
        data: { title: item.title, category: item.category, summary, content: item.content, fileType: "structured", sourcePath: item.sourcePath },
      });

  await prisma.knowledgeChunk.deleteMany({ where: { documentId: document.id } });
  await prisma.knowledgeChunk.createMany({
    data: chunkText(item.title, item.content).map((chunk) => ({
      ...chunk,
      keywords: `${item.title} ${item.sourcePath}`,
      documentId: document.id,
    })),
  });

  return document;
}

async function seedUsers() {
  const adminPassword = await bcrypt.hash("admin123456", 10);
  const userPassword = await bcrypt.hash("user123456", 10);

  await prisma.user.upsert({
    where: { email: "admin@gk2y.local" },
    update: { name: "管理员", role: "ADMIN" },
    create: {
      name: "管理员",
      email: "admin@gk2y.local",
      role: "ADMIN",
      passwordHash: adminPassword,
    },
  });

  await prisma.user.upsert({
    where: { email: "user@gk2y.local" },
    update: { name: "普通用户", role: "USER" },
    create: {
      name: "普通用户",
      email: "user@gk2y.local",
      role: "USER",
      passwordHash: userPassword,
    },
  });
}

async function seedProfile() {
  const profile = {
    name: schoolName,
    shortName: "国科温州二幼",
    slogan: "筑可探之境，润向美童心",
    summary:
      "龙湾区国科温州第二幼儿园以儿童真实生活、科学探究和审美体验为核心，建设可观察、可探索、可表达的学习环境。平台汇聚园所资料、功能室、成长影像与云宝机器人能力，服务公开展示、教师管理和家园沟通。",
    address: "浙江省温州市龙湾区",
    credentials: {
      level: "园所资质与荣誉资料已入库",
      source: "ziliao 文件夹",
    },
    highlights: ["科学启蒙", "体验式学习", "功能室课程", "智慧校园", "家园共育"],
  };

  await prisma.schoolProfile.upsert({
    where: { name: schoolName },
    update: profile,
    create: profile,
  });
}

async function seedRooms() {
  const roomManifestPath = path.join(root, "public", "rooms", "manifest.json");
  const roomManifest = fs.existsSync(roomManifestPath) ? JSON.parse(fs.readFileSync(roomManifestPath, "utf8")) : [];
  const roomDescriptions = [
    {
      match: "大厅",
      name: "园所大厅",
      slug: "lobby",
      summary: "集中展示园所文化、课程成果与儿童作品。",
      description: "大厅作为家园沟通与园所形象展示入口，适合呈现办园理念、活动掠影、课程成果和荣誉资质。",
      features: ["形象展示", "家园沟通", "荣誉墙"],
    },
    {
      match: "绘本",
      name: "绘本阅读坊",
      slug: "reading-room",
      summary: "支持幼儿沉浸阅读、故事表达与语言发展。",
      description: "绘本阅读坊以安静、舒展、可交流的空间支持幼儿阅读兴趣、讲述表达和科学阅读活动。",
      features: ["绘本阅读", "故事表达", "亲子共读"],
    },
    {
      match: "建构",
      name: "建构空间坊",
      slug: "construction-room",
      summary: "鼓励幼儿通过材料搭建发展空间认知和合作能力。",
      description: "建构空间坊提供积木、结构材料与项目式挑战任务，让幼儿在搭建中形成计划、协作和问题解决经验。",
      features: ["空间建构", "合作探究", "项目挑战"],
    },
    {
      match: "未来",
      name: "未来工作坊",
      slug: "future-lab",
      summary: "融合科学启蒙、机器人体验与创造性表达。",
      description: "未来工作坊面向科学探究和智慧校园体验，承载机器人互动、简单工程挑战和创意制作。",
      features: ["科学启蒙", "机器人体验", "创意制作"],
    },
    {
      match: "科学",
      name: "纵深科学廊",
      slug: "science-corridor",
      summary: "把走廊变成可观察、可记录、可交流的科学探索场。",
      description: "纵深科学廊通过可视化材料、观察点和互动墙面，鼓励幼儿在日常行走中持续发现和提问。",
      features: ["自然观察", "科学记录", "互动展示"],
    },
    {
      match: "全景",
      name: "园所全景",
      slug: "panorama",
      summary: "展示园所整体环境与空间布局。",
      description: "全景资料用于帮助访客快速理解园所空间关系、功能室分布和整体环境风貌。",
      features: ["空间导览", "环境展示"],
    },
  ];

  const usedSlugs = new Map();
  for (let index = 0; index < roomManifest.length; index += 1) {
    const asset = roomManifest[index];
    const info = roomDescriptions.find((item) => asset.original.includes(item.match)) ?? roomDescriptions[index % roomDescriptions.length];
    const slugCount = usedSlugs.get(info.slug) ?? 0;
    usedSlugs.set(info.slug, slugCount + 1);
    const slug = slugCount === 0 ? info.slug : `${info.slug}-${slugCount + 1}`;
    const name = slugCount === 0 ? info.name : `${info.name}${slugCount + 1}`;

    const room = await prisma.functionRoom.upsert({
      where: { slug },
      update: { name, summary: info.summary, description: info.description, features: info.features, sortOrder: index },
      create: { name, slug, summary: info.summary, description: info.description, features: info.features, sortOrder: index },
    });

    await prisma.mediaAsset.upsert({
      where: { url: asset.src },
      update: { title: name, description: info.summary, kind: "ROOM", roomId: room.id, sourcePath: asset.original, width: asset.width, height: asset.height },
      create: {
        title: name,
        description: info.summary,
        kind: "ROOM",
        url: asset.src,
        sourcePath: asset.original,
        width: asset.width,
        height: asset.height,
        roomId: room.id,
        mimeType: "image/webp",
      },
    });
  }
}

async function seedCampusPhotos() {
  const campusManifestPath = path.join(root, "public", "gallery", "manifest.json");
  const campusManifest = fs.existsSync(campusManifestPath) ? JSON.parse(fs.readFileSync(campusManifestPath, "utf8")) : [];

  for (let index = 0; index < campusManifest.length; index += 1) {
    const asset = campusManifest[index];
    await prisma.mediaAsset.upsert({
      where: { url: asset.src },
      update: { title: `成长影像 ${index + 1}`, description: "龙湾区国科温州第二幼儿园活动照片", kind: "CAMPUS", sourcePath: asset.original, width: asset.width, height: asset.height },
      create: {
        title: `成长影像 ${index + 1}`,
        description: "龙湾区国科温州第二幼儿园活动照片",
        kind: "CAMPUS",
        url: asset.src,
        sourcePath: asset.original,
        width: asset.width,
        height: asset.height,
        mimeType: "image/webp",
      },
    });
  }
}

async function seedDocuments() {
  const ziliaoDir = path.join(root, "ziliao");
  const files = fs.existsSync(ziliaoDir)
    ? fs
        .readdirSync(ziliaoDir)
        .filter((file) => fs.statSync(path.join(ziliaoDir, file)).isFile())
        .filter((file) => file !== "conversion-log.txt")
        .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
    : [];

  const sourcePaths = new Set([...files, ...structuredKnowledgeDocuments.map((item) => item.sourcePath)]);
  const staleDocuments = await prisma.knowledgeDocument.findMany({
    where: { sourcePath: { not: null } },
    select: { id: true, sourcePath: true },
  });

  for (const document of staleDocuments) {
    if (document.sourcePath && !sourcePaths.has(document.sourcePath)) {
      await prisma.knowledgeDocument.delete({ where: { id: document.id } });
    }
  }

  const imported = [];
  for (const file of files) {
    const document = await upsertDocumentFromFile(file);
    if (document) imported.push(file);
  }

  for (const item of structuredKnowledgeDocuments) {
    await upsertStructuredDocument(item);
  }

  return imported;
}

async function seedDevice() {
  const device = await prisma.device.upsert({
    where: { code: "YUNBAO-001" },
    update: {
      name: "云宝一号",
      classroom: "未来工作坊",
      streamUrl: "/rooms/room-04.webp",
      description:
        "云宝小陪伴机器人面向教师端提供实时监控、WASD 操控、校园问答、活动陪伴和运行日志能力；普通用户可查看简介与展示影像。",
    },
    create: {
      code: "YUNBAO-001",
      name: "云宝一号",
      classroom: "未来工作坊",
      mode: "COMPANION",
      status: "ONLINE",
      battery: 86,
      temperature: 36.4,
      streamUrl: "/rooms/room-04.webp",
      description:
        "云宝小陪伴机器人面向教师端提供实时监控、WASD 操控、校园问答、活动陪伴和运行日志能力；普通用户可查看简介与展示影像。",
    },
  });

  const existingTasks = await prisma.learningTask.count({ where: { deviceId: device.id } });
  if (existingTasks === 0) {
    await prisma.learningTask.createMany({
      data: [
        {
          deviceId: device.id,
          title: "晨间问候与情绪识别",
          type: "CAMPUS_QA",
          content: "面向入园晨间场景，辅助教师完成问候、情绪观察与安全提醒。",
          schedule: "08:30",
          progress: 82,
        },
        {
          deviceId: device.id,
          title: "科学阅读：彩虹桥实验",
          type: "STORY",
          content: "围绕科学阅读和动手体验组织机器人互动话术。",
          schedule: "10:15",
          progress: 45,
        },
      ],
    });
  }

  const existingLogs = await prisma.deviceLog.count({ where: { deviceId: device.id } });
  if (existingLogs === 0) {
    await prisma.deviceLog.createMany({
      data: [
        { deviceId: device.id, level: "info", message: "云宝一号已接入教师端控制台。" },
        { deviceId: device.id, level: "info", message: "实时监控画面已绑定功能室展示源。" },
      ],
    });
  }
}

async function main() {
  await seedUsers();
  await seedProfile();
  await seedRooms();
  await seedCampusPhotos();
  const imported = await seedDocuments();
  await seedDevice();

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.mediaAsset.count(),
    prisma.functionRoom.count(),
    prisma.knowledgeDocument.count(),
    prisma.knowledgeChunk.count(),
  ]);

  console.log("seed complete", {
    users: counts[0],
    media: counts[1],
    rooms: counts[2],
    documents: counts[3],
    chunks: counts[4],
    importedDocuments: imported.length,
  });
  console.log("admin: admin@gk2y.local / admin123456");
  console.log("user: user@gk2y.local / user123456");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
