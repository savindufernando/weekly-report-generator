"""The cast, the projects and the week-by-week plan for the demo dataset.

Kept separate from the seeding logic so the *shape* of the demo — who is
overloaded, who never submits, which report carries the three-version history —
is readable at a glance and easy to tune.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.models.enums import RoleCode

DEMO_PASSWORD = "Password123"


@dataclass(frozen=True)
class PersonSpec:
    key: str
    full_name: str
    email: str
    role: RoleCode
    job_title: str
    #: Typical hours per week — drives the workload-imbalance analytics.
    hours: tuple[int, int] = (35, 42)
    tasks_per_week: tuple[int, int] = (4, 6)


PEOPLE: list[PersonSpec] = [
    PersonSpec("sarah", "Sarah Chen", "sarah@company.com", RoleCode.ADMIN,
               "Engineering Manager"),
    PersonSpec("david", "David Fernando", "david@company.com", RoleCode.MANAGER,
               "Tech Lead"),
    PersonSpec("amal", "Amal Perera", "amal@company.com", RoleCode.MEMBER,
               "Backend Engineer", (36, 42), (5, 7)),
    PersonSpec("nimali", "Nimali Silva", "nimali@company.com", RoleCode.MEMBER,
               "Frontend Engineer", (34, 40), (4, 6)),
    # Deliberately overloaded — the workload-balance endpoint should flag them.
    PersonSpec("kasun", "Kasun Jayawardena", "kasun@company.com", RoleCode.MEMBER,
               "Full Stack Engineer", (50, 56), (7, 9)),
    # Deliberately underloaded — the other end of the same analytic.
    PersonSpec("tharindu", "Tharindu Bandara", "tharindu@company.com", RoleCode.MEMBER,
               "Junior Engineer", (22, 27), (2, 3)),
    PersonSpec("ishara", "Ishara Wickrama", "ishara@company.com", RoleCode.MEMBER,
               "QA Engineer", (33, 39), (4, 6)),
    PersonSpec("ruwan", "Ruwan Alwis", "ruwan@company.com", RoleCode.MEMBER,
               "Junior Engineer", (30, 36), (3, 5)),
    PersonSpec("dilini", "Dilini Rathnayake", "dilini@company.com", RoleCode.MEMBER,
               "DevOps Engineer", (35, 41), (4, 6)),
    # Meeting-heavy, so the time-by-task-type chart is not all development.
    PersonSpec("praveen", "Praveen Kumar", "praveen@company.com", RoleCode.MEMBER,
               "Solutions Architect", (38, 44), (3, 5)),
]

MEMBER_KEYS = [p.key for p in PEOPLE if p.role is RoleCode.MEMBER]


@dataclass(frozen=True)
class ProjectSpec:
    name: str
    code: str
    description: str
    #: Categorical palette slot order — colour follows the project everywhere.
    color: str
    weight: int


PROJECTS: list[ProjectSpec] = [
    ProjectSpec("Client A Portal", "CLIA",
                "Customer-facing ordering and payments portal", "#2a78d6", 35),
    ProjectSpec("Internal Tooling", "INTL",
                "Admin tools and internal dashboards", "#eb6834", 25),
    ProjectSpec("R&D - AI Features", "RND",
                "Prototypes for AI-assisted reporting", "#1baf7a", 20),
    ProjectSpec("Marketing Site", "MKTG",
                "Public website and campaign landing pages", "#eda100", 12),
    ProjectSpec("Platform Migration", "PLAT",
                "Move from the legacy stack to the new platform", "#e87ba4", 8),
]


@dataclass
class ReviewSpec:
    action: str                 # APPROVE | REQUEST_CHANGES
    comment: str | None
    reviewer: str = "sarah"
    #: Hours after the submission that the review happened.
    delay_hours: int = 4


@dataclass
class RoundSpec:
    """One submit, optionally followed by a review."""

    #: Days after the week's Monday that this submission happened.
    day_offset: int
    hour: int = 17
    review: ReviewSpec | None = None
    #: Content changes applied before this submission (for correction rounds).
    revision: str | None = None


@dataclass
class WeekPlan:
    """What one person did in one week.

    `rounds` empty  -> a DRAFT that was never submitted.
    `rounds` None   -> no report row at all, which is what produces the
                       "not yet started" case the dashboard must surface.
    """

    rounds: list[RoundSpec] | None = field(default_factory=list)
    late: bool = False


def _approved(day: int = 4, reviewer: str = "sarah") -> WeekPlan:
    return WeekPlan(
        rounds=[
            RoundSpec(
                day_offset=day,
                review=ReviewSpec("APPROVE", "Clear and complete, thanks.", reviewer),
            )
        ]
    )


def _late_approved(day: int = 9) -> WeekPlan:
    return WeekPlan(
        rounds=[RoundSpec(day_offset=day, review=ReviewSpec("APPROVE", "Approved.", "sarah"))],
        late=True,
    )


def _submitted(day: int = 4) -> WeekPlan:
    """Submitted and still awaiting review — populates the review queue."""
    return WeekPlan(rounds=[RoundSpec(day_offset=day)])


def _needs_correction(day: int = 4, comment: str = "Please expand this.") -> WeekPlan:
    return WeekPlan(
        rounds=[RoundSpec(day_offset=day, review=ReviewSpec("REQUEST_CHANGES", comment))]
    )


def _draft() -> WeekPlan:
    return WeekPlan(rounds=[])


def _missing() -> WeekPlan:
    return WeekPlan(rounds=None)


#: The three-version correction history that is the demo centrepiece.
AMAL_WEEK_3 = WeekPlan(
    rounds=[
        RoundSpec(
            day_offset=0,
            hour=9,
            review=ReviewSpec(
                "REQUEST_CHANGES",
                "Please add hour estimates to the API integration tasks, and expand "
                "the payment gateway blocker - I need to know whether it is escalated.",
                delay_hours=2,
            ),
        ),
        RoundSpec(
            day_offset=1,
            hour=14,
            revision="hours_added",
            review=ReviewSpec(
                "REQUEST_CHANGES",
                "Better. The Stripe migration task is at 40% actual against 90% planned "
                "with no explanation - add a note on what slipped.",
                delay_hours=2,
            ),
        ),
        RoundSpec(
            day_offset=2,
            hour=10,
            revision="note_added",
            review=ReviewSpec("APPROVE", "Thanks - clear now. Approved.", delay_hours=2),
        ),
    ]
)

#: A simpler two-round history, so the feature does not look like a one-off.
KASUN_WEEK_3 = WeekPlan(
    rounds=[
        RoundSpec(
            day_offset=0,
            review=ReviewSpec(
                "REQUEST_CHANGES",
                "Your hours are well above the team average again. Flag what we can "
                "move off your plate in the blockers section.",
            ),
        ),
        RoundSpec(
            day_offset=2,
            revision="blocker_added",
            review=ReviewSpec("APPROVE", "Thanks for flagging - let's discuss Monday."),
        ),
    ]
)


#: week index 0..5, where 5 is the current week.
PLAN: dict[str, list[WeekPlan]] = {
    "amal":     [_approved(), _approved(3), AMAL_WEEK_3, _approved(), _approved(2), _submitted(1)],
    "nimali":   [_approved(), _approved(), _approved(3), _late_approved(), _approved(),
                 _needs_correction(1, "The blocker on the design handoff needs more detail - "
                                      "who is it blocked on and since when?")],
    "kasun":    [_approved(), _approved(4), KASUN_WEEK_3, _approved(), _approved(3),
                 _submitted(2)],
    "tharindu": [_approved(), _approved(), _approved(), _approved(4), _approved(), _draft()],
    "ishara":   [_approved(), _missing(), _approved(3), _missing(), _approved(),
                 _needs_correction(2, "Two tasks are still at 0% with no blocker recorded. "
                                      "Please explain what held them up.")],
    # A new joiner: no history before week 5.
    "ruwan":    [_missing(), _missing(), _missing(), _missing(), _approved(4), _submitted(3)],
    # Files every week except the current one -> the "not yet started" case.
    "dilini":   [_approved(), _approved(3), _approved(), _approved(), _approved(2), _missing()],
    "praveen":  [_approved(), _approved(), _approved(4), _approved(), _late_approved(8),
                 _draft()],
    # The manager writes reports too.
    "david":    [_approved(3, "sarah"), _approved(3, "sarah"), _approved(2, "sarah"),
                 _approved(3, "sarah"), _approved(3, "sarah"), _submitted(2)],
}


# --------------------------------------------------------------------- content

TASK_NAMES: dict[str, list[str]] = {
    "CLIA": [
        "Implement Stripe payment webhook handler",
        "Fix N+1 query on the orders dashboard",
        "Add address validation to checkout",
        "Migrate the payments table to utf8mb4",
        "Build the refund request flow",
        "Harden the checkout retry logic",
    ],
    "INTL": [
        "Add CSV export to the admin reports page",
        "Rebuild the internal search index",
        "Fix pagination on the audit log",
        "Add role filters to the user list",
    ],
    "RND": [
        "Prototype AI summary of weekly reports",
        "Benchmark embedding models for search",
        "Spike: streaming responses in the chat widget",
    ],
    "MKTG": [
        "Build the pricing page redesign",
        "Fix Lighthouse regressions on mobile",
        "Add the campaign landing page template",
    ],
    "PLAT": [
        "Move the auth service to the new cluster",
        "Write the migration runbook",
        "Set up blue/green deploy for the API",
    ],
}

DELIVERABLES = [
    "PR #482 merged", "Deployed to staging", "Design doc shared",
    "Runbook published", "Demo recorded", "Merged behind a feature flag",
]

BLOCKERS = [
    # Deliberately repeated across people and weeks so the recurring-blocker
    # analytic and the AI summary have something real to find.
    ("Stripe sandbox environment keeps timing out", "HIGH"),
    ("Stripe sandbox environment keeps timing out", "HIGH"),
    ("Waiting on design handoff for the settings page", "MEDIUM"),
    ("Staging database credentials expired", "MEDIUM"),
    ("Blocked on client feedback for the onboarding copy", "LOW"),
    ("Flaky integration tests on CI slow every merge", "MEDIUM"),
]

ACHIEVEMENTS = [
    "Cut checkout page load from 3.2s to 1.1s",
    "Shipped the CSV export customers had been asking for",
    "Reduced failed payment retries by 60%",
    "Onboarded Ruwan onto the payments codebase",
    "Closed out the last of the migration blockers",
    "Got the AI summary prototype working end to end",
]

NEXT_WEEK = [
    "Finish the refund flow and get it reviewed",
    "Pair with Nimali on the settings page",
    "Write up the migration runbook",
    "Clear the remaining CI flakes",
    "Start on the reporting export",
]
