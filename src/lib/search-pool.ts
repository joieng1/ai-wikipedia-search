import { Worker } from 'node:worker_threads';
import { SearchRequest, WorkerMessage } from './search-types.js';

const MAX_BUFFERED_UPDATES = 64;

interface PoolOptions {
  workerPath: string | URL;
  maxWorkers: number;
  timeoutMs: number;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  stop?: (cancelled?: boolean) => void;
}

export class SearchBusyError extends Error {
  constructor() { super('Search server is busy. Please try again shortly.'); }
}

/** A slot runs one search; native inference never runs on the HTTP thread. */
export function createSearchPool(options: PoolOptions) {
  const slots = new Set<WorkerSlot>();
  let closed = false;

  function acquire(): WorkerSlot {
    if (closed) throw new Error('Search pool is closed');
    const idle = [...slots].find(slot => !slot.busy);
    if (idle) { idle.busy = true; return idle; }
    if (slots.size >= options.maxWorkers) throw new SearchBusyError();
    const slot = { worker: new Worker(options.workerPath), busy: true };
    // Idle workers must not keep the server process alive.
    slot.worker.on('error', () => { slots.delete(slot); });
    slot.worker.on('exit', () => { slots.delete(slot); });
    slots.add(slot);
    return slot;
  }

  function start(request: SearchRequest, signal?: AbortSignal): ReadableStream<Uint8Array> {
    const slot = acquire();
    const encoder = new TextEncoder();
    let stopRequest: WorkerSlot['stop'];
    slot.worker.ref();

    return new ReadableStream<Uint8Array>({
      start(controller) {
        let ended = false;
        const timeout = setTimeout(() => finish('Exceeded maximum duration', true), options.timeoutMs);

        function cleanup() {
          clearTimeout(timeout);
          signal?.removeEventListener('abort', abort);
          slot.worker.off('message', onMessage);
          slot.worker.off('error', onError);
          slot.worker.off('exit', onExit);
          slot.stop = undefined;
        }

        function finish(error?: string, terminate = false, cancelled = false) {
          if (ended) return;
          ended = true;
          cleanup();
          if (error) controller.enqueue(encoder.encode(JSON.stringify({ error }) + '\n'));
          if (!cancelled) controller.close();
          if (terminate) {
            // Keep capacity reserved until native work has actually stopped.
            void slot.worker.terminate().finally(() => slots.delete(slot));
          } else {
            slot.busy = false;
            slot.worker.unref();
          }
        }

        function abort() { finish(undefined, true); }
        function onError(error: Error) { finish(error.message, true); }
        function onExit(code: number) { finish(`Search worker exited unexpectedly (${code})`, true); }
        function onMessage(message: WorkerMessage) {
          if (message.kind === 'done') { finish(); return; }
          if (message.kind !== 'update' || !message.update) {
            finish('Invalid search worker response', true);
            return;
          }
          if ((controller.desiredSize ?? 0) <= -MAX_BUFFERED_UPDATES) {
            finish('Search client is too slow to receive updates', true);
            return;
          }
          controller.enqueue(encoder.encode(JSON.stringify(message.update) + '\n'));
        }

        stopRequest = (cancelled = false) => finish(undefined, true, cancelled);
        slot.stop = stopRequest;
        slot.worker.on('message', onMessage);
        slot.worker.once('error', onError);
        slot.worker.once('exit', onExit);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        slot.worker.postMessage(request);
      },
      cancel() { stopRequest?.(true); },
    });
  }

  async function close() {
    closed = true;
    await Promise.all([...slots].map(async slot => {
      slot.stop?.();
      await slot.worker.terminate();
    }));
    slots.clear();
  }

  return { start, close };
}
