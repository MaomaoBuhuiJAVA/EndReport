import {readFile} from "node:fs/promises";
import path from "node:path";
import {loadNativeUploadEnv} from "./lib/native-uploads.mjs";
import {planScienceMediaSync, applyScienceMediaSync} from "./lib/science-media-sync.mjs";

const ids = process.argv.filter(arg => arg.startsWith("--item=")).flatMap(arg => arg.slice(7).split(",")).filter(Boolean);
const apply = process.argv.includes("--apply");
await loadNativeUploadEnv();
const explicitCatalog = process.argv.find(arg => arg.startsWith("--catalog="))?.slice(10);
const catalogPath = path.resolve(explicitCatalog || process.env.SCIENCE_CATALOG_PATH || "src/data/science-knowledge.json");
const plans = planScienceMediaSync(JSON.parse(await readFile(catalogPath, "utf8")), ids);

if (!apply) {
  console.log(JSON.stringify({applied: false, plans, next: "确认这些资料 ID 与目标数据库后，添加 --apply 执行定向媒体登记；不需要全量 seed。"}, null, 2));
} else {
  let database;
  try {database = new URL(process.env.DATABASE_URL ?? "");} catch {throw new Error("Configure the intended PostgreSQL DATABASE_URL before applying");}
  if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
  const {PrismaClient} = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    const result = await applyScienceMediaSync(client, plans);
    console.log(JSON.stringify({applied: true, ...result, itemIds: ids}));
  } finally {await client.$disconnect();}
}
