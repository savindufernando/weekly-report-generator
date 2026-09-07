# Weekly Report Generator & Team Dashboard

A multi-user weekly reporting tool: team members submit structured weekly reports, managers
review them through a correction cycle that preserves every past version, and a consolidated
dashboard shows activity across the whole team.

- **Backend:** FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Alembic · JWT — 36 REST endpoints
- **Frontend:** React 19 · TypeScript · Vite · Material UI · TanStack Query · Recharts — 13 pages
- **Database:** MySQL / MariaDB
- **Tests:** 158 backend tests, including a dedicated role-based-access-control suite

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Project structure](#project-structure)
- [Design decisions](#design-decisions)
- [Testing](#testing)
- [Documentation](#documentation)
- [Not implemented](#not-implemented)

---

## Features

**Authentication & roles** — registration, login/logout, JWT access tokens with an
httpOnly refresh cookie, and three roles (Member / Manager / Admin) built from
permission rows rather than hard-coded role checks.

**Personal weekly report** — one fixed structure for the whole team: week, project,
a task-level table (name, priority, planned % vs actual %, status, time planned vs
spent, deliverable), next week's tasks, blockers and achievements with one flaggable
key item each, and an hours breakdown by task type.

**Review & correction workflow** — `DRAFT → SUBMITTED → NEEDS_CORRECTION → SUBMITTED
→ APPROVED`, driven by a single transition table. Managers approve or request changes
with one general comment; the member sees that comment on their report page and can
edit and resubmit.

**Version history** — every submission writes an immutable JSON snapshot. Past
versions stay readable with their timestamps, and each review comment is
foreign-keyed to the exact version it was written against.

**Team dashboard** — four headline metrics (submitted this week, compliance rate,
reports needing correction, open blockers) and six charts: tasks-completed trend,
status by member, workload by project, time by task type, an activity feed of recent
review actions, and a workload-balance view that flags outliers. Members who have not
started a report at all are surfaced, not hidden.

**Projects, users, profiles** — project CRUD with member assignment, and an admin user
management page that creates accounts (with a one-time generated password), assigns
roles and deactivates people. A per-member profile shows full report history and stats.

**Pages** — login, register, my reports, new report, report editor, report detail,
team dashboard, member profile, review queue, review report, projects, admin users,
settings. Routes are permission-gated with the same permission codes the API uses.

---

## Quick start

### Prerequisites

- **Python 3.11** (3.14 is not yet reliable for this dependency set)
- **Node 20+**
- **MySQL / MariaDB** on port 3306 — XAMPP is what this was developed against

### 1. Database

Start MySQL, then create both schemas:

```sql
CREATE DATABASE weekly_reports      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE weekly_reports_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`utf8mb4` is required. Without it the connection negotiates `latin1` and any non-ASCII
character is silently replaced with `?` on the way into the database — nothing errors,
the data is just quietly wrong.

### 2. Backend

```bash
cd backend
py -3.11 -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # paste into JWT_SECRET

alembic upgrade head              # create the schema
python -m app.seeds.seed          # load the demo dataset (--reset to rebuild)

uvicorn app.main:app --reload --port 8000
```

- API — http://127.0.0.1:8000
- Interactive docs — http://127.0.0.1:8000/api/docs
- Health check — http://127.0.0.1:8000/health

Every setting lives in `backend/.env.example` with a comment explaining it. The only
one you must change is `JWT_SECRET`.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

App — http://localhost:5173

### 4. Verify

`GET /health` should return `{"status":"ok","database":"up",...}`. Then sign in with
one of the demo accounts below.

---

## Demo accounts

The seed loads 6 users, 5 projects and 6 weeks of history. The password for all of them
is `Password123`.

| Name | Email | Role |
|---|---|---|
| Admin User | `admin@gmail.com` | Admin |
| Team Manager | `manager@gmail.com` | Manager |
| Savindu Fernando | `savindu@gmail.com` | Member — carries the three-version correction history |
| Nipun Perera | `nipun@gmail.com` | Member — meeting-heavy, skews the task-type chart |
| Fernando Silva | `fernando@gmail.com` | Member — deliberately overloaded |
| S. Fernando | `sfern@gmail.com` | Member — deliberately overloaded, misses weeks |

The dataset is shaped rather than random: the current week deliberately contains one
submitted, one needs-correction, one draft and one member with no report row at all, so
"not yet started" is exercised. Two reports carry real multi-round correction histories,
and the RNG seed is fixed so every machine shows identical numbers.

The seed drives the real `ReportService.submit()` and `ReviewService.review()` instead
of inserting rows directly, so seeded history is indistinguishable from history a user
would create — and seeding fails loudly if the workflow is broken.

**Suggested tour:** sign in as `admin@gmail.com` → Review Queue → open Savindu Fernando's week-3 report
→ open the version history.

---

## Project structure

```
backend/
  app/
    api/v1/        routers — HTTP shape, status codes, response models
    dependencies/  auth gate, per-object gate, pagination
    services/      business rules: workflow, versioning, review, dashboard
    repositories/  the hard queries (dashboard aggregates)
    models/        SQLAlchemy ORM — the schema of record
    schemas/       Pydantic request/response contracts
    seeds/         demo dataset + the ER diagram generator
  tests/           158 tests: auth, rbac, reports, workflow, dashboard, users

frontend/src/
  pages/           one directory per area: auth, reports, manager, projects, admin
  components/      common/ (DataTable, StatusChip, states) + feature components
  hooks/           TanStack Query hooks — the only place the API is called
  routes/          router + permission guards
  contexts/        auth, snackbar, theme mode

docs/              blueprint/, guides, ER diagram
```

Each backend layer only knows the one below it. Routers hold no business logic, and
services raise domain exceptions rather than HTTP ones — a single handler in
`app/main.py` turns those into one error envelope, which is why the frontend needs
exactly one error parser.

---

## Design decisions

The decisions that shape the system. All of them are documented at length in
`docs/blueprint/`.

**Report version history** — the report row holds a live, editable working copy; every
*submit* writes an immutable JSON snapshot. Snapshots denormalise project and member
names into the JSON on purpose: if a project is renamed in June, March's version 1 must
still read as it did in March. Review comments carry a foreign key to the specific
version they were written against, so history stays truthful across correction rounds.

**Two-level authorization** — a role/permission gate decides who may *call an endpoint*,
and an object gate decides who may *touch a given row*. Endpoints depend on permission
codes (`report.review`, `dashboard.view`), never role names, so adding a role is a data
change rather than a code change. A member requesting another member's report gets
`404`, not `403`, so record existence is never leaked.

**Managers cannot edit report content** — structurally, not by convention. The write
gate requires ownership, and the review endpoint's schema contains only `action` and
`comment` with `extra="forbid"`. There is no route that could accept content changes
from a reviewer.

**The workflow is one transition table** — not `if status ==` checks scattered across
services. `APPROVED` is terminal simply by having no entry, and the table is
exhaustively testable without a database.

**"Late" is a documented assumption** — the brief never defines a submission deadline.
This implementation uses week end + `SUBMISSION_DEADLINE_GRACE_HOURS` (default 24),
judged on the *first* submission, so correcting a report never makes it retroactively
late.

**Timestamps in UTC as `DATETIME`** — `TIMESTAMP` is bounded by 2038 and converts by
session timezone, a known source of off-by-one-week bugs in a weekly reporting tool.

---

## Testing

```bash
cd backend && pytest -q                       # 158 tests
cd frontend && npm run typecheck && npm run build
```

`tests/test_rbac.py` is the access-control suite the brief asks for: a member cannot
read, edit or review another member's report; a member cannot reach a manager-only
endpoint; a manager cannot rewrite report content. `tests/conftest.py` builds an app
bound to `TEST_DATABASE_URL`, which is why `create_app()` is a factory rather than a
module-level singleton.

---

## Documentation

| File | What it is |
|---|---|
| `docs/blueprint/` | 17 documents: requirements, architecture, database, RBAC, API, workflow, dashboard, testing, deployment |
| `docs/erd.mmd` | ER diagram (Mermaid), generated from the live schema |
| `docs/erd.puml` | ER diagram (PlantUML), grouped by subsystem |
| `docs/PRESENTATION-GUIDE.md` | Slide-by-slide plan for the technical presentation |
| `docs/VIDEO-DEMO-GUIDE.md` | Shot-by-shot script for the demo video |
| `docs/LIVE-CODING-PLAYBOOK.md` | Preparation for the live coding round |

Regenerate the ER diagram from the current schema:

```bash
cd backend && python -m app.seeds.erd > ../docs/erd.mmd
```

Render the PlantUML version to an image:

```bash
java -jar plantuml.jar -tpng docs/erd.puml
```

---

## Not implemented

Named here rather than left to be discovered:

- **AI chat assistant** (brief §8, good-to-have) — not built. Configuration and an
  `ai.query` permission are scaffolded behind `AI_ENABLED=false`, and the app runs
  fully without any API key. The intended approach is tool-calling over the existing
  dashboard endpoints rather than a separate RAG index, so the assistant would inherit
  the same role-based scoping instead of getting a second, weaker path to the data.
- **Cross-member section comparison** (brief §4, bonus) — viewing one section, e.g.
  Blockers, across all members side by side.
- **Deployment** — local only; there is no hosted instance.
- The dashboard filters by week and project. Filtering by member and by arbitrary date
  range is supported by the API (`user_id`, `from`, `to` on `GET /reports`) but is not
  yet surfaced as dashboard controls; member drill-down is available by clicking
  through to a member profile.
