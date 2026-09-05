"""Demo dataset.

    python -m app.seeds.seed            # seed if empty
    python -m app.seeds.seed --reset    # wipe and rebuild

The important design choice: this drives the real `ReportService.submit()` and
`ReviewService.review()` rather than inserting rows directly. Consequences:

* version snapshots are produced by the real VersionService, so seeded history
  is genuinely identical to history a user would create;
* `submission_count`, `first_submitted_at` and `current_version_no` stay
  consistent with each other — hand-inserted rows drift and produce a dashboard
  that quietly contradicts itself;
* the seed doubles as an integration test. If the workflow is broken, seeding
  fails loudly.
"""
from __future__ import annotations

import argparse
import random
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.database.session import SessionLocal, engine
from app.models import (
    BlockerSeverity,
    ReviewAction,
    Achievement,
    Blocker,
    NextWeekTask,
    Project,
    Report,
    ReportHours,
    ReportTask,
    Role,
    TaskPriority,
    TaskStatus,
    TaskType,
    User,
)
from app.seeds.data import (
    ACHIEVEMENTS,
    BLOCKERS,
    DELIVERABLES,
    DEMO_PASSWORD,
    NEXT_WEEK,
    PEOPLE,
    PLAN,
    PROJECTS,
    TASK_NAMES,
    WeekPlan,
)
from app.seeds.reference import seed_roles_and_permissions
from app.services.report_service import ReportService
from app.services.review_service import ReviewService
from app.utils.week import monday_of

#: Fixed seed so the demo is identical on every machine — a reviewer and you
#: should be looking at exactly the same numbers.
RNG = random.Random(20260302)

WEEK_COUNT = 6

TABLES_IN_DELETE_ORDER = [
    "review_history", "report_versions", "activity_logs",
    "report_hours", "report_achievements", "report_blockers",
    "report_next_week_tasks", "report_tasks", "reports",
    "project_members", "projects", "refresh_tokens", "users",
    "role_permissions", "permissions", "roles",
]


def reset(db: Session) -> None:
    """Wipe the dataset in foreign-key-safe order.

    DELETE rather than TRUNCATE: TRUNCATE on InnoDB tables that participate in
    foreign keys is unreliable on MariaDB 10.4 — it took the server down mid-run
    during development. DELETE is transactional, honours the FK graph, and at
    demo-data volumes the performance difference is irrelevant.
    """
    for table in TABLES_IN_DELETE_ORDER:
        db.execute(text(f"DELETE FROM {table}"))
    # Reset AUTO_INCREMENT so a reseed produces stable, low ids — nicer for
    # demo URLs and for talking through the data.
    for table in TABLES_IN_DELETE_ORDER:
        db.execute(text(f"ALTER TABLE {table} AUTO_INCREMENT = 1"))
    db.commit()


# ------------------------------------------------------------------- builders


def seed_users(db: Session, roles: dict[str, Role]) -> dict[str, User]:
    users: dict[str, User] = {}
    for spec in PEOPLE:
        user = User(
            email=spec.email,
            password_hash=hash_password(DEMO_PASSWORD),
            full_name=spec.full_name,
            role_id=roles[spec.role.value].id,
            job_title=spec.job_title,
            is_active=True,
        )
        db.add(user)
        users[spec.key] = user
    db.flush()

    # Everyone reports to Sarah except Sarah herself.
    for key, user in users.items():
        if key != "sarah":
            user.manager_id = users["sarah"].id
    db.flush()
    return users


def seed_projects(db: Session, creator: User) -> list[Project]:
    projects = []
    for spec in PROJECTS:
        project = Project(
            name=spec.name,
            code=spec.code,
            description=spec.description,
            color=spec.color,
            created_by=creator.id,
        )
        db.add(project)
        projects.append(project)
    db.flush()
    return projects


def _weighted_project(projects: list[Project]) -> Project:
    weights = [next(p.weight for p in PROJECTS if p.code == proj.code) for proj in projects]
    return RNG.choices(projects, weights=weights, k=1)[0]


def build_content(
    db: Session,
    report: Report,
    person_key: str,
    project: Project,
    *,
    revision: str | None = None,
) -> None:
    """Populate a report with believable content.

    `revision` mutates the content the way a correction would, so successive
    versions genuinely differ and the diff between them is meaningful.
    """
    # Clear and flush before inserting replacements, for the same reason as
    # ReportService._replace_children: otherwise the INSERT of the new key
    # blocker/achievement precedes the DELETE of the old one, and the unique
    # index on the generated key_guard column rejects the momentary duplicate.
    report.tasks.clear()
    report.next_week_tasks.clear()
    report.blockers.clear()
    report.achievements.clear()
    report.hours.clear()
    db.flush()

    spec = next(p for p in PEOPLE if p.key == person_key)
    task_count = RNG.randint(*spec.tasks_per_week)
    names = RNG.sample(TASK_NAMES[project.code], k=min(task_count, len(TASK_NAMES[project.code])))
    total_hours = RNG.randint(*spec.hours)

    tasks: list[ReportTask] = []
    remaining = total_hours
    for index, name in enumerate(names):
        last = index == len(names) - 1
        hours = remaining if last else RNG.randint(2, max(3, remaining // 2))
        remaining = max(remaining - hours, 0)

        planned = RNG.choice([60, 80, 90, 100])
        # The first round deliberately understates hours; the correction adds them.
        actual = planned if RNG.random() > 0.25 else RNG.choice([40, 50, 70])
        status = TaskStatus.COMPLETED if actual >= 90 else TaskStatus.IN_PROGRESS

        tasks.append(
            ReportTask(
                name=name,
                priority=RNG.choice(list(TaskPriority)),
                status=status,
                planned_pct=planned,
                actual_pct=actual,
                hours_planned=Decimal(hours),
                hours_spent=Decimal("0") if revision is None and index == 0 else Decimal(hours),
                deliverable=RNG.choice(DELIVERABLES) if status is TaskStatus.COMPLETED else None,
                order_index=index,
            )
        )

    if revision == "hours_added":
        for task in tasks:
            task.hours_spent = task.hours_planned
    if revision == "note_added":
        for task in tasks:
            task.hours_spent = task.hours_planned
        report.notes = (
            "The Stripe migration slipped because the sandbox was unavailable for "
            "two days; the remaining 50% carries into next week."
        )

    report.tasks = tasks

    blocker_count = 2 if person_key == "kasun" else RNG.randint(0, 2)
    chosen = RNG.sample(BLOCKERS, k=min(blocker_count, len(BLOCKERS)))
    if revision == "blocker_added":
        chosen = [("Sustained overload - need two tasks reassigned", "HIGH"), *chosen][:3]
    report.blockers = [
        Blocker(
            description=description,
            severity=BlockerSeverity(severity),
            # Exactly one key blocker: the database also enforces this via a
            # generated column and a unique index.
            is_key=(index == 0),
            is_resolved=RNG.random() < 0.3,
            order_index=index,
        )
        for index, (description, severity) in enumerate(chosen)
    ]

    achievement_count = RNG.randint(1, 2)
    report.achievements = [
        Achievement(description=text_, is_key=(index == 0), order_index=index)
        for index, text_ in enumerate(RNG.sample(ACHIEVEMENTS, k=achievement_count))
    ]

    report.next_week_tasks = [
        NextWeekTask(description=text_, priority=RNG.choice(list(TaskPriority)), order_index=i)
        for i, text_ in enumerate(RNG.sample(NEXT_WEEK, k=RNG.randint(1, 3)))
    ]

    # Praveen is meeting-heavy on purpose, so the time-by-type chart is not
    # simply "development" for everyone.
    if person_key == "praveen":
        split = {
            TaskType.MEETINGS: Decimal(RNG.randint(15, 18)),
            TaskType.DEVELOPMENT: Decimal(total_hours - 22),
            TaskType.DOCUMENTATION: Decimal(4),
        }
    else:
        dev = int(total_hours * 0.65)
        split = {
            TaskType.DEVELOPMENT: Decimal(dev),
            TaskType.TESTING: Decimal(int(total_hours * 0.15)),
            TaskType.MEETINGS: Decimal(int(total_hours * 0.12)),
            TaskType.DOCUMENTATION: Decimal(max(total_hours - dev - int(total_hours * 0.27), 1)),
        }
    report.hours = [
        ReportHours(task_type=task_type, hours=hours)
        for task_type, hours in split.items()
        if hours > 0
    ]
    db.flush()


# ---------------------------------------------------------------------- driver


def run_week(
    db: Session,
    *,
    person_key: str,
    user: User,
    users: dict[str, User],
    projects: list[Project],
    week_start: date,
    plan: WeekPlan,
) -> Report | None:
    if plan.rounds is None:
        return None  # no report row at all -> "not yet started"

    project = _weighted_project(projects)
    report = Report(
        user_id=user.id,
        project_id=project.id,
        week_start=week_start,
        current_version_no=0,
        submission_count=0,
    )
    db.add(report)
    db.flush()

    build_content(db, report, person_key, project)
    db.commit()

    if not plan.rounds:
        return report  # left as a DRAFT

    reports = ReportService(db)
    reviews = ReviewService(db)

    for round_ in plan.rounds:
        if round_.revision:
            build_content(db, report, person_key, project, revision=round_.revision)
            db.commit()

        submitted_at = datetime.combine(week_start, datetime.min.time()) + timedelta(
            days=round_.day_offset, hours=round_.hour
        )
        reports.submit(report, user, at=submitted_at)

        if round_.review:
            reviews.review(
                report,
                users[round_.review.reviewer],
                action=ReviewAction(round_.review.action),
                comment=round_.review.comment,
                at=submitted_at + timedelta(hours=round_.review.delay_hours),
            )
    return report


def seed(db: Session, *, do_reset: bool = False) -> None:
    if do_reset:
        reset(db)
    elif db.scalar(select(func.count()).select_from(User)):
        print("Database already seeded. Pass --reset to rebuild.")
        return

    roles = seed_roles_and_permissions(db)
    users = seed_users(db, roles)
    projects = seed_projects(db, users["sarah"])
    db.commit()

    current = monday_of(date.today())
    weeks = [current - timedelta(weeks=offset) for offset in range(WEEK_COUNT - 1, -1, -1)]

    created = 0
    for person_key, week_plans in PLAN.items():
        for index, plan in enumerate(week_plans):
            report = run_week(
                db,
                person_key=person_key,
                user=users[person_key],
                users=users,
                projects=projects,
                week_start=weeks[index],
                plan=plan,
            )
            if report is not None:
                created += 1

    db.commit()
    _summarise(db, created, weeks)


def _summarise(db: Session, created: int, weeks: list[date]) -> None:
    from app.models import ReportVersion, ReviewHistory

    versions = db.scalar(select(func.count()).select_from(ReportVersion)) or 0
    reviews = db.scalar(select(func.count()).select_from(ReviewHistory)) or 0
    multi = db.scalar(
        select(func.count()).select_from(Report).where(Report.current_version_no >= 2)
    ) or 0

    print(f"  users            {db.scalar(select(func.count()).select_from(User))}")
    print(f"  projects         {db.scalar(select(func.count()).select_from(Project))}")
    print(f"  reports          {created}")
    print(f"  versions         {versions}")
    print(f"  review actions   {reviews}")
    print(f"  multi-version    {multi}  (reports with a real correction history)")
    print(f"  weeks            {weeks[0]} .. {weeks[-1]}")
    print(f"\n  Log in as sarah@company.com / {DEMO_PASSWORD} (admin)")
    print("  Start at the Review Queue, then open Amal Perera's week-3 report")
    print("  to see the three-version correction history.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the demo dataset")
    parser.add_argument("--reset", action="store_true", help="wipe existing data first")
    args = parser.parse_args()

    with SessionLocal() as session:
        seed(session, do_reset=args.reset)
    engine.dispose()
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
