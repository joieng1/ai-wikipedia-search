import { parentPort } from 'worker_threads';
import * as path from 'path';
const Database = require('better-sqlite3');

interface Page {
  id: number;
}

interface Link {
  to_page: string;
  anchor: string;
}

const dbPath = path.resolve(process.cwd(), "my_wiki.db");
const db = new Database(dbPath, { fileMustExist: true, readonly: true });

// apply PRAGMA settings
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = OFF;
  PRAGMA cache_size = 1000000;
  PRAGMA temp_store = MEMORY;
  PRAGMA locking_mode = NORMAL;
  PRAGMA mmap_size = 536870912;
`);

parentPort?.on('message', (title: string) => {
  try {
    // get page ID
    const idStatement = db.prepare("SELECT id FROM pages WHERE title = ?");
    const page = idStatement.get(title) as Page;
    if (!page) {
      parentPort?.postMessage([]);
      return;
    }
    // then query links using ID
    const statement = db.prepare(`
      SELECT p2.title AS to_page, l.anchor
      FROM links l
      JOIN pages p2 ON l.to_id = p2.id
      WHERE l.from_id = ?
    `);
    const result = statement.all(page.id) as Link[];
    parentPort?.postMessage(result);
  } catch (err) {
    parentPort?.postMessage({ error: String(err) });
  }
});