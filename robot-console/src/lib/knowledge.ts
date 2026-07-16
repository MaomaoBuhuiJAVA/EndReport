import type { KnowledgeItem } from '../types';

let knowledgePromise: Promise<KnowledgeItem[]> | null = null;

async function requestKnowledge(url: string): Promise<KnowledgeItem[]> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Knowledge request failed: ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.items;
}

export function loadKnowledge(): Promise<KnowledgeItem[]> {
  if (!knowledgePromise) {
    knowledgePromise = requestKnowledge('/api/resources').catch(() =>
      requestKnowledge('/data/knowledge.json'),
    );
  }
  return knowledgePromise;
}

export function getPublicImages(item: KnowledgeItem) {
  return item.resources.filter(
    (resource) => resource.type === '图片资源' && resource.isPublic && resource.publicPath,
  );
}
