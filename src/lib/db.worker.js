"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var worker_threads_1 = require("worker_threads");
var path = require("path");
var Database = require('better-sqlite3');
var dbPath = path.resolve(process.cwd(), "my_wiki.db");
var db = new Database(dbPath, { fileMustExist: true, readonly: true });
// apply PRAGMA settings
db.exec("\n  PRAGMA journal_mode = WAL;\n  PRAGMA synchronous = OFF;\n  PRAGMA cache_size = 1000000;\n  PRAGMA temp_store = MEMORY;\n  PRAGMA locking_mode = NORMAL;\n  PRAGMA mmap_size = 536870912;\n");
worker_threads_1.parentPort === null || worker_threads_1.parentPort === void 0 ? void 0 : worker_threads_1.parentPort.on('message', function (title) {
    try {
        // get page ID
        var idStatement = db.prepare("SELECT id FROM pages WHERE title = ?");
        var page = idStatement.get(title);
        if (!page) {
            worker_threads_1.parentPort === null || worker_threads_1.parentPort === void 0 ? void 0 : worker_threads_1.parentPort.postMessage([]);
            return;
        }
        // then query links using ID
        var statement = db.prepare("\n      SELECT p2.title AS to_page, l.anchor\n      FROM links l\n      JOIN pages p2 ON l.to_id = p2.id\n      WHERE l.from_id = ?\n    ");
        var result = statement.all(page.id);
        worker_threads_1.parentPort === null || worker_threads_1.parentPort === void 0 ? void 0 : worker_threads_1.parentPort.postMessage(result);
    }
    catch (err) {
        worker_threads_1.parentPort === null || worker_threads_1.parentPort === void 0 ? void 0 : worker_threads_1.parentPort.postMessage({ error: String(err) });
    }
});
