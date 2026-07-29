import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

dotenv.config({ path: path.resolve('.env.local') });

const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = postgres(databaseUrl, { ssl: 'require', max: 1, connect_timeout: 20 });
const data = JSON.parse(await fs.readFile(path.resolve('src/data/science-knowledge.json'), 'utf8'));

const resources = new Map();
for (const item of data) {
  for (const resource of item.resources) resources.set(resource.id, resource);
}

await sql`
  CREATE TABLE IF NOT EXISTS knowledge_items (
    id text PRIMARY KEY,
    base_id text NOT NULL,
    semester text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    age_label text NOT NULL DEFAULT '',
    topic text NOT NULL DEFAULT '',
    author text NOT NULL DEFAULT '',
    source_file text NOT NULL DEFAULT '',
    source_page text NOT NULL DEFAULT '',
    allocation_basis text NOT NULL DEFAULT '',
    tags text[] NOT NULL DEFAULT '{}',
    ingest_status text NOT NULL DEFAULT '',
    duplicate_of text NOT NULL DEFAULT '',
    knowledge_file text NOT NULL DEFAULT '',
    image_count integer NOT NULL DEFAULT 0,
    video_url text NOT NULL DEFAULT '',
    excerpt text NOT NULL DEFAULT '',
    body text NOT NULL DEFAULT '',
    sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS knowledge_resources (
    id text PRIMARY KEY,
    resource_type text NOT NULL,
    knowledge_base_id text NOT NULL,
    semester text NOT NULL,
    title text NOT NULL,
    file_path text NOT NULL DEFAULT '',
    public_path text NOT NULL DEFAULT '',
    external_url text NOT NULL DEFAULT '',
    source text NOT NULL DEFAULT '',
    is_public boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`CREATE INDEX IF NOT EXISTS knowledge_items_filters_idx ON knowledge_items (semester, category)`;
await sql`CREATE INDEX IF NOT EXISTS knowledge_items_navigation_idx ON knowledge_items (category, topic, age_label)`;
await sql`CREATE INDEX IF NOT EXISTS knowledge_resources_lookup_idx ON knowledge_resources (knowledge_base_id, resource_type, is_public)`;

const itemPayload = data.map((item, index) => ({ ...item, sortOrder: index }));
const resourcePayload = [...resources.values()].map((resource, index) => ({ ...resource, sortOrder: index }));
await sql.begin(async (transaction) => {
  await transaction`DELETE FROM knowledge_resources`;
  await transaction`DELETE FROM knowledge_items`;

  await transaction`
    INSERT INTO knowledge_items (
      id, base_id, semester, category, title, age_label, topic, author, source_file,
      source_page, allocation_basis, tags, ingest_status, duplicate_of, knowledge_file,
      image_count, video_url, excerpt, body, sort_order, updated_at
    )
    SELECT
      x.id, x."baseId", x.semester, x.category, x.title, x."ageLabel", x.topic, x.author,
      x."sourceFile", x."sourcePage", x."allocationBasis", x.tags, x."ingestStatus",
      x."duplicateOf", x."knowledgeFile", x."imageCount", x."videoUrl", x.excerpt, x.body,
      x."sortOrder", now()
    FROM jsonb_to_recordset(${transaction.json(itemPayload)}) AS x(
      id text, "baseId" text, semester text, category text, title text, "ageLabel" text,
      topic text, author text, "sourceFile" text, "sourcePage" text, "allocationBasis" text,
      tags text[], "ingestStatus" text, "duplicateOf" text, "knowledgeFile" text,
      "imageCount" integer, "videoUrl" text, excerpt text, body text, "sortOrder" integer
    )
  `;

  await transaction`
    INSERT INTO knowledge_resources (
      id, resource_type, knowledge_base_id, semester, title, file_path, public_path,
      external_url, source, is_public, sort_order, updated_at
    )
    SELECT
      x.id, x.type, x."knowledgeBaseId", x.semester, x.title, x."filePath", x."publicPath",
      x."externalUrl", x.source, x."isPublic", x."sortOrder", now()
    FROM jsonb_to_recordset(${transaction.json(resourcePayload)}) AS x(
      id text, type text, "knowledgeBaseId" text, semester text, title text, "filePath" text,
      "publicPath" text, "externalUrl" text, source text, "isPublic" boolean, "sortOrder" integer
    )
  `;
});

const [counts] = await sql`
  SELECT
    (SELECT count(*)::int FROM knowledge_items) AS knowledge_items,
    (SELECT count(*)::int FROM knowledge_resources) AS resources,
    (SELECT count(*)::int FROM knowledge_resources WHERE resource_type = '图片资源' AND is_public = false) AS restricted_images
`;
console.log(JSON.stringify(counts));
await sql.end();
