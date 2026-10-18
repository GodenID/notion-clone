# 📓 NookSpace

<p align="center">
  <img src="https://img.shields.io/badge/status-in%20development-orange?style=for-the-badge" alt="status" />
  <img src="https://img.shields.io/badge/backend-Fastify%20%2B%20SQLite-blue?style=for-the-badge" alt="backend" />
  <img src="https://img.shields.io/badge/auth-scrypt%20sessions-green?style=for-the-badge" alt="auth" />
  <img src="https://img.shields.io/badge/search-SQLite%20FTS5-green?style=for-the-badge" alt="search" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="license" />
</p>

<p align="center">
  <b>A self-hosted, Notion-style workspace — pages, blocks, databases, teamspaces, and comments.</b><br/>
  <sub>Served by a real backend: Fastify + SQLite, with accounts, sessions, full-text search, and a live update stream. The editor is still vanilla ES modules — a React rewrite is the next phase.</sub>
</p>

<p align="center">
  <a href="#-what-works-today">What works</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-getting-started">Getting started</a> ·
  <a href="#-api">API</a> ·
  <a href="#-testing">Testing</a> ·
  <a href="#-roadmap">Roadmap</a> ·
  <a href="#-contributing">Contributing</a>
</p>

---

## ✅ What works today

- **Real backend.** Fastify API over SQLite (`node:sqlite`, no native build step), migrations on boot.
- **Real accounts.** Email + password hashed with scrypt, opaque session tokens in an `HttpOnly` cookie, 30-day expiry, server-side revocation on sign-out.
- **Real persistence.** Pages, blocks, comments, teamspaces, uploads, and page options live in the database. Your edits are written to SQLite, not just to the browser.
- **Real search.** SQLite FTS5 index over page titles and block text, rebuilt on every write, with a `LIKE` fallback for odd queries.
- **Real live updates.** Server-sent events push `page:updated`, `page:created`, `page:deleted`, `comment:created`, and presence to every connected browser.
- **A working editor.** 43 block types, inline formatting, slash commands, mentions, databases with 6 view types and 17 property types, code highlighting, comments with threads and reactions, a command palette, a shortcut sheet, and an onboarding tour.

**Still prototype-grade:** the editor UI itself is vanilla ES modules (no React/Vue), collaboration is broadcast-only (last write wins — no CRDT/OT), there are no automated accessibility audits or load tests, and the S3 storage driver is declared but not compiled in.

---

## ✨ Features

### Editor
43 block types, including headings, toggles, lists, to-dos, quotes, callouts, code, math, tables, columns, media, embeds, bookmarks, templates, buttons, and databases.

| | |
|---|---|
| `/` slash menu | Fuzzy, keyboard-navigable (`aria-activedescendant`), works inside toggles and columns |
| `@` mentions | Links to any page, plus Today / Tomorrow date blocks |
| Inline formatting | Bold, italic, underline, strike, code, colour, highlight, links |
| Quick math | Type `= 12*3` inline to evaluate an expression |
| Quick commands | `/today`, `/tomorrow`, `/todo`, `/h1`, `/quote`, … |
| Code blocks | Syntax highlighting for 15 languages, copy button, soft wrap |
| Templates | One-click block bundles; button blocks that open a URL |

### Databases
- Views: **table, board, gallery, list, calendar, timeline**
- Properties: title, text, number, date, checkbox, select, multi-select, status, **formula**, **rollup**, **relation**, people, files, URL, unique ID, created time, updated time
- A hand-written formula parser (no `eval`) with 20+ functions
- Relations and rollups across databases, with linked views
- Filters, sorts, group-by, column resize, alignment, drag-and-drop rows

### Workspace
- Pages with icons, covers, favourites, nesting, templates, and a trash with restore
- Comments with threads, emoji reactions, and resolve/unresolve
- Teamspaces with members and roles
- Command palette (`Ctrl/Cmd+Shift+P`), shortcut sheet (`?`), and a 4-step onboarding tour
- 69 registered keyboard shortcuts, generated into the sheet from the same registry that enforces them

### Backend
- REST API with session auth and per-user data isolation
- SQLite schema with a versioned migration runner
- FTS5 search index kept in sync with the page content
- SSE realtime stream with presence
- Uploads to disk with SHA-256 manifest, MIME guessing, 25 MB limit, and range requests for audio/video
- Storage adapter interface: local driver now, S3-compatible driver when configured

---

## 🏗 Architecture

```
nookspace/
├── backend/            Fastify API, SQLite, auth, storage, realtime
│   ├── migrations/      Versioned .sql files, applied on boot
│   ├── server.js        Routes, static hosting, SPA fallback
│   ├── repository.js    Every SQL statement in one place
│   ├── auth.js          scrypt hashing + session cookies
│   ├── realtime.js      SSE hub with presence
│   └── storage.js       Local / S3-compatible driver interface
├── frontend/           The app itself (vanilla ES modules, no build step)
│   ├── index.html       Login / sign-up
│   ├── app.html         The workspace shell
│   ├── src/app/         Editor, databases, commands, overlays, API client
│   ├── src/styles/      Design tokens + component styles
│   └── test/            Browser harnesses
├── shared/contracts.js Route table, block/property vocabulary, limits
├── scripts/             check.mjs, migrate-cli.js
└── test/                Node test files + the harness runner
```

**Two run modes, chosen at boot:**

- **server mode** — the API is reachable: data lives in SQLite, auth is real, realtime is on.
- **local mode** — no backend: everything falls back to `localStorage` and the app runs as the original offline demo.

Force either with `?mode=server` / `?mode=local`, and add `?realtime=off` to keep the event stream closed.

---

## 🚀 Getting started

Requires **Node.js 22.5+** (Node 24 recommended — it ships the SQLite build used here).

```bash
git clone https://github.com/GodenID/nookspace.git
cd nookspace
npm install
npm run dev
```

Open <http://localhost:5173>, create an account, and your demo workspace is seeded into the database on first run.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API + app on port 5173 |
| `npm run dev:static` | Start the original static server (offline prototype mode) |
| `npm test` | Every Node test: database engine, highlighter, commands, API, full stack |
| `npm run test:harness` | Boot the server and drive the real UI in headless Chrome |
| `npm run test:harness:static` | Same UI tests with the backend off (localStorage mode) |
| `npm run check` | Syntax-check every module in the repo |
| `npm run migrate` | Apply pending migrations and exit |

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `5173` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `DATABASE_FILE` | `.data/nookspace.sqlite` | Use `:memory:` for a throwaway database |
| `STORAGE_DRIVER` | `local` | `s3` is declared but not compiled in yet |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | — | Used by the S3 driver |
| `LOG` | off | `LOG=1` enables Fastify request logging |

---

## 🔌 API

All routes live under `/api`; the canonical table is `shared/contracts.js`, which the browser imports directly.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + driver info |
| `POST` | `/api/auth/register` | Create an account, returns a session cookie |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Revoke the session |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/workspace` | Everything the app needs to boot |
| `GET`/`POST` | `/api/pages` | List / create pages |
| `GET`/`PATCH`/`DELETE` | `/api/pages/:id` | Read, update, trash (add `?purge=1` to destroy) |
| `PUT` | `/api/pages/:id/blocks` | Replace a page's blocks |
| `POST` | `/api/pages/:id/restore` | Restore from trash |
| `GET`/`POST` | `/api/comments` | List / create (by `pageId` or `teamspaceId`) |
| `PATCH`/`DELETE` | `/api/comments/:id` | Edit replies, reactions, resolve / delete |
| `GET`/`POST` | `/api/teamspaces` | List / create teamspaces |
| `POST` | `/api/teamspaces/:id/members` | Add a member by email |
| `GET` | `/api/search?q=` | FTS5 search over titles and block text |
| `POST` | `/api/uploads?name=` | Upload (25 MB max, raw body) |
| `GET` | `/api/uploads/:id` | Download, with range support |
| `GET` | `/api/realtime/stream` | SSE: updates + presence |

---

## 🧪 Testing

```bash
npm run check              # 29 modules parse
npm test                   # 70 Node assertions across 5 files
npm run test:harness       # 82 browser assertions against the backend
npm run test:harness:static # 57 browser assertions with no backend at all
```

- `test/database.test.mjs` — property types, formulas, sorts
- `test/highlight.test.mjs` — the syntax highlighter
- `test/commands.test.mjs` — fuzzy matching and shortcut parsing
- `test/backend.test.mjs` — auth, pages, blocks, search, comments, uploads, static serving
- `test/stack.test.mjs` — full stack: seed, edit, restart the database, verify the data survived
- `frontend/test/auth.html` — the real login screen against the real backend
- `frontend/test/harness.html` — 57 editor/UI assertions
- `frontend/test/server-mode.html` — register, seed, edit in the browser, read the rows back out of SQLite

CI runs all of it on every push: [.github/workflows/ci.yml](.github/workflows/ci.yml).

---

## 🗺 Roadmap

**Phase 1 — Foundation** ✅
- [x] Monorepo split: `backend/` / `frontend/` / `shared/`
- [x] SQLite schema with a migration runner
- [x] CI: syntax check, tests, headless browser harness
- [x] Fastify API replacing the prototype's static server

**Phase 2 — Real backend** ✅
- [x] Accounts, scrypt password hashing, session cookies
- [x] Pages, blocks, comments, teamspaces as real records
- [x] Full-text search (FTS5)
- [x] Realtime updates + presence (SSE)
- [x] File storage with a pluggable driver
- [ ] OAuth / magic-link sign-in
- [ ] Rate limiting and a request audit log
- [ ] Compiled S3-compatible storage driver

**Phase 3 — Frontend** ⏳
- [ ] React app with routing (the editor engine stays, the shell moves)
- [ ] Replace the hand-rolled block engine with ProseMirror or TipTap
- [ ] Server-driven permissions rendered per role
- [ ] Offline-first with a real sync queue and conflict resolution
- [ ] CRDT collaboration (Yjs) replacing last-write-wins

---

## 🤝 Contributing

1. Fork and branch off `main`.
2. `npm install && npm run check && npm test`.
3. If you touched the UI, run `npm run test:harness` — it drives a real browser.
4. Keep the shortcut registry (`frontend/src/app/commands.js`) as the single source of truth so the sheet can never drift from the bindings.
5. New backend routes need a matching entry in `shared/contracts.js` and a test.

## 📄 License

MIT — see [LICENSE](LICENSE).
