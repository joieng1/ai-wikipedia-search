import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSearch } from '../dist/workers/search-engine.mjs';
import { PriorityQueue } from '../dist/workers/PriorityQueue.js';
import { readSearchUpdates } from '../dist/workers/search-stream.js';

test('searching a direct link needs no model inference', async () => {
  const updates = [];
  for await (const update of runSearch({ startWord: 'Start', endWord: 'End' }, {
    resolveTitle: async title => title,
    getLinks: title => title === 'Start' ? [{ to_page: 'End', anchor: 'end link' }] : [],
    getEmbedding: async () => { throw new Error('unnecessary inference'); },
  })) updates.push(update);
  assert.deepEqual(updates.find(update => update.direction === 'forward' && update.finished).path.map(step => step.href), ['Start', 'End']);
  assert.ok(updates.some(update => update.direction === 'backward' && update.error));
});

test('one direction can finish while the other waits on inference', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const iterator = runSearch({ startWord: 'Start', endWord: 'End' }, {
    resolveTitle: async title => title,
    getLinks: title => title === 'Start'
      ? [{ to_page: 'End', anchor: 'End' }]
      : [{ to_page: 'Other', anchor: 'Other' }],
    getEmbedding: () => blocked,
  });
  try {
    const finished = await Promise.race([
      (async () => { for await (const update of iterator) if (update.finished) return update; })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('forward waited for backward')), 200)),
    ]);
    assert.equal(finished.direction, 'forward');
  } finally { release([1]); }
});

test('priority queue returns highest scores first, including tied and negative scores', () => {
  const queue = new PriorityQueue();
  for (const priority of [0, -2, 4, 1, 4, -1]) queue.enqueue(priority, priority);
  const values = [];
  while (!queue.isEmpty()) values.push(queue.dequeue());
  assert.deepEqual(values, [4, 4, 1, 0, -1, -2]);
  assert.equal(queue.dequeue(), undefined);
});

test('stream parser preserves JSON and UTF-8 across network chunk boundaries', async () => {
  const payload = new TextEncoder().encode(JSON.stringify({ path: [{ text: 'Café' }] }) + '\n' + JSON.stringify({ finished: true }));
  const stream = new ReadableStream({ start(controller) {
    for (const byte of payload) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
  const updates = [];
  for await (const update of readSearchUpdates(stream)) updates.push(update);
  assert.equal(updates[0].path[0].text, 'Café');
  assert.equal(updates[1].finished, true);
});

test('stream parser propagates malformed updates', async () => {
  await assert.rejects(async () => {
    for await (const update of readSearchUpdates(new Response('invalid\n').body)) void update;
  }, /JSON/);
});
