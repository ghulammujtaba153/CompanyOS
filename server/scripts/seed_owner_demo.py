"""Seed CompanyX (owner: ghulammujtaba.dro@gmail.com) with full dummy data.

Teammates reuse the owner's password_hash (same login password).
Run:  python scripts/seed_owner_demo.py  (from server/, with venv active)
"""

from __future__ import annotations

import json
import secrets
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

# Allow `python scripts/seed_owner_demo.py` from server/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.orm import Session

from app.db.models import (
    AccountType,
    AgentActionRow,
    AiPassportRow,
    AuditEventRow,
    Client,
    ClientInvoiceRow,
    ClientStatus,
    ClientUser,
    ClientUserStatus,
    CommChannel,
    CommChannelMember,
    CommMessage,
    Contract,
    Engagement,
    FirewallRuleRow,
    HiringCandidate,
    HiringJob,
    JobOfferRow,
    LeaveRequestRow,
    MembershipSource,
    MembershipStatus,
    NotificationRow,
    OffboardingPlanRow,
    OnboardingPlanRow,
    OrgAiSettings,
    Organization,
    OrganizationMember,
    OrgMemberRole,
    PerformanceCycleRow,
    ProcessRow,
    ProcessRunRow,
    TimeEntry,
    User,
    VaultDocumentRow,
    WorkIssue,
    WorkProject,
    WorkProjectMember,
)
from app.db.session import get_session_factory
from app.services import process_runtime

OWNER_EMAIL = "ghulammujtaba.dro@gmail.com"
ORG_ID = UUID("10f725f6-88d2-420e-ba65-ab973f832d37")

TEAM = [
    {
        "email": "maya@companyx.demo",
        "full_name": "Maya Patel",
        "role": OrgMemberRole.admin,
        "title": "Engineering Manager",
        "department": "Engineering",
    },
    {
        "email": "daniel@companyx.demo",
        "full_name": "Daniel Okafor",
        "role": OrgMemberRole.member,
        "title": "Software Engineer",
        "department": "Engineering",
    },
    {
        "email": "olivia@companyx.demo",
        "full_name": "Olivia Chen",
        "role": OrgMemberRole.member,
        "title": "People Ops Lead",
        "department": "People Operations",
    },
    {
        "email": "finance@companyx.demo",
        "full_name": "Aisha Rahman",
        "role": OrgMemberRole.member,
        "title": "Finance Analyst",
        "department": "Finance",
    },
]

CLIENT_PORTAL = {
    "email": "sara@northwind.demo",
    "full_name": "Sara Khan",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> str:
    return date.today().isoformat()


def _iso_days(delta: int) -> str:
    return (date.today() + timedelta(days=delta)).isoformat()


def _dep_map(db: Session, org_id: UUID) -> dict[str, UUID]:
    from app.db.models import Department

    rows = db.query(Department).filter(Department.organization_id == org_id).all()
    return {d.name.lower(): d.id for d in rows}


def ensure_users(db: Session, owner: User) -> dict[str, User]:
    """Create teammate users sharing the owner's password hash."""
    out: dict[str, User] = {OWNER_EMAIL: owner}
    for item in TEAM + [CLIENT_PORTAL]:
        email = item["email"]
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name=item["full_name"],
                password_hash=owner.password_hash,
                account_type=AccountType.user,
                is_active=True,
            )
            db.add(user)
            db.flush()
            print(f"  + user {email}")
        else:
            # Keep login in sync with owner password.
            user.password_hash = owner.password_hash
            if not user.full_name:
                user.full_name = item["full_name"]
            print(f"  = user {email} (password synced)")
        out[email] = user
    db.flush()
    return out


def ensure_members(db: Session, org: Organization, users: dict[str, User], owner: User) -> dict[str, OrganizationMember]:
    deps = _dep_map(db, org.id)
    members: dict[str, OrganizationMember] = {}

    owner_m = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == owner.id)
        .first()
    )
    if not owner_m:
        raise RuntimeError("Owner membership missing")
    owner_m.role = OrgMemberRole.owner
    owner_m.status = MembershipStatus.active
    owner_m.title = owner_m.title or "Founder & CEO"
    if not owner_m.department:
        owner_m.department = "Leadership"
    if not owner_m.department_id and "leadership" in deps:
        owner_m.department_id = deps["leadership"]
    members[OWNER_EMAIL] = owner_m

    for item in TEAM:
        user = users[item["email"]]
        m = (
            db.query(OrganizationMember)
            .filter(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == user.id)
            .first()
        )
        dep_name = item["department"]
        if not m:
            m = OrganizationMember(
                organization_id=org.id,
                user_id=user.id,
                role=item["role"],
                status=MembershipStatus.active,
                source=MembershipSource.invite,
                title=item["title"],
                department=dep_name,
                department_id=deps.get(dep_name.lower()),
                invited_by_user_id=owner.id,
            )
            db.add(m)
            db.flush()
            print(f"  + member {item['email']} ({item['role'].value})")
        members[item["email"]] = m

    db.flush()
    maya = members.get("maya@companyx.demo")
    daniel = members.get("daniel@companyx.demo")
    olivia = members.get("olivia@companyx.demo")
    if maya:
        maya.manager_id = owner_m.id
    if daniel and maya:
        daniel.manager_id = maya.id
    if olivia:
        olivia.manager_id = owner_m.id
    finance = members.get("finance@companyx.demo")
    if finance:
        finance.manager_id = owner_m.id
    db.flush()
    return members


def enrich_org(db: Session, org: Organization, owner: User) -> None:
    org.legal_name = org.legal_name or "CompanyX Pvt. Ltd."
    org.tagline = org.tagline or "Ship software with an AI-ready operating system."
    org.website = org.website or "https://companyx.demo"
    org.industry = org.industry or "Software agency"
    org.company_size = org.company_size or "11–50"
    org.headquarters = org.headquarters or "Remote · Karachi / Dubai"
    org.about = org.about or "CompanyX builds products and internal tools for ambitious teams."
    org.contact_email = org.contact_email or OWNER_EMAIL
    org.contact_phone = org.contact_phone or "+92 300 555 0100"
    org.workspace_label = org.workspace_label or "Software agency"
    org.purchaser_user_id = owner.id


def seed_clients_and_work(
    db: Session,
    org: Organization,
    members: dict[str, OrganizationMember],
    users: dict[str, User],
    owner: User,
) -> tuple[list[Client], list[WorkProject], list[Engagement]]:
    owner_m = members[OWNER_EMAIL]
    maya = members.get("maya@companyx.demo")
    clients_spec = [
        {
            "company": "Northwind Retail",
            "name": "Sara Khan",
            "email": "sara@northwind.demo",
            "phone": "+1 415 555 0101",
            "website": "https://northwind.demo",
            "industry": "Retail",
            "notes": "Retainer for storefront + inventory APIs.",
            "engagement": "Storefront modernization",
            "price": "48000",
            "project_key": "NWR",
            "project_name": "Northwind Storefront",
        },
        {
            "company": "Helios Health",
            "name": "James Okonkwo",
            "email": "james@helios.demo",
            "phone": "+1 617 555 0144",
            "website": "https://helios.demo",
            "industry": "Healthcare",
            "notes": "Patient portal MVP and integrations.",
            "engagement": "Patient portal MVP",
            "price": "72000",
            "project_key": "HEL",
            "project_name": "Helios Patient Portal",
        },
        {
            "company": "Orbit Logistics",
            "name": "Priya Nair",
            "email": "priya@orbit.demo",
            "phone": "+44 20 7946 0958",
            "website": "https://orbit.demo",
            "industry": "Logistics",
            "notes": "Ops dashboard and carrier integrations.",
            "engagement": "Ops control tower",
            "price": "36000",
            "project_key": "ORB",
            "project_name": "Orbit Control Tower",
        },
    ]

    clients: list[Client] = []
    projects: list[WorkProject] = []
    engagements: list[Engagement] = []

    for spec in clients_spec:
        client = (
            db.query(Client)
            .filter(Client.organization_id == org.id, Client.company == spec["company"])
            .first()
        )
        if not client:
            client = Client(
                organization_id=org.id,
                name=spec["name"],
                company=spec["company"],
                email=spec["email"],
                phone=spec["phone"],
                website=spec["website"],
                industry=spec["industry"],
                status=ClientStatus.active,
                notes=spec["notes"],
                internal_owner_member_id=owner_m.id,
            )
            db.add(client)
            db.flush()
            print(f"  + client {spec['company']}")
        clients.append(client)

        if spec["email"] == CLIENT_PORTAL["email"]:
            portal = users[CLIENT_PORTAL["email"]]
            link = (
                db.query(ClientUser)
                .filter(ClientUser.client_id == client.id, ClientUser.user_id == portal.id)
                .first()
            )
            if not link:
                db.add(
                    ClientUser(
                        client_id=client.id,
                        user_id=portal.id,
                        status=ClientUserStatus.active,
                    )
                )

        eng = (
            db.query(Engagement)
            .filter(
                Engagement.organization_id == org.id,
                Engagement.client_id == client.id,
                Engagement.title == spec["engagement"],
            )
            .first()
        )
        project = (
            db.query(WorkProject)
            .filter(WorkProject.organization_id == org.id, WorkProject.key == spec["project_key"])
            .first()
        )
        if not project:
            project = WorkProject(
                organization_id=org.id,
                key=spec["project_key"],
                name=spec["project_name"],
                team="Engineering",
                description=f"Delivery board for {spec['company']}.",
                due=_iso_days(60),
                status="Active",
                visibility="Client",
                client_id=str(client.id),
            )
            db.add(project)
            db.flush()
            print(f"  + project {spec['project_key']}")
        projects.append(project)

        for email, role in [
            (OWNER_EMAIL, "Owner"),
            ("maya@companyx.demo", "Admin"),
            ("daniel@companyx.demo", "Member"),
        ]:
            user = users.get(email)
            if not user:
                continue
            pm = (
                db.query(WorkProjectMember)
                .filter(WorkProjectMember.project_id == project.id, WorkProjectMember.email == email)
                .first()
            )
            if not pm:
                db.add(
                    WorkProjectMember(
                        project_id=project.id,
                        email=email,
                        name=user.full_name,
                        role=role,
                        status="Active",
                        invited_at=_today(),
                    )
                )

        if not eng:
            eng = Engagement(
                organization_id=org.id,
                client_id=client.id,
                title=spec["engagement"],
                description=spec["notes"],
                price=spec["price"],
                currency="USD",
                status="Active",
                start_date=_iso_days(-30),
                due_date=_iso_days(90),
                owner_member_id=owner_m.id,
                work_project_id=str(project.id),
                work_project_key=project.key,
            )
            eng.set_phases_list(
                [
                    {"id": "ph1", "name": "Discovery", "status": "Done", "dueDate": _iso_days(-20)},
                    {"id": "ph2", "name": "Build", "status": "In progress", "dueDate": _iso_days(45)},
                    {"id": "ph3", "name": "Launch", "status": "Planned", "dueDate": _iso_days(90)},
                ]
            )
            db.add(eng)
            db.flush()
            print(f"  + engagement {spec['engagement']}")
        engagements.append(eng)

        project.client_engagement_id = str(eng.id)

        contract = (
            db.query(Contract)
            .filter(Contract.organization_id == org.id, Contract.engagement_id == eng.id)
            .first()
        )
        if not contract:
            db.add(
                Contract(
                    organization_id=org.id,
                    client_id=client.id,
                    engagement_id=eng.id,
                    title=f"{spec['company']} MSA + SOW",
                    model="Fixed fee",
                    value=spec["price"],
                    currency="USD",
                    start_date=_iso_days(-30),
                    renewal_date=_iso_days(335),
                    status="Active",
                    notes="Auto-seeded demo contract.",
                )
            )
            print(f"  + contract for {spec['company']}")

        inv = (
            db.query(ClientInvoiceRow)
            .filter(
                ClientInvoiceRow.organization_id == org.id,
                ClientInvoiceRow.client_id == str(client.id),
                ClientInvoiceRow.number == f"INV-{spec['project_key']}-001",
            )
            .first()
        )
        if not inv:
            amount = float(spec["price"]) / 3
            row = ClientInvoiceRow(
                organization_id=org.id,
                number=f"INV-{spec['project_key']}-001",
                client_id=str(client.id),
                client_name=spec["company"],
                engagement_id=str(eng.id),
                engagement_title=spec["engagement"],
                issue_date=_iso_days(-7),
                due_date=_iso_days(23),
                amount=amount,
                currency="USD",
                status="Sent",
            )
            row.set_line_items_list(
                [
                    {
                        "id": "li1",
                        "description": f"{spec['engagement']} — milestone 1",
                        "quantity": 1,
                        "unitPrice": amount,
                    }
                ]
            )
            db.add(row)
            print(f"  + invoice INV-{spec['project_key']}-001")

    db.flush()

    # Issues on first two projects
    issue_specs = [
        (projects[0], "NWR-1", "Set up product catalog sync", "In progress", "High", "Daniel Okafor"),
        (projects[0], "NWR-2", "Checkout performance budget", "To do", "Medium", "Maya Patel"),
        (projects[0], "NWR-3", "Client UAT checklist", "To do", "Low", "Ghulam Mujtaba"),
        (projects[1], "HEL-1", "Auth + patient identity", "In progress", "High", "Maya Patel"),
        (projects[1], "HEL-2", "Appointment booking API", "To do", "High", "Daniel Okafor"),
        (projects[2], "ORB-1", "Carrier webhook ingest", "To do", "Medium", "Daniel Okafor"),
    ]
    for project, key, title, status, priority, assignee in issue_specs:
        exists = (
            db.query(WorkIssue)
            .filter(WorkIssue.organization_id == org.id, WorkIssue.issue_key == key)
            .first()
        )
        if exists:
            continue
        issue = WorkIssue(
            organization_id=org.id,
            project_id=project.id,
            issue_key=key,
            title=title,
            description=f"Seeded work item for {project.name}.",
            priority=priority,
            status=status,
            type="Task",
            assignee=assignee,
            reporter=owner.full_name or "Ghulam Mujtaba",
            estimate="8h",
            due_date=_iso_days(14),
        )
        issue.set_labels_list(["seed", "delivery"])
        issue.set_activity_list(
            [{"at": _today(), "actor": owner.full_name, "text": "Created from demo seed."}]
        )
        db.add(issue)
        print(f"  + issue {key}")

    # Time entries
    week = date.today() - timedelta(days=date.today().weekday())
    week_start = week.isoformat()
    for email, hours in [(OWNER_EMAIL, 6.0), ("maya@companyx.demo", 32.0), ("daniel@companyx.demo", 38.0)]:
        user = users[email]
        project = projects[0]
        te = (
            db.query(TimeEntry)
            .filter(
                TimeEntry.user_id == user.id,
                TimeEntry.project_id == project.id,
                TimeEntry.week_start == week_start,
            )
            .first()
        )
        if not te:
            db.add(
                TimeEntry(
                    organization_id=org.id,
                    user_id=user.id,
                    project_id=project.id,
                    week_start=week_start,
                    hours=hours,
                    billable=True,
                    note="Demo timesheet week",
                    status="submitted",
                )
            )
            print(f"  + time {email} {hours}h")

    return clients, projects, engagements


def seed_comms(db: Session, org: Organization, members: dict[str, OrganizationMember]) -> None:
    owner_m = members[OWNER_EMAIL]
    channel = (
        db.query(CommChannel)
        .filter(CommChannel.organization_id == org.id, CommChannel.name == "general")
        .first()
    )
    if not channel:
        channel = CommChannel(
            organization_id=org.id,
            kind="channel",
            name="general",
            description="Company-wide updates",
            visibility="Public",
            created_by_member_id=owner_m.id,
        )
        db.add(channel)
        db.flush()
        print("  + channel #general")

    eng_ch = (
        db.query(CommChannel)
        .filter(CommChannel.organization_id == org.id, CommChannel.name == "delivery")
        .first()
    )
    if not eng_ch:
        eng_ch = CommChannel(
            organization_id=org.id,
            kind="channel",
            name="delivery",
            description="Client delivery coordination",
            visibility="Public",
            created_by_member_id=owner_m.id,
        )
        db.add(eng_ch)
        db.flush()
        print("  + channel #delivery")

    for ch in (channel, eng_ch):
        for m in members.values():
            exists = (
                db.query(CommChannelMember)
                .filter(CommChannelMember.channel_id == ch.id, CommChannelMember.member_id == m.id)
                .first()
            )
            if not exists:
                db.add(CommChannelMember(channel_id=ch.id, member_id=m.id))

    if db.query(CommMessage).filter(CommMessage.channel_id == channel.id).count() == 0:
        db.add(
            CommMessage(
                channel_id=channel.id,
                author_member_id=owner_m.id,
                body="Welcome to CompanyX — this workspace is seeded with demo work, clients, and AI processes.",
            )
        )
        maya = members.get("maya@companyx.demo")
        if maya:
            db.add(
                CommMessage(
                    channel_id=channel.id,
                    author_member_id=maya.id,
                    body="Engineering standup notes will land in #delivery. Ping me for board access.",
                )
            )
        print("  + channel messages")


def seed_people_ops(db: Session, org: Organization, members: dict[str, OrganizationMember]) -> None:
    owner_m = members[OWNER_EMAIL]
    olivia = members.get("olivia@companyx.demo")
    daniel = members.get("daniel@companyx.demo")
    deps = _dep_map(db, org.id)

    job = (
        db.query(HiringJob)
        .filter(HiringJob.organization_id == org.id, HiringJob.title == "Senior Frontend Engineer")
        .first()
    )
    hiring_config = {
        "applyForm": {
            "slug": "senior-frontend-engineer",
            "expiresAt": (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat(),
            "welcomeMessage": (
                "Apply for Senior Frontend Engineer. Share your background and we will "
                "review applications after the form closes."
            ),
            "published": True,
        },
        "captureDelaySeconds": 5,
        "interviewLinkHours": 48,
        "questions": [
            {
                "id": "q1",
                "prompt": "Why are you interested in the Senior Frontend Engineer role?",
                "seconds": 90,
                "approved": True,
            },
            {
                "id": "q2",
                "prompt": "Describe a challenging React project you owned end-to-end.",
                "seconds": 120,
                "approved": True,
            },
        ],
        "passScore": 70,
    }
    if not job:
        job = HiringJob(
            organization_id=org.id,
            title="Senior Frontend Engineer",
            department_id=str(deps.get("engineering", "")),
            hiring_manager_id=str(owner_m.id),
            openings=1,
            status="Open",
            description="Ship dashboard UX for client portals and internal ops tools.",
            location="Remote",
            employment_type="Full-time",
        )
        job.set_hiring_dict(hiring_config)
        db.add(job)
        db.flush()
        print("  + hiring job")
    elif not (job.hiring_dict or {}).get("applyForm"):
        job.set_hiring_dict(hiring_config)
        print("  ~ hiring job applyForm repaired")

    cand = (
        db.query(HiringCandidate)
        .filter(HiringCandidate.organization_id == org.id, HiringCandidate.email == "alex@candidate.demo")
        .first()
    )
    if not cand:
        cand = HiringCandidate(
            organization_id=org.id,
            job_id=job.id,
            name="Alex Rivera",
            email="alex@candidate.demo",
            source="LinkedIn",
            stage="Interview",
            rating=4,
            notes="Strong React + design systems.",
            applied_at=_iso_days(-12),
            phone="+1 555 010 8899",
            resume_note="8 years product frontend",
            interview_token=secrets.token_hex(8),
        )
        db.add(cand)
        db.flush()
        print("  + candidate")

    offer = (
        db.query(JobOfferRow)
        .filter(JobOfferRow.organization_id == org.id, JobOfferRow.candidate_email == "alex@candidate.demo")
        .first()
    )
    if not offer:
        db.add(
            JobOfferRow(
                organization_id=org.id,
                candidate_id=str(cand.id),
                candidate_name="Alex Rivera",
                candidate_email="alex@candidate.demo",
                job_id=str(job.id),
                job_title=job.title,
                salary=135000,
                currency="USD",
                equity_note="0.15% over 4 years",
                start_date=_iso_days(30),
                expires_on=_iso_days(14),
                status="Sent",
                sign_token=secrets.token_hex(8),
                created_at=_today(),
            )
        )
        print("  + job offer")

    if daniel and db.query(LeaveRequestRow).filter(LeaveRequestRow.organization_id == org.id).count() == 0:
        db.add(
            LeaveRequestRow(
                organization_id=org.id,
                employee_id=str(daniel.id),
                type="Annual",
                start=_iso_days(10),
                end=_iso_days(14),
                reason="Family travel",
                status="Pending",
                approver_id=str(owner_m.id),
                created_at=_today(),
            )
        )
        print("  + leave request")

    if daniel and db.query(OnboardingPlanRow).filter(OnboardingPlanRow.organization_id == org.id).count() == 0:
        plan = OnboardingPlanRow(
            organization_id=org.id,
            employee_id=str(daniel.id),
            start_date=_iso_days(-60),
            buddy_id=str(members["maya@companyx.demo"].id) if members.get("maya@companyx.demo") else "",
        )
        plan.set_tasks_list(
            [
                {"id": "t1", "title": "Laptop + accounts", "done": True},
                {"id": "t2", "title": "Shadow first client stand-up", "done": True},
                {"id": "t3", "title": "Complete security training", "done": False},
            ]
        )
        db.add(plan)
        print("  + onboarding plan")

    if (
        olivia
        and db.query(PerformanceCycleRow).filter(PerformanceCycleRow.organization_id == org.id).count() == 0
    ):
        cycle = PerformanceCycleRow(
            organization_id=org.id,
            employee_id=str(olivia.id),
            employee_name="Olivia Chen",
            title="People Ops Lead",
            manager_name=owner_m.user.full_name if owner_m.user else "Ghulam Mujtaba",
            period="2026 H2",
            status="Active",
        )
        cycle.set_goals_list(
            [
                {"id": "g1", "title": "Cut time-to-hire to 28 days", "progress": 40},
                {"id": "g2", "title": "Launch onboarding playbook", "progress": 70},
            ]
        )
        cycle.set_one_on_ones_list(
            [{"id": "o1", "date": _iso_days(-7), "notes": "Hiring pipeline healthy; focus on FE role."}]
        )
        db.add(cycle)
        print("  + performance cycle")

    if db.query(OffboardingPlanRow).filter(OffboardingPlanRow.organization_id == org.id).count() == 0:
        off = OffboardingPlanRow(
            organization_id=org.id,
            employee_id="alumni-demo",
            employee_name="Jordan Lee",
            title="Designer",
            department="Engineering",
            last_day=_iso_days(21),
            reason="Resignation",
            status="In progress",
        )
        off.set_tasks_list(
            [
                {"id": "ot1", "title": "Revoke SaaS access", "done": False},
                {"id": "ot2", "title": "Collect laptop", "done": False},
                {"id": "ot3", "title": "Exit interview", "done": False},
            ]
        )
        db.add(off)
        print("  + offboarding plan")


def seed_governance_and_docs(
    db: Session,
    org: Organization,
    owner: User,
    members: dict[str, OrganizationMember],
    projects: list[WorkProject],
) -> None:
    if not db.get(OrgAiSettings, org.id):
        db.add(OrgAiSettings(organization_id=org.id, default_autonomy=3, default_provider=""))
        print("  + org AI settings")

    # Passports / rules / processes via existing seeders when empty
    if db.query(AiPassportRow).filter(AiPassportRow.organization_id == org.id).count() == 0:
        defaults = [
            ("pp-recruiting", "Recruiting Agent", "dep-people", ["candidate.read", "interview.schedule", "calendar.invite", "offer.send", "email.external", "document.search"], 3),
            ("pp-finance", "Finance Agent", "dep-finance", ["invoice.read", "payment.prepare", "payment.execute"], 4),
            ("pp-people", "People Ops Agent", "dep-people", ["onboarding.draft", "leave.update", "calendar.invite", "brain.ask", "document.search"], 2),
            ("pp-delivery", "Delivery Agent", "dep-engineering", ["project.create", "issue.create", "issue.update", "brain.ask", "document.search"], 4),
        ]
        for key, agent, dep, caps, autonomy in defaults:
            row = AiPassportRow(
                organization_id=org.id,
                client_key=key,
                agent=agent,
                description=f"{agent} (demo)",
                department_id=dep,
                owner_id=str(members[OWNER_EMAIL].id),
                autonomy=autonomy,
                status="Active",
            )
            row.set_capability_ids(caps)
            db.add(row)
        rules = [
            ("fr-offer", "offer.send", "Always", 0, "High", "Executive"),
            ("fr-payment", "payment.execute", "Amount over", 500, "Medium", "Department head"),
            ("fr-project", "project.create", "Always", 0, "Low", "Auto-execute"),
        ]
        for key, cap, cond, thr, risk, path in rules:
            db.add(
                FirewallRuleRow(
                    organization_id=org.id,
                    client_key=key,
                    capability_id=cap,
                    condition=cond,
                    threshold=thr,
                    risk=risk,
                    path=path,
                    enabled=True,
                )
            )
        db.flush()
        print("  + passports + rules")

    process_runtime.seed_default_processes(db, org.id)

    if db.query(AgentActionRow).filter(AgentActionRow.organization_id == org.id).count() == 0:
        db.add(
            AgentActionRow(
                organization_id=org.id,
                passport_id="pp-finance",
                agent="Finance Agent",
                capability_id="payment.execute",
                title="Pay Northwind milestone invoice",
                detail="Demo approval for $16,000 vendor/client payout prep.",
                context_json=json.dumps({"amount": 16000, "external": True, "records": 0}),
                status="Pending",
                risk="Medium",
                required_path="Department head",
                reasons_json=json.dumps(["Amount over $500 → Department head"]),
                created_at=_now().replace(microsecond=0).isoformat(),
            )
        )
        print("  + pending approval")

    proc = (
        db.query(ProcessRow)
        .filter(ProcessRow.organization_id == org.id, ProcessRow.client_key == "proc-purchase")
        .first()
    )
    if proc and db.query(ProcessRunRow).filter(ProcessRunRow.organization_id == org.id).count() == 0:
        run = ProcessRunRow(
            organization_id=org.id,
            client_key=f"run-{uuid4().hex[:10]}",
            process_client_key="proc-purchase",
            process_name=proc.name,
            status="WaitingApproval",
            current_step_index=3,
            started_by=str(owner.id),
            note="Demo run paused on payment.execute",
        )
        run.set_context({"amount": 1200, "records": 0, "external": True})
        try:
            steps = json.loads(proc.steps_json or "[]")
        except Exception:
            steps = []
        run.set_steps(steps if isinstance(steps, list) else [])
        run.set_results(
            [
                {"stepId": "s1", "name": "Review purchase request", "status": "Completed", "decision": "Auto-execute", "at": _today()},
                {"stepId": "s2", "name": "Match invoice to request", "status": "Completed", "decision": "Auto-execute", "at": _today()},
                {"stepId": "s3", "name": "Prepare payment", "status": "Completed", "decision": "Auto-execute", "at": _today()},
                {"stepId": "s4", "name": "Execute payment", "status": "WaitingApproval", "decision": "Needs approval", "at": _today()},
            ]
        )
        db.add(run)
        print("  + process run")

    if db.query(VaultDocumentRow).filter(VaultDocumentRow.organization_id == org.id).count() < 3:
        docs = [
            ("Employee Handbook", "HR", "Policy overview for CompanyX."),
            ("Northwind SOW", "Legal", "Statement of work for storefront modernization."),
            ("Security checklist", "Security", "Baseline controls for client delivery."),
        ]
        for name, cat, body in docs:
            exists = (
                db.query(VaultDocumentRow)
                .filter(VaultDocumentRow.organization_id == org.id, VaultDocumentRow.name == name)
                .first()
            )
            if exists:
                continue
            db.add(
                VaultDocumentRow(
                    organization_id=org.id,
                    project_id=projects[0].id if projects and cat == "Legal" else None,
                    name=name,
                    category=cat,
                    owner_name=owner.full_name or "Ghulam Mujtaba",
                    size_label="12 KB",
                    uploaded_at=_today(),
                    shared_with="Leadership",
                    status="Active",
                    body=body,
                )
            )
            print(f"  + document {name}")

    if db.query(AuditEventRow).filter(AuditEventRow.organization_id == org.id).count() < 3:
        for action, target, area in [
            ("Updated organization profile", "CompanyX", "Organization"),
            ("Created client", "Northwind Retail", "Clients"),
            ("Opened hiring job", "Senior Frontend Engineer", "People"),
        ]:
            db.add(
                AuditEventRow(
                    organization_id=org.id,
                    at=_now().replace(microsecond=0).isoformat(),
                    actor=owner.full_name or OWNER_EMAIL,
                    action=action,
                    target=target,
                    area=area,
                )
            )
        print("  + audit events")

    if (
        db.query(NotificationRow)
        .filter(NotificationRow.organization_id == org.id, NotificationRow.recipient_user_id == owner.id)
        .count()
        == 0
    ):
        db.add(
            NotificationRow(
                organization_id=org.id,
                recipient_user_id=owner.id,
                actor_user_id=owner.id,
                kind="governance",
                title="Demo workspace ready",
                body="Clients, projects, hiring, and process runs have been seeded for CompanyX.",
                href="/dashboard/processes",
                entity_type="organization",
                entity_id=str(org.id),
            )
        )
        print("  + notification")


def main() -> None:
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        owner = db.query(User).filter(User.email == OWNER_EMAIL).first()
        if not owner:
            raise SystemExit(f"User not found: {OWNER_EMAIL}")
        org = db.get(Organization, ORG_ID)
        if not org:
            raise SystemExit(f"Organization not found: {ORG_ID}")

        print(f"Seeding for {owner.email} -> {org.name} ({org.id})")
        enrich_org(db, org, owner)
        users = ensure_users(db, owner)
        members = ensure_members(db, org, users, owner)
        clients, projects, engagements = seed_clients_and_work(db, org, members, users, owner)
        seed_comms(db, org, members)
        seed_people_ops(db, org, members)
        seed_governance_and_docs(db, org, owner, members, projects)
        db.commit()
        print("Done.")
        print(f"Owner login: {OWNER_EMAIL} (existing password)")
        print("Teammates (same password as owner):")
        for item in TEAM:
            print(f"  - {item['email']}")
        print(f"Client portal: {CLIENT_PORTAL['email']} (same password)")
        _ = clients, engagements
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
