import { parentPort } from 'node:worker_threads';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { runSearch } from './search-engine.mjs';
import type { SearchRequest } from './search-types.js';

const WIKIPEDIA_USER_AGENT = 'AIWikipediaSearch/1.0 (https://github.com/joieng1/ai-wikipedia-search)';
const WIKIPEDIA_TIMEOUT_MS = 10000;
const DATABASE_CACHE_KIB = 32768;
const MAX_CACHED_EMBEDDINGS = 10000;
if (process.env.MODEL_CACHE_DIR) env.cacheDir = resolve(process.env.MODEL_CACHE_DIR);
let database: Database.Database | undefined;
let extractor: FeatureExtractionPipeline | undefined;
let loadedModel: string | undefined;
let busy = false;

function getLinks(title: string): { to_page: string; anchor: string }[] {
  if (!database) {
    const databasePath = resolve(process.env.WIKI_DB_PATH || 'my_wiki.db');
    database = new Database(databasePath, { fileMustExist: true, readonly: true });
    // A negative SQLite cache size is KiB; avoid the old million-page cache per connection.
    database.pragma(`cache_size = -${DATABASE_CACHE_KIB}`);
    database.pragma('query_only = ON');
  }
  return database.prepare(`
    SELECT destination.title AS to_page, links.anchor
    FROM pages AS source
    JOIN links ON links.from_id = source.id
    JOIN pages AS destination ON destination.id = links.to_id
    WHERE source.title = ?
  `).all(title) as { to_page: string; anchor: string }[];
}

async function resolveTitle(title: string): Promise<string> {
  const parameters = new URLSearchParams({ action: 'query', titles: title, redirects: 'true', format: 'json' });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${parameters}`, {
    headers: { 'User-Agent': WIKIPEDIA_USER_AGENT },
    signal: AbortSignal.timeout(WIKIPEDIA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Wikipedia API error (${response.status})`);
  const data = await response.json() as {
    query?: { pages?: Record<string, { title: string; missing?: string; pageid?: number }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined || !page.pageid) throw new Error(`Invalid Wikipedia title: ${title}`);
  return page.title;
}

async function loadExtractor(model: string) {
  if (loadedModel === model && extractor) return extractor;
  await extractor?.dispose();
  extractor = undefined;
  loadedModel = undefined;
  extractor = await pipeline('feature-extraction', model);
  loadedModel = model;
  return extractor;
}

async function search(request: SearchRequest) {
  const embeddings = new Map<string, number[]>();
  const featureExtractor = await loadExtractor(request.model);
  async function getEmbedding(title: string) {
    const cached = embeddings.get(title);
    if (cached) return cached;
    const output = await featureExtractor(title, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data, Number);
    if (embeddings.size >= MAX_CACHED_EMBEDDINGS) embeddings.delete(embeddings.keys().next().value!);
    embeddings.set(title, vector);
    return vector;
  }
  for await (const update of runSearch(request, { resolveTitle, getLinks, getEmbedding })) {
    parentPort?.postMessage({ kind: 'update', update });
  }
}

parentPort?.on('message', async (request: SearchRequest) => {
  if (busy) return;
  busy = true;
  try {
    parentPort?.postMessage({ kind: 'update', update: { status: 'Loading model' } });
    await search(request);
  } catch (error) {
    parentPort?.postMessage({ kind: 'update', update: { error: error instanceof Error ? error.message : String(error) } });
  } finally {
    busy = false;
    parentPort?.postMessage({ kind: 'done' });
  }
});
