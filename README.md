# AI Wikipedia Search

Search paths between Wikipedia articles using a local SQLite link graph and embedding models.

## Development

Use Node.js 22, run `npm ci`, then `npm run dev`. Set `WIKI_DB_PATH` to your local Wikipedia database. The database and environment files are excluded from Git and Docker build contexts.

Run `npm test` for the database, search concurrency, cancellation, and streaming regression tests and `npm run build` for production compilation and TypeScript validation.

## Oracle deployment

The self-hosted Coolify application builds `Dockerfile` using `/compose.oracle.yaml` from the GitHub `main` branch. Each image build runs the worker tests and production build before creating the runtime image. GitHub Actions runs the same checks for pull requests and pushes.

The container runs as the non-root `node` user and listens only on host `127.0.0.1:3011`. Cloudflare Tunnel publishes it at https://ai-wikipedia-search.johnieng.com. `/api/health` checks database access.

Persistent host mounts:

- `/data/ai-wikipedia/database` is mounted read-only at `/app/data`; it contains the separately transferred and verified 14 GB `my_wiki.db` in DELETE journal mode.
- `/data/ai-wikipedia/model-cache` is writable at `/app/model-cache`; models are retained across code deployments.

Code deployments do not upload or replace either directory. Do not commit the database, archives, credentials, or model cache. Database updates require separate transfer, verification, and atomic publication.

After the GitHub connection is activated, pushing to `main` triggers Coolify through the signed GitHub App webhook. Coolify builds and deploys the new image automatically. Runtime limits are 2 CPUs and 4 GiB RAM, with rotating container logs.

## Concurrent searches


Model inference, graph traversal, queue operations, and SQLite reads run in worker threads rather than on the HTTP server thread. Each worker handles one search at a time and reuses its model and read-only database connection for subsequent searches.

The default is two active searches per server process. Set `SEARCH_MAX_WORKERS` before starting the server to change this limit (1–8). Each worker holds a model in memory, so choose the limit for your machine's memory and CPU capacity.

Requests above the limit receive HTTP 503 with a retry message instead of accumulating in an unbounded queue. Searches have a 60-second deadline, including model initialization and Wikipedia title lookups. Disconnecting the client cancels its search. The initial model load may download model files; later requests reuse the cached files.

Forward and backward searches publish independently. Each explores outgoing links in its direction; Wikipedia links are directed, so a reverse path is not guaranteed to exist even when a forward path does. This heuristic search does not guarantee the shortest path.

The endpoint streams newline-delimited JSON records with `application/x-ndjson`. Configure any proxy in front of the app to pass streaming responses without buffering.


Worker sources compile into `dist/workers` before development and production builds. Restart `npm run dev` after changing worker sources to recompile them. The Docker runtime includes the compiled workers and full production dependencies.
