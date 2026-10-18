# React shell (Phase 3, in progress)

`frontend-react/` is the next-generation UI: Vite + React 18 + React Router,
consuming the real backend API. It is deliberately additive — the vanilla app
at `frontend/` keeps working and is still the primary editor.

## Run it

```bash
# terminal 1
cd nookspace
npm run dev

# terminal 2
cd nookspace/frontend-react
npm install
npm run dev        # http://localhost:5174
```

The Vite dev server proxies `/api` to the backend on port 5173, so start the
backend first.

## What is live

- Login / register / sign out against the real API
- Workspace sidebar with pages and teamspaces
- Page view with role badge and read-only blocks
- Settings screen

## What is next (Phase 3)

- ProseMirror rich-text editor (replacing contenteditable)
- Yjs CRDT collaboration over the WebSocket endpoint
- Offline-first sync queue ported from the vanilla app
- Server-driven permissions per role in the UI