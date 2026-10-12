# Full-stack Project Management

A small but complete project-management app — a JSON API plus a kanban board
frontend — with **zero runtime dependencies**. The server is plain `node:http`;
the UI is vanilla JavaScript. `npm test` runs a `node:test` suite with no
network mocking beyond a real ephemeral server.

## Features

- **Projects & tasks API** — create/update/delete projects and tasks, move a
  task between `todo → doing → done`, and filter/search/sort tasks.
- **Kanban board** — three columns, per-task priority accent, overdue styling,
  move buttons, and a live project list with `done/total` counts.
- **Validation & error handling** — required fields, enum checks, ISO-date
  checks, body size limit, structured JSON errors with proper status codes.
- **Computed fields** — each project reports `taskCount`, `doneCount`,
  `overdueCount`; completing a task stamps `completedAt`, reopening clears it.
- **Cascading deletes** — removing a project removes its tasks.
- **Static frontend served by the same server** — one process, no CORS.

## Getting started

```bash
npm start     # http://localhost:3000 (override with PORT)
npm run dev   # same, with --watch
npm test      # node:test suite
```

No `npm install` needed — only Node built-ins are used.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/stats` | Totals by status/priority, overdue count |
| `GET` | `/api/projects` | List projects (with counts) |
| `POST` | `/api/projects` | Create a project `{ name, description?, color? }` |
| `GET` | `/api/projects/:id` | Get one project |
| `PATCH`/`PUT` | `/api/projects/:id` | Update a project |
| `DELETE` | `/api/projects/:id` | Delete a project (cascades) |
| `GET` | `/api/projects/:id/tasks` | List a project's tasks (supports `status`, `priority`, `assignee`, `q`, `sort`) |
| `POST` | `/api/projects/:id/tasks` | Create a task `{ title, description?, status?, priority?, assignee?, dueDate? }` |
| `GET` | `/api/tasks` | List tasks across projects (same filters) |
| `GET`/`PATCH`/`DELETE` | `/api/tasks/:id` | Read / update / delete a task |
| `POST` | `/api/tasks/:id/move` | Move a task `{ status }` |

Values: `status ∈ todo|doing|done`, `priority ∈ low|medium|high|urgent`,
`dueDate` is `YYYY-MM-DD`. `sort ∈ created|priority|due|title`.

```bash
curl -s localhost:3000/api/projects -H 'content-type: application/json' \
  -d '{"name":"Website revamp"}'
```

## Project layout

```
src/store.js    In-memory domain model + validation (unit tested)
src/app.js      HTTP routing -> createHandler / createServer
src/static.js   Static file serving with path-traversal protection
src/server.js   Wires the server to /public and starts listening
public/         index.html, styles.css, app.js (the kanban UI)
test/api.test.js
```

## Design notes

- `store.js` is intentionally DOM/HTTP-free so the domain rules (validation,
  overdue calculation, cascades, completedAt transitions) are unit tested
  directly; `app.js` only translates HTTP to store calls.
- `stats()` and the per-project counts are derived on read, so there is no
  denormalized state to keep in sync.
- `src/static.js` exposes `safeJoin()` which resolves a request path under the
  public root and rejects traversal such as `/../../etc/passwd`.

## License

MIT
