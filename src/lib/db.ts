import Database from "better-sqlite3";
import path from "path";

interface Page {
  id: number;
}

export interface Link {
  to_page: string;
  anchor: string;
}

// open SQLite database
const dbPath = path.resolve(process.cwd(), "my_wiki.db");
const db = new Database(dbPath, { fileMustExist: true, readonly: true });

// apply PRAGMA settings to optimize performance
db.exec(`
  PRAGMA journal_mode = OFF;        -- No need for transactions since it's read-only
  PRAGMA synchronous = OFF;         -- Disables disk synchronization
  PRAGMA cache_size = 1000000;       -- Increases in-memory cache
  PRAGMA temp_store = MEMORY;        -- Store temp data in memory
  PRAGMA locking_mode = EXCLUSIVE;   -- No contention with other processes
  PRAGMA mmap_size = 268435456;      -- Use memory mapping to speed up large reads
`);

export function getLinks(title: string) : Link[] {
  try {
    // get page ID
    const idStatement = db.prepare("SELECT id FROM pages WHERE title = ?");
    const page = idStatement.get(title) as Page;

    if (!page) return [];
    // then query links using ID
    const statement = db.prepare(`
            SELECT p2.title AS to_page, l.anchor
            FROM links l
            JOIN pages p2 ON l.to_id = p2.id
            WHERE l.from_id = ?
        `);
    return statement.all(page.id) as Link[];
  } catch (error) {
    console.error("Database error:", error);
    return [];
  }
}

export function closeDB() {
  db.close();
}
