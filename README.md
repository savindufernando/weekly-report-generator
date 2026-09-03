# Weekly Report Generator & Team Dashboard

A multi-user weekly reporting tool: team members submit structured weekly reports, managers
review them through a correction cycle, and a consolidated dashboard shows activity across the
whole team.

> **Status:** in development. Phase 1 (foundation) complete.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Material UI · React Router · TanStack Query · Axios · Recharts |
| Backend | FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Alembic · JWT |
| Database | MySQL / MariaDB 10.4 (XAMPP) |

## Prerequisites

- **Python 3.11** (3.14 is not yet reliable for this dependency set)
- **Node 20+**
- **XAMPP** with MySQL running on port 3306

## Getting started

### 1. Database

Start MySQL from the XAMPP Control Panel, then create the schemas:

```sql
CREATE DATABASE weekly_reports      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE weekly_reports_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`utf8mb4` is required. Without it the connection negotiates `latin1` and any non-ASCII
character is silently replaced with `?` on the way into the database.

### 2. Backend

```bash
cd backend
py -3.11 -m venv .venv
.venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # paste into JWT_SECRET

uvicorn app.main:app --reload --port 8000
```

- API: http://127.0.0.1:8000
- Interactive docs: http://127.0.0.1:8000/api/docs
- Health check: http://127.0.0.1:8000/health

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

App: http://localhost:5173

### 4. Verify

`GET /health` should return `{"status":"ok","database":"up",...}`, and the app's home screen
should show *API ok · database up*.

## Running tests

```bash
cd backend && pytest -v
cd frontend && npm run typecheck && npm run build
```

## Design decisions

Documented in full in `docs/blueprint/`. The decisions that shape the system:

- **Report version history** — the report holds a live, editable working copy; every *submit*
  writes an immutable JSON snapshot. Review comments carry a foreign key to the specific
  version they were written against, so history stays truthful across correction rounds.
- **Two-level authorization** — a role/permission gate decides who may call an endpoint, and an
  object gate decides who may touch a given row. A member requesting another member's report
  gets `404`, not `403`, so record existence is never leaked.
- **Managers cannot edit report content** — structurally, not by convention. The review
  endpoint's schema contains only `action` and `comment` with `extra="forbid"`, so no route
  exists that could accept content changes.
- **"Late" is a documented assumption** — the brief never defines a submission deadline. This
  implementation uses week end + `SUBMISSION_DEADLINE_GRACE_HOURS` (default 24), judged on the
  *first* submission so that correcting a report never makes it retroactively late.
- **Timestamps in UTC as `DATETIME`** — `TIMESTAMP` is bounded by 2038 and converts by session
  timezone, a known source of off-by-one-week bugs.
