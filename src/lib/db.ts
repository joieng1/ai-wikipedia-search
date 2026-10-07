const WORKER_ENTRYPOINT_RELATIVE_PATH = "./src/lib/db.worker.js";

export interface Link {
  to_page: string;
  anchor: string;
}

// query the database using a worker thread
export function getLinks(title: string): Promise<Link[]> {
  return new Promise((resolve, reject) => {
    const workerPath = WORKER_ENTRYPOINT_RELATIVE_PATH;
    import("node:worker_threads")
      .then(({ Worker }) => {
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
      })
      .catch((err) => {
        reject(err);
      });
  });
}