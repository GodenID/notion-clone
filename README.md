# 📓 Notion Clone

<p align="center">
  <img src="https://img.shields.io/badge/status-in%20development-orange?style=for-the-badge" alt="status" />
  <img src="https://img.shields.io/badge/frontend-not%20yet%20built-red?style=for-the-badge" alt="frontend" />
  <img src="https://img.shields.io/badge/backend-not%20yet%20built-red?style=for-the-badge" alt="backend" />
  <img src="https://img.shields.io/badge/prototype-vanilla%20JS-blue?style=for-the-badge" alt="prototype" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="license" />
</p>

<p align="center">
  <b>A self-hosted, Notion-style workspace — pages, blocks, databases, teamspaces, and comments.</b><br/>
  <sub>Currently a single-browser vanilla-JS prototype. A real frontend (framework) + backend (API & database) are on the roadmap.</sub>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-roadmap">Roadmap</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-project-structure">Structure</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## 🚧 Project Status

> **Heads up:** the **frontend (framework layer) and backend (API + database) have not been developed yet.**
> What exists today is a **vanilla HTML/CSS/ES-modules prototype** that runs entirely in the browser and persists to `localStorage`. It is a functional demo of the UX and data model, and it will be replaced/rewritten on top of the real stack listed in the [Roadmap](#-roadmap).

- ✅ Vanilla-JS prototype (workspace, editor, databases, teamspaces, comments)
- 🛠️ Real frontend framework — **not started**
- 🛠️ Backend API + database — **not started**
- 🛠️ Auth, multi-user, real-time sync — **not started**

---

## ✨ Features (current prototype)

### Block library — 42 insertable blocks, grouped like Notion

**Basic** — Text, Heading 1–3, **Toggle heading 1–3**, bulleted / numbered / to-do / toggle list, quote, callout, divider, **breadcrumb**

**Media** — Image, **Video** (upload or YouTube / Vimeo / Loom), **Audio** (upload or URL), **File** (any type, 25 MB), **Embed** (Figma, CodePen, Google Maps, Loom, Spotify, SoundCloud, Miro, Airtable, Gist, Replit), Attachment (PDF/Word/CSV/Excel with server verification), Bookmark, Code, Equation

**Database** — Table, **Table / Board / Gallery / List / Calendar / Timeline views**

**Advanced** — Link to page, **Page (sub-page)**, Synced block, **Button**, **Template button**, 2 / **3 / 4 / 5** columns, Table of contents, Date

Plus **block text + background colors**, **inline `$equation$`**, table header row/column toggles and per-cell colors.

### Workspace
- 🔐 Mock login (name + email stored in `localStorage`, demo account included)
- 🗂️ **Teamspaces** with home view: cover, live member count, member list (name/email/role), page count, page grid
- 👥 Invite / remove members with Member or Admin role, duplicate-email guard
- ✏️ Edit & delete teamspaces; deleting moves its pages to Private
- 📄 **Private pages** with unlimited nesting
- ⭐ Favorites, rename, duplicate, export to Markdown, soft delete
- 🗑️ **Trash** with restore / permanent delete / empty trash
- 🔍 Search across pages, teamspaces, and page content (`Ctrl/Cmd+K`)

### Editor
- 🧱 42 block types across four menu categories, see the block library above
- ⌨️ `/` block menu with category headers and fuzzy filtering, Markdown shortcuts, split/merge/indent/outdent, drag-and-drop
- 🎨 Block text + background colors (9 hues, light/dark aware) from the block menu
- ➗ Inline equations: type `$x^2$` inside any text block and it renders as KaTeX
- 🎨 Selection toolbar: bold, italic, underline, strikethrough, inline code, link, **comment**
- 🖼️ Image upload (< 800 KB) or by URL; YouTube/Vimeo embeds; link-card bookmarks
- 📎 Attachments: PDF, Word, CSV, Excel (≤ 20 MB) with server-side validation & SHA-256 checksum
- 📋 Sanitized paste, multi-line text → blocks
- ↩️ Undo/redo, find in page, live word count
- ⚙️ Page options: full width, small text, Serif/Mono, lock, version history
- 🔗 Backlinks at the bottom of linked pages
- 💬 Range-based comments with CSS Custom Highlight API, resolve/reopen, orphan detection

### Database block
- 🧮 Typed properties: title, text, number, date, checkbox, select
- 📊 Six switchable views per database: **table, board, gallery, list, calendar, timeline**
- 🗓️ Calendar navigates by month and adds rows by clicking a day
- ⏳ Timeline draws bars from the first and second date properties
- Table & board views keep filter, sort, and inline cell editing
- 🗃️ Group board by first select (or configured) property

### Media & files
- 🎬 Video and 🎵 audio accept uploads or embed links (YouTube, Vimeo, Loom)
- 📁 Upload any file up to 25 MB through `/api/media` (SHA-256 manifest, HTTP range streaming)
- 📎 PDF/Word/CSV/Excel still use the stricter verified attachment endpoint

### Other
- 🔄 Synced blocks (shared `syncId`, edits propagate to all copies)
- ➗ Locally bundled KaTeX equations (no CDN), inline `$...$` inside text blocks
- 🎨 Dark mode, mobile sidebar, reduced-motion support
- 🏷️ Readable stable URLs `/p/<slug>` & `/t/<slug>` with SEO/OG tags + Share dialog
- 📦 Templates gallery (8 starter pages)
- ⚙️ Settings: profile, workspace name, theme

---

## 🗺️ Roadmap

### Phase 0 — Prototype (✅ done)
- [x] Vanilla-JS workspace, editor, databases, teamspaces, comments
- [x] Local static server with attachment validation and a media upload API

### Phase 1 — Foundation (🛠️ in progress)
- [ ] Repo scaffolding: monorepo (`frontend/`, `backend/`, `shared/`)
- [ ] CI/CD (lint, test, build)
- [ ] Docker dev environment

### Phase 2 — Backend
- [ ] REST/GraphQL API (Node.js + Express / Fastify)
- [ ] Database schema (PostgreSQL) + migrations
- [ ] Auth (email/password, OAuth, sessions/JWT)
- [ ] File storage (S3-compatible) for attachments
- [ ] Real-time sync (WebSockets / CRDT)
- [ ] Full-text search (Postgres / Meilisearch)

### Phase 3 — Frontend
- [ ] React (or Vue/Svelte) app with routing
- [ ] Rich-text editor (ProseMirror / Slate / TipTap)
- [ ] Database views (table, board, gallery, list, calendar, timeline)
- [ ] Comments & mentions
- [ ] Offline-first + sync

### Phase 4 — Polish
- [ ] Permissions & sharing (public links, guests)
- [ ] Import/export (Markdown, CSV, Notion export)
- [ ] Mobile app / PWA
- [ ] AI assist (summarize, translate, generate)

---

## 🧱 Tech Stack

| Layer | Current (prototype) | Planned |
|---|---|---|
| Frontend | Vanilla HTML/CSS/ES modules | React + TypeScript + Vite |
| Styling | Plain CSS + design tokens | Tailwind / CSS-in-JS |
| Editor | Custom block renderer | TipTap / ProseMirror |
| Backend | Node static server (`server.mjs`) | Node.js + Fastify/Express |
| Database | `localStorage` | PostgreSQL + Prisma/Drizzle |
| Auth | Mock (localStorage) | JWT + OAuth (Google/GitHub) |
| Storage | `.data/attachments` + `.data/media` | S3-compatible object storage |
| Realtime | — | WebSockets / Yjs (CRDT) |
| Search | In-memory filter | Meilisearch / Postgres FTS |
| Infra | `npm run dev` | Docker + CI/CD |

---

## 📁 Project Structure

```
notion-clone/
├── index.html              # login
├── app.html                # workspace shell + dialogs
├── server.mjs              # static server, /p & t rewrites, attachment + media API
├── vendor/katex/           # locally bundled KaTeX
├── src/
│   ├── styles/             # tokens, auth, app, features CSS
│   ├── auth/main.js        # validation, session, redirect
│   └── app/
│       ├── store.js        # seed data, slugs, templates, session, trash
│       ├── editor.js       # block library, rendering, editor + database views
│       └── main.js         # views, routing/SEO, comments, search, dialogs
├── test/harness.html       # headless smoke test for the editor (28 assertions)
├── .data/                  # runtime uploads: attachments + media (gitignored)
├── package.json
└── README.md
```

> A `frontend/` + `backend/` split will be introduced in Phase 1.

---

## 🚀 Getting Started (prototype)

```bash
cd notion-clone
npm run dev
```

Open `http://localhost:5173/`, enter any email (or use **Continue with the demo account**), and you land in the workspace at `app.html`.

The server is a small Node static file server, so `node server.mjs` also works.

```bash
npm run check   # syntax-check every module
```

### Smoke test
With the dev server running, open `http://localhost:5173/test/harness.html` in a headless browser. It seeds a workspace, drives the editor (slash menu, block colors, template insert, calendar, sub-pages, media upload) and prints a PASS/FAIL list.

### Reset
- Clear `notion-clone:v2` and `notion-clone:session` in `localStorage` to reset the workspace and sign out.
- Existing `notion-clone:v1` data migrates automatically on first load.

### Notes
- Workspace data is a single-browser demo in `localStorage`; uploads go through the local Node server — verified documents under `.data/attachments`, general media under `.data/media`.
- Database blocks cover six views with typed properties, filters, and sorting, but not Notion's full relation/rollup/formula engine.
- Timeline and calendar views need at least one date property; timeline uses a second date property as the bar end.
- Range-comment highlights use the CSS Custom Highlight API (Chromium). Threads still work without highlights.

---

## 🤝 Contributing

Contributions are welcome! Since the real frontend/backend are not built yet, the best ways to help right now:

1. 🐛 Report bugs in the prototype (open an issue)
2. 💡 Propose features / UX improvements
3. 🏗️ Help scaffold Phase 1 (monorepo, CI, Docker)
4. 📝 Improve docs

Please open an issue before starting large changes so we can align on direction.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Built with ❤️ as a Notion-style workspace experiment.</sub>
</p>
