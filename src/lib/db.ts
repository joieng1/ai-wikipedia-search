import { Worker } from 'worker_threads';
import path from 'path';

export interface Link {
  to_page: string;
  anchor: string;
}

// query the database using a worker thread
export function getLinks(title: string): Promise<Link[]> {
  return new Promise((resolve, reject) => {
    const workerPath = "./src/lib/db.worker.js";
    const worker = new Worker(workerPath);

    worker.once('message', (message) => {
      if (Array.isArray(message)) {
        resolve(message as Link[]);
      } else if (message.error) {
        reject(new Error(message.error));
      } else {
        resolve([]);
      }
      worker.terminate();
    });

    worker.once('error', (err) => {
      reject(err);
      worker.terminate();
    });

    worker.postMessage(title);
  });
}