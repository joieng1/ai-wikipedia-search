"use strict";
exports.__esModule = true;
var node_worker_threads_1 = require("node:worker_threads");
var path = require("path");
var Database = require('better-sqlite3');
var dbPath = path.resolve(process.env.WIKI_DB_PATH || path.join(process.cwd(), "my_wiki.db"));
var db = new Database(dbPath, { fileMustExist: true, readonly: true });
// apply PRAGMA settings
db.exec("\n  PRAGMA query_only = ON;\n  \n  PRAGMA cache_size = -65536;\n  PRAGMA temp_store = MEMORY;\n  PRAGMA locking_mode = NORMAL;\n  PRAGMA mmap_size = 536870912;\n");
node_worker_threads_1.parentPort === null || node_worker_threads_1.parentPort === void 0 ? void 0 : node_worker_threads_1.parentPort.on('message', function (title) {
    try {
        // get page ID
        var idStatement = db.prepare("SELECT id FROM pages WHERE title = ?");
        var page = idStatement.get(title);
        if (!page) {
            node_worker_threads_1.parentPort === null || node_worker_threads_1.parentPort === void 0 ? void 0 : node_worker_threads_1.parentPort.postMessage([]);
            return;
        }
        // then query links using ID
        var statement = db.prepare("\n      SELECT p2.title AS to_page, l.anchor\n      FROM links l\n      JOIN pages p2 ON l.to_id = p2.id\n      WHERE l.from_id = ?\n    ");
        var result = statement.all(page.id);
        node_worker_threads_1.parentPort === null || node_worker_threads_1.parentPort === void 0 ? void 0 : node_worker_threads_1.parentPort.postMessage(result);
    }
    catch (err) {
        node_worker_threads_1.parentPort === null || node_worker_threads_1.parentPort === void 0 ? void 0 : node_worker_threads_1.parentPort.postMessage({ error: String(err) });
    }
});
