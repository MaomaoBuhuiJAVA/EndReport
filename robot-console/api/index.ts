import { CozeAPI, COZE_CN_BASE_URL, RoleType } from '@coze/api';
import { neon } from '@neondatabase/serverless';
import express from 'express';
import fallbackKnowledgeJson from '../public/data/knowledge.json';

const app = express();
app.use(express.json({ limit: '64kb' }));

const BOT_ID = process.env.COZE_BOT_ID || '7623419481909542946';
const fallbackKnowledge = fallbackKnowledgeJson as unknown as ReturnType<typeof mapKnowledge>[];
let sqlClient: ReturnType<typeof neon> | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  if (!sqlClient) sqlClient = neon(databaseUrl);
  return sqlClient;
}

interface DatabaseKnowledgeRow {
  id: string;
  base_id: string;
  semester: string;
  category: string;
  title: string;
  age_label: string;
  topic: string;
  author: string;
  source_file: string;
  source_page: string;
  allocation_basis: string;
  tags: string[];
  ingest_status: string;
  duplicate_of: string;
  knowledge_file: string;
  image_count: number;
  video_url: string;
  excerpt: string;
  body: string;
  resources: Array<{
    id: string;
    type: string;
    knowledgeBaseId: string;
    semester: string;
    title: string;
    filePath: string;
    publicPath: string;
    externalUrl: string;
    source: string;
    isPublic: boolean;
  }>;
}

function mapKnowledge(row: DatabaseKnowledgeRow) {
  const resources = Array.isArray(row.resources) ? row.resources : [];
  const resourceTypes = new Set(resources.map((resource) => resource.type));
  if (row.category === '科学实验（教师版）') resourceTypes.add('教案资源');
  return {
    id: row.id,
    baseId: row.base_id,
    semester: row.semester,
    category: row.category,
    title: row.title,
    ageLabel: row.age_label,
    topic: row.topic,
    author: row.author,
    sourceFile: row.source_file,
    sourcePage: row.source_page,
    allocationBasis: row.allocation_basis,
    tags: row.tags ?? [],
    ingestStatus: row.ingest_status,
    duplicateOf: row.duplicate_of,
    knowledgeFile: row.knowledge_file,
    imageCount: row.image_count,
    videoUrl: row.video_url,
    excerpt: row.excerpt,
    body: row.body,
    resourceTypes: [...resourceTypes].sort(),
    resources,
  };
}

const RESOURCE_QUERY = `
  SELECT k.*,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'type', r.resource_type,
          'knowledgeBaseId', r.knowledge_base_id,
          'semester', r.semester,
          'title', r.title,
          'filePath', r.file_path,
          'publicPath', r.public_path,
          'externalUrl', r.external_url,
          'source', r.source,
          'isPublic', r.is_public
        ) ORDER BY r.sort_order
      ) FILTER (
        WHERE r.id IS NOT NULL
          AND (r.resource_type <> '图片资源' OR r.is_public = true)
      ),
      '[]'::jsonb
    ) AS resources
  FROM knowledge_items k
  LEFT JOIN knowledge_resources r ON r.knowledge_base_id = k.base_id
  GROUP BY k.id
  ORDER BY k.sort_order
`;

app.get('/api/health', async (_req, res) => {
  try {
    const sql = getSql();
    const countRows = (await sql`SELECT
      (SELECT count(*)::int FROM knowledge_items) AS knowledge_count,
      (SELECT count(*)::int FROM knowledge_resources) AS resource_count`) as unknown as Array<{
        knowledge_count: number;
        resource_count: number;
      }>;
    const counts = countRows[0];
    res.json({ ok: true, database: counts });
  } catch (error) {
    res.status(503).json({ ok: false, error: error instanceof Error ? error.message : 'Database unavailable' });
  }
});

app.get('/api/resources', async (_req, res) => {
  try {
    const sql = getSql();
    const result = await sql.query(RESOURCE_QUERY);
    const rows = (Array.isArray(result) ? result : result.rows) as DatabaseKnowledgeRow[];
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.json(rows.map(mapKnowledge));
  } catch (error) {
    console.error('Knowledge query failed:', error);
    res.setHeader('X-Knowledge-Source', 'static-fallback');
    res.json(fallbackKnowledge);
  }
});

function makeSearchTokens(input: string) {
  const normalized = input.toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
  const tokens = new Set<string>();
  for (const token of input.toLocaleLowerCase('zh-CN').match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu) ?? []) {
    tokens.add(token);
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      for (let index = 0; index < token.length - 1; index += 1) tokens.add(token.slice(index, index + 2));
    }
  }
  if (normalized.length >= 2) tokens.add(normalized);
  return [...tokens].filter((token) => token.length >= 2);
}

type SearchKnowledgeRow = {
  id: string;
  semester: string;
  category: string;
  title: string;
  author: string;
  body: string;
};

function rankKnowledge(rows: SearchKnowledgeRow[], question: string) {
    const normalizedQuestion = question.toLocaleLowerCase('zh-CN');
    const tokens = makeSearchTokens(question);
    return rows
      .map((row) => {
        const title = row.title.toLocaleLowerCase('zh-CN');
        const searchable = `${row.semester} ${row.category} ${row.title} ${row.author} ${row.body}`.toLocaleLowerCase('zh-CN');
        let score = normalizedQuestion.includes(title) || title.includes(normalizedQuestion) ? 30 : 0;
        for (const token of tokens) {
          if (title.includes(token)) score += 8;
          else if (searchable.includes(token)) score += 1;
        }
        return { ...row, score };
      })
      .filter((row) => row.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
}

async function retrieveKnowledge(question: string) {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, semester, category, title, author, body
      FROM knowledge_items
      WHERE ingest_status = '入库'
      ORDER BY sort_order
    `) as unknown as SearchKnowledgeRow[];
    return rankKnowledge(rows, question);
  } catch (error) {
    console.error('Knowledge retrieval failed:', error);
    return rankKnowledge(
      fallbackKnowledge.map(({ id, semester, category, title, author, body }) => ({
        id,
        semester,
        category,
        title,
        author,
        body,
      })),
      question,
    );
  }
}

function localKnowledgeAnswer(matches: Awaited<ReturnType<typeof retrieveKnowledge>>) {
  if (matches.length === 0) {
    return '我暂时没有在园本科学知识库中找到直接对应的资料。你可以告诉我年龄班、实验名称或想了解的科学现象，我再帮你缩小范围。';
  }
  const [first, ...rest] = matches;
  const excerpt = first.body.replace(/\n{3,}/g, '\n\n').slice(0, 850);
  const related = rest.length ? `\n\n还可以继续查看：${rest.map((item) => `《${item.title}》`).join('、')}。` : '';
  return `我在园本知识库中找到了 **《${first.title}》**（${first.semester} · ${first.category}）：\n\n${excerpt}${related}`;
}

function objectStringToText(content: string) {
  try {
    const items = JSON.parse(content) as Array<{ type?: string; text?: string }>;
    return items.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('');
  } catch {
    return '';
  }
}

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const userId = typeof req.body?.userId === 'string'
    ? req.body.userId
    : `pet_${Math.random().toString(36).slice(2, 10)}`;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const matches = await retrieveKnowledge(message);
  const token = process.env.COZE_API_TOKEN;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

  if (!token) {
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: localKnowledgeAnswer(matches) })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    return res.end();
  }

  const context = matches
    .map((item) => `【${item.semester}｜${item.category}｜${item.title}】\n${item.body.slice(0, 2600)}`)
    .join('\n\n');
  const groundedPrompt = context
    ? `请优先依据下列国科二幼园本知识库资料回答；资料未覆盖的内容要明确说明，不要编造。\n\n${context}\n\n用户问题：${message}`
    : message;

  try {
    const client = new CozeAPI({ token, baseURL: COZE_CN_BASE_URL });
    const stream = await client.chat.stream({
      bot_id: BOT_ID,
      user_id: userId,
      additional_messages: [{ role: RoleType.User, content: groundedPrompt, content_type: 'text' }],
      auto_save_history: true,
    });
    let failed = false;

    for await (const part of stream) {
      if (part.event === 'conversation.message.delta') {
        if (part.data.role === RoleType.Assistant && part.data.type === 'answer' && part.data.content_type !== 'object_string' && part.data.content) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: part.data.content })}\n\n`);
        }
      } else if (part.event === 'conversation.message.completed') {
        if (part.data.role === RoleType.Assistant && part.data.type === 'answer' && part.data.content_type === 'object_string') {
          const text = objectStringToText(part.data.content);
          if (text) res.write(`data: ${JSON.stringify({ type: 'replace', content: text })}\n\n`);
        }
      } else if (part.event === 'error' || part.event === 'conversation.chat.failed') {
        failed = true;
        res.write(`data: ${JSON.stringify({ type: 'error', error: '科小贝暂时无法回答，请稍后重试。' })}\n\n`);
        break;
      }
    }
    if (!failed) res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (error) {
    console.error('Coze API error:', error);
    res.write(`data: ${JSON.stringify({ type: 'replace', content: localKnowledgeAnswer(matches) })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  }
  return res.end();
});

export default app;
