# AI Wikipedia Search

Search paths between Wikipedia articles using a local SQLite link graph and embedding models.

## Development

Use Node.js 22, run `npm ci`, then `npm run dev`. Set `WIKI_DB_PATH` to your local Wikipedia database. The database and environment files are excluded from Git and Docker build contexts.

Run `npm test` for the database worker regression tests and `npm run build` for production compilation and TypeScript validation.

## Oracle deployment

The self-hosted Coolify application builds `Dockerfile` using `/compose.oracle.yaml` from the GitHub `main` branch. Each image build runs the worker tests and production build before creating the runtime image. GitHub Actions runs the same checks for pull requests and pushes.

The container runs as the non-root `node` user and listens only on host `127.0.0.1:3010`. Cloudflare Tunnel publishes it at https://ai-wikipedia-search.johnieng.com. `/api/health` checks database access.

Persistent host mounts:

- `/data/ai-wikipedia/database` is mounted read-only at `/app/data`; it contains the separately transferred and verified 14 GB `my_wiki.db` in DELETE journal mode.
- `/data/ai-wikipedia/model-cache` is writable at `/app/model-cache`; models are retained across code deployments.

Code deployments do not upload or replace either directory. Do not commit the database, archives, credentials, or model cache. Database updates require separate transfer, verification, and atomic publication.

After the GitHub connection is activated, pushing to `main` triggers Coolify through the signed GitHub App webhook. Coolify builds and deploys the new image automatically. Runtime limits are 2 CPUs and 4 GiB RAM, with rotating container logs.
