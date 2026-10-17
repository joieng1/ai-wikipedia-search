import { resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { createSearchPool, SearchBusyError } from '@/lib/search-pool';

export const runtime = 'nodejs';
export const maxDuration = 65;

const SEARCH_TIMEOUT_MS = 60000;
const DEFAULT_SEARCH_WORKERS = 2;
const MAX_SEARCH_WORKERS = 8;
const MAX_TITLE_LENGTH = 255;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MODELS: Record<string, string> = {
  '0': 'Xenova/all-MiniLM-L6-v2',
  '1': 'Xenova/GIST-small-Embedding-v0',
  '2': 'Romelianism/MedEmbed-small-v0.1',
};
const rateLimitMap = new Map<string, number[]>();
const requestedWorkers = Number(process.env.SEARCH_MAX_WORKERS ?? DEFAULT_SEARCH_WORKERS);
const maxWorkers = Number.isInteger(requestedWorkers) && requestedWorkers > 0
  ? Math.min(requestedWorkers, MAX_SEARCH_WORKERS) : DEFAULT_SEARCH_WORKERS;

// Reuse the pool across development reloads so each reload cannot multiply native workers.
const searchGlobal = globalThis as typeof globalThis & {
  wikipediaSearchPool?: ReturnType<typeof createSearchPool>;
};
const pool = searchGlobal.wikipediaSearchPool ??= createSearchPool({
  workerPath: resolve(process.cwd(), 'dist/workers/search.worker.mjs'),
  maxWorkers,
  timeoutMs: SEARCH_TIMEOUT_MS,
});

function isRateLimited(req: NextRequest): boolean {
  const clientIP = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
    || req.headers.get('x-real-ip') || 'local';
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap) {
    if (now - timestamps[timestamps.length - 1] >= RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(ip);
  }
  const recent = (rateLimitMap.get(clientIP) ?? []).filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) return true;
  rateLimitMap.set(clientIP, [...recent, now]);
  return false;
}

export async function GET(req: NextRequest) {
  const startWord = req.nextUrl.searchParams.get('startWord')?.trim();
  const endWord = req.nextUrl.searchParams.get('endWord')?.trim();
  const modelParam = req.nextUrl.searchParams.get('model') ?? '';
  const model = Object.hasOwn(MODELS, modelParam) ? MODELS[modelParam] : undefined;
  if (!model) return NextResponse.json({ error: 'Invalid model parameter' }, { status: 400 });
  if (!startWord || !endWord || startWord.length > MAX_TITLE_LENGTH || endWord.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: 'Provide start and target titles of 1–255 characters' }, { status: 400 });
  }
  if (isRateLimited(req)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    return new Response(pool.start({ startWord, endWord, model }, req.signal), {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (error instanceof SearchBusyError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: { 'Retry-After': '5' } });
    }
    console.error('Failed to start search worker', error);
    return NextResponse.json({ error: 'Failed to start search' }, { status: 500 });
  }
}
