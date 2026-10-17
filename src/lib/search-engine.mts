import { PriorityQueue } from './PriorityQueue.js';
import type { SearchRequest, SearchStep, SearchUpdate } from './search-types.js';

const PROGRESS_INTERVAL_MS = 1000;
const MAX_QUEUED_PAGES = 50000;

interface SearchLink { to_page: string; anchor: string; }
export interface SearchDependencies {
  resolveTitle: (title: string) => Promise<string>;
  getLinks: (title: string) => SearchLink[];
  getEmbedding: (title: string) => Promise<number[]>;
}
interface SearchNode { word: string; path: SearchStep[]; }

function similarity(first: number[], second: number[]): number {
  // The extractor returns normalized vectors, so cosine similarity is their dot product.
  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

async function* findPath(
  start: string, target: string, dependencies: SearchDependencies, startedAt: number,
): AsyncGenerator<SearchUpdate> {
  const queue = new PriorityQueue<SearchNode>();
  const discovered = new Set([start]);
  let queuedPages = 1;
  let lastProgressAt = startedAt;
  queue.enqueue({ word: start, path: [{ href: start, text: start, origin: '' }] }, 0);

  while (!queue.isEmpty()) {
    const { word, path } = queue.dequeue()!;
    queuedPages--;
    const time = (Date.now() - startedAt) / 1000;
    yield { path, time, finished: word === target };
    if (word === target) return;
    const links = dependencies.getLinks(word);
    const direct = links.find(link => link.to_page === target);
    if (direct) {
      yield { path: [...path, { href: target, text: direct.anchor, origin: word }], time, finished: true };
      return;
    }
    if (links.length === 0) continue;
    const targetEmbedding = await dependencies.getEmbedding(target);
    for (const link of links) {
      if (discovered.has(link.to_page)) continue;
      if (queuedPages >= MAX_QUEUED_PAGES) throw new Error('Search exceeded the page queue limit');
      discovered.add(link.to_page);
      const embedding = await dependencies.getEmbedding(link.to_page);
      queue.enqueue({
        word: link.to_page,
        path: [...path, { href: link.to_page, text: link.anchor, origin: word }],
      }, similarity(embedding, targetEmbedding));
      queuedPages++;
      if (Date.now() - lastProgressAt >= PROGRESS_INTERVAL_MS) {
        lastProgressAt = Date.now();
        yield { path, time: (lastProgressAt - startedAt) / 1000 };
      }
    }
  }
  yield { error: 'No path to target page found. The target may not be reachable.' };
}

interface DirectionResult {
  direction: 'forward' | 'backward';
  result: IteratorResult<SearchUpdate>;
}

/** Each direction publishes independently; a slow expansion cannot hide the other result. */
export async function* runSearch(
  request: SearchRequest, dependencies: SearchDependencies,
): AsyncGenerator<SearchUpdate> {
  const startedAt = Date.now();
  const [start, target] = await Promise.all([
    dependencies.resolveTitle(request.startWord), dependencies.resolveTitle(request.endWord),
  ]);
  const iterators = {
    forward: findPath(start, target, dependencies, startedAt),
    backward: findPath(target, start, dependencies, startedAt),
  };
  const pending = new Map<string, Promise<DirectionResult>>();
  function advance(direction: 'forward' | 'backward') {
    pending.set(direction, iterators[direction].next()
      .then(result => ({ direction, result }))
      .catch(error => ({ direction, result: { done: false, value: { error: String(error) } } })));
  }
  advance('forward');
  advance('backward');
  while (pending.size > 0) {
    const { direction, result } = await Promise.race(pending.values());
    pending.delete(direction);
    if (result.done) continue;
    yield { direction, ...result.value };
    if (!result.value.finished && !result.value.error) advance(direction);
  }
}
