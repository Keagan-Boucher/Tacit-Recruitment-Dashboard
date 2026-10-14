# Tacit

AI recruiter dashboard. It captures what a recruiter learns in interviews, turns it into structured signal that always
points back to the sentence it came from, and surfaces the right candidates (including forgotten ones) when a role
arrives. The model recommends; the recruiter decides.

**Stack:** React + TypeScript (Vite) · Node/Express proxy · Firebase (Firestore, Auth, Storage) · Groq `openai/gpt-oss-120b`
· npm workspaces `web/`, `server/`, `shared/`. Synthetic data only.

## Run the dev environment

You need three things that are not in git, because they are secrets. Ask the project owner or create them (see
[Secret files](#secret-files)):

| File | What it is |
|---|---|
| `web/.env.local` | Firebase web config (`VITE_FIREBASE_*`, `VITE_API_BASE_URL`) |
| `server/.env` | Proxy config: `ALLOWED_ORIGIN`, `FIREBASE_SERVICE_ACCOUNT_PATH`, `FIREBASE_STORAGE_BUCKET`, `ALLOWED_UIDS`, `AI_API_KEY` … |
| `server/service-account.json` | Firebase Admin credentials |

### Option A: Docker (nothing to install except Docker)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
2. From the repo root:

   ```bash
   docker compose up
   ```

3. Open <http://localhost:5173>. The proxy is on <http://localhost:8787> (`/api/health` should say `"modelConfigured": true`).

The first run builds the image and installs every dependency (a few minutes). Your code is mounted into the container, so
saving a file hot-reloads the app. Stop with `Ctrl+C`, or `docker compose down` if you started it with `-d`.

Other commands, all run inside the same container:

```bash
docker compose run --rm dev npm run check     # typecheck + lint + token check + unit tests
docker compose exec dev npm run seed          # (re)load the synthetic dataset (needs .env.snap, see below)
docker compose up --build                     # after a package.json / lockfile change
docker compose logs -f                        # follow the logs of a background run
```

### Option B: Node on your machine

Requires Node 22 and npm 10.

```bash
npm install
npm start          # same as `npm run dev`: web on :5173 and the proxy on :8787 together
```

Run one half only with `npm run dev -w web` or `npm run dev -w server`.

## Secret files

Never commit these (`.gitignore` already excludes them).

**`web/.env.local`**: copy `web/.env.example` and fill in the Firebase web app config from the Firebase console
(Project settings, Your apps). Leave `VITE_API_BASE_URL=http://localhost:8787`.

**`server/.env`**: copy `server/.env.example` and fill in:

- `ALLOWED_ORIGIN=http://localhost:5173`
- `FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json` (a relative path works on the laptop and in Docker)
- `FIREBASE_STORAGE_BUCKET`: the same bucket as `VITE_FIREBASE_STORAGE_BUCKET`
- `ALLOWED_UIDS`: the Firebase uid of the recruiter account (empty means any signed-in user of the project)
- `AI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=openai/gpt-oss-120b`, `AI_API_KEY=<your Groq key>`

**`server/service-account.json`**: Firebase console, Project settings, Service accounts, Generate new private key.

**`.env.snap`** (only for `npm run seed` and `npm run snap`): `SNAP_EMAIL` and `SNAP_PASSWORD` of the recruiter account.

Without `AI_API_KEY` the app still runs, but anything that calls the model shows its "couldn't read this" state.

## Everyday commands

| Command | What it does |
|---|---|
| `npm start` / `npm run dev` | Web (:5173) and proxy (:8787) |
| `npm run check` | Typecheck, lint, token check, unit tests |
| `npm run seed` | Reset and reload the synthetic dataset (candidates, notes, roles, CV PDFs) |
| `npm run eval` | Score note interpretation against `evals/` (calls Groq, costs a fraction of a cent) |
| `npm run snap -- --only S03 --states` | Screenshot screens for comparison with Figma (needs Playwright, see `.claude/skills/tacit-build`) |
| `npm run test:rules` | Firestore and Storage rules tests (needs Java 17+ for the emulators) |

## Troubleshooting

- **Port already in use**: something else holds 5173 or 8787 (often a dev server from Option B). Stop it, or change the left
  side of the port mapping in `compose.yaml`.
- **`npm install` ran on your laptop and Docker misbehaves**: the container keeps its own Linux `node_modules`, so this
  should not matter. If it does, `docker compose down -v` then `docker compose up --build`.
- **Saves don't hot-reload in Docker**: file watching is set to polling in `compose.yaml` for Windows and macOS; check
  that Docker Desktop has file sharing enabled for the repo's drive.
- **Download CV fails in the browser**: the Storage bucket needs a CORS rule for your origin (set once for
  `http://localhost:5173`; add the deployed origin when you deploy).
- **Groq `429` / "couldn't read"**: the on-demand tier is capped at about 8,000 tokens a minute. Wait a minute and retry.
- **Docker Desktop won't start on Windows** ("sailor-ingest.sock"): quit it from the tray, delete the files in
  `%LOCALAPPDATA%\Docker\run`, then start it again.
