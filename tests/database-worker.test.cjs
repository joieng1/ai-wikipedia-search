const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { mkdtempSync, rmSync, chmodSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

function query(dbPath, title) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve('src/lib/db.worker.js'), {
      env: { ...process.env, WIKI_DB_PATH: dbPath },
    });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker timed out')); }, 5000);
    worker.once('message', result => { clearTimeout(timer); worker.terminate(); resolve(result); });
    worker.once('error', error => { clearTimeout(timer); worker.terminate(); reject(error); });
    worker.postMessage(title);
  });
}

test('worker reads a mounted database and safely handles arbitrary titles', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wiki-worker-'));
  const filename = path.join(directory, 'fixture.db');
  try {
    const db = new Database(filename);
    db.exec('CREATE TABLE pages (id INTEGER PRIMARY KEY, title TEXT); CREATE TABLE links (from_id INTEGER, to_id INTEGER, anchor TEXT);');
    const page = db.prepare('INSERT INTO pages VALUES (?, ?)');
    page.run(1, 'Cat'); page.run(2, 'Dog'); page.run(3, "O'Brien & friends");
    const link = db.prepare('INSERT INTO links VALUES (?, ?, ?)');
    link.run(1, 2, 'dog'); link.run(3, 1, 'cat');
    db.close(); chmodSync(filename, 0o444);
    assert.deepEqual(await query(filename, 'Cat'), [{ to_page: 'Dog', anchor: 'dog' }]);
    assert.deepEqual(await query(filename, "O'Brien & friends"), [{ to_page: 'Cat', anchor: 'cat' }]);
    assert.deepEqual(await query(filename, "' OR 1=1 --"), []);
    assert.deepEqual(await query(filename, 'Missing article'), []);
    const readOnly = new Database(filename, { readonly: true });
    assert.equal(readOnly.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
    assert.equal(readOnly.prepare('SELECT count(*) AS count FROM pages').get().count, 3);
    readOnly.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('worker reports a missing database instead of creating an empty one', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'wiki-missing-'));
  try { await assert.rejects(query(path.join(directory, 'missing.db'), 'Cat')); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});
