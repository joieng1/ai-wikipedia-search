import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { access } from 'node:fs/promises';
import { test } from 'node:test';
import { createSearchPool, SearchBusyError } from '../dist/workers/search-pool.js';

const WORKER_SLOT_WAIT_MS = 2000;
const WORKER_SLOT_POLL_INTERVAL_MS = 10;
const REGRESSION_READ_TIMEOUT_MS = 2000;
const workerPath = new URL('./fixtures/search.worker.mjs', import.meta.url);
const request = { startWord: 'cpu', endWord: 'target', model: 'model' };
const pause = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function startWhenAvailable(pool) {
  const deadline = Date.now() + WORKER_SLOT_WAIT_MS;
  while (Date.now() < deadline) {
    try { return pool.start(request); }
    catch (error) {
      if (!(error instanceof SearchBusyError)) throw error;
      await pause(WORKER_SLOT_POLL_INTERVAL_MS);
    }
  }
  throw new Error('Completed search did not release its worker slot');
}

async function readBeforeDeadline(reader) {
  let timeout;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Newer search hung after old stream cancellation')), REGRESSION_READ_TIMEOUT_MS);
      }),
    ]);
  } finally { clearTimeout(timeout); }
}

test('the production worker entrypoint is built', async () => {
  await access(new URL('../dist/workers/search.worker.mjs', import.meta.url));
});

test('two CPU-bound searches leave the HTTP server responsive', async () => {
  const pool = createSearchPool({ workerPath, maxWorkers: 2, timeoutMs: 2000 });
  const server = createServer((req, response) => {
    if (req.url === '/') return response.end('webpage');
    Readable.fromWeb(pool.start(request)).pipe(response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const searches = await Promise.all([fetch(`${base}/search`), fetch(`${base}/search`)]);
    const readers = searches.map(response => response.body.getReader());
    await Promise.all(readers.map(reader => reader.read()));
    const startedAt = Date.now();
    assert.equal(await (await fetch(base)).text(), 'webpage');
    assert.ok(Date.now() - startedAt < 250, 'webpage waited for CPU-bound search');
    assert.throws(() => pool.start(request), /busy/i);
    await Promise.all(readers.map(async reader => { while (!(await reader.read()).done) {} }));
  } finally {
    await pool.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('deadline interrupts CPU work and eventually frees capacity', async () => {
  const pool = createSearchPool({ workerPath, maxWorkers: 1, timeoutMs: 100 });
  try {
    const response = new Response(pool.start(request));
    assert.match(await response.text(), /maximum duration/i);
    await pause(50);
    assert.match(await new Response(pool.start(request)).text(), /maximum duration/i);
  } finally { await pool.close(); }
});

test('disconnect kills the worker and releases its slot', async () => {
  const pool = createSearchPool({ workerPath, maxWorkers: 1, timeoutMs: 2000 });
  const controller = new AbortController();
  try {
    const reader = pool.start(request, controller.signal).getReader();
    await reader.read();
    controller.abort();
    assert.equal((await reader.read()).done, true);
    await pause(50);
    await pool.start(request).cancel();
  } finally { await pool.close(); }
});

test('cancelling a completed unread stream cannot stop a newer search on its worker', async () => {
  const pool = createSearchPool({ workerPath, maxWorkers: 1, timeoutMs: WORKER_SLOT_WAIT_MS });
  try {
    const oldStream = pool.start(request);
    // Admission proves the old worker job completed while its response stayed unread.
    const newerReader = (await startWhenAvailable(pool)).getReader();
    const started = await readBeforeDeadline(newerReader);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(started.value)), { status: 'started' });
    await oldStream.cancel();
    const finished = await readBeforeDeadline(newerReader);
    assert.equal(finished.done, false);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(finished.value)), { finished: true });
    assert.equal((await readBeforeDeadline(newerReader)).done, true);
  } finally { await pool.close(); }
});

test('unexpected worker exit closes the stream with an error', async () => {
  const pool = createSearchPool({ workerPath, maxWorkers: 1, timeoutMs: 2000 });
  try {
    assert.match(await new Response(pool.start({ ...request, startWord: 'exit' })).text(), /worker.*exit/i);
  } finally { await pool.close(); }
});
