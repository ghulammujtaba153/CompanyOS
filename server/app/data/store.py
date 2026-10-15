from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
from threading import Lock
from uuid import uuid4

from app.models.schemas import (
    AgencyProfile,
    Candidate,
    Client,
    Issue,
    JobRequisition,
    Passport,
    Project,
    ProjectMember,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def today() -> str:
    return date.today().isoformat()


class Store:
    """In-memory demo store seeded to mirror the Next.js client."""

    def __init__(self) -> None:
        self._lock = Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.agency = AgencyProfile(
                name="Acme Labs",
                legal_name="Acme Labs Pvt. Ltd.",
                tagline="We design and ship software for ambitious teams.",
                website="https://acmelabs.io",
                industry="Software agency",
                company_size="11–50",
                headquarters="Remote · Karachi / Dubai",
                about=(
                    "Acme Labs is a software agency building products, platforms, "
                    "and internal tools for startups and mid-market companies."
                ),
                contact_email="hello@acmelabs.io",
                contact_phone="+92 300 0000000",
                workspace_label="Software agency",
            )
            self.clients: list[Client] = [
                Client(
                    id="cli_aurora",
                    name="Sara Khan",
                    company="Aurora Retail",
                    email="sara@auroraretail.com",
                    phone="+1 415 555 0101",
                    website="https://auroraretail.com",
                    industry="Retail",
                    status="Active",
                    owner_id="emp_ali",
                    notes="Retainer for storefront + inventory APIs.",
                    created_at="2025-11-02",
                ),
                Client(
                    id="cli_northwind",
                    name="James Cole",
                    company="Northwind Health",
                    email="james@northwind.health",
                    industry="Healthcare",
                    status="Prospect",
                    owner_id="emp_maya",
                    notes="Discovery for patient portal MVP.",
                    created_at="2026-01-14",
                ),
            ]
            self.projects: list[Project] = [
                Project(
                    id="prj_aurora",
                    key="AUR",
                    name="Aurora storefront",
                    team="Delivery",
                    description="Headless storefront and checkout for Aurora Retail.",
                    due="2026-06-30",
                    status="Active",
                    visibility="Company",
                    created_at="2025-11-10",
                    members=[
                        ProjectMember(
                            email="ali@acmelabs.io",
                            name="Ali Raza",
                            role="Owner",
                            status="Active",
                        ),
                        ProjectMember(
                            email="maya@acmelabs.io",
                            name="Maya Chen",
                            role="Member",
                            status="Active",
                        ),
                    ],
                    client_id="cli_aurora",
                ),
            ]
            self.issues: list[Issue] = [
                Issue(
                    id="iss_aur_1",
                    project_id="prj_aurora",
                    title="Wire Stripe checkout",
                    description="Integrate Stripe Payment Element on cart checkout.",
                    priority="High",
                    status="In progress",
                    type="Story",
                    labels=["payments", "frontend"],
                    assignee="Maya Chen",
                    reporter="Ali Raza",
                    estimate="5",
                    due_date="2026-04-15",
                    created_at="2026-02-01",
                    updated_at="2026-03-20",
                ),
                Issue(
                    id="iss_aur_2",
                    project_id="prj_aurora",
                    title="Inventory sync lag",
                    description="SKU quantities lag warehouse by up to 15 minutes.",
                    priority="Medium",
                    status="Backlog",
                    type="Bug",
                    labels=["backend"],
                    assignee="Unassigned",
                    reporter="Ali Raza",
                    estimate="3",
                    due_date="",
                    created_at="2026-03-01",
                    updated_at="2026-03-01",
                ),
            ]
            self.requisitions: list[JobRequisition] = [
                JobRequisition(
                    id="req_fe",
                    title="Senior Frontend Engineer",
                    department="Engineering",
                    location="Remote",
                    employment_type="Full-time",
                    status="Open",
                    openings=1,
                    created_at="2026-01-08",
                ),
            ]
            self.candidates: list[Candidate] = [
                Candidate(
                    id="can_1",
                    requisition_id="req_fe",
                    name="Noor Ahmed",
                    email="noor@example.com",
                    stage="Interview",
                    score=4.2,
                    notes="Strong React + design systems.",
                    created_at="2026-02-12",
                ),
                Candidate(
                    id="can_2",
                    requisition_id="req_fe",
                    name="Priya Shah",
                    email="priya@example.com",
                    stage="Screen",
                    score=3.8,
                    notes="Solid TypeScript; needs product sense probe.",
                    created_at="2026-03-02",
                ),
            ]
            self.passports: list[Passport] = [
                Passport(
                    id="pass_delivery",
                    agent="Delivery Agent",
                    description="Drafts issues, triages backlog, prepares standups.",
                    department_id="dept_delivery",
                    owner_id="emp_ali",
                    autonomy=3,
                    capability_ids=[
                        "issue.create",
                        "issue.update",
                        "project.create",
                        "brain.ask",
                        "document.search",
                    ],
                    status="Active",
                ),
                Passport(
                    id="pass_hiring",
                    agent="Hiring Agent",
                    description="Screens candidates and drafts interview plans.",
                    department_id="dept_people",
                    owner_id="emp_maya",
                    autonomy=2,
                    capability_ids=[
                        "candidate.read",
                        "interview.schedule",
                        "email.external",
                    ],
                    status="Active",
                ),
            ]
            self.documents: list[dict[str, str]] = [
                {
                    "id": "doc_handbook",
                    "title": "Employee handbook",
                    "body": (
                        "Acme Labs remote-first handbook. Core hours 11:00–16:00 PKT. "
                        "PTO is flexible with manager notice. Security: MFA required."
                    ),
                },
                {
                    "id": "doc_delivery",
                    "title": "Delivery playbook",
                    "body": (
                        "Projects use weekly demos. Issues need estimate and owner before "
                        "In progress. Blocked items escalate after 48 hours."
                    ),
                },
                {
                    "id": "doc_hiring",
                    "title": "Hiring rubric",
                    "body": (
                        "Frontend bar: TypeScript fluency, accessibility, product sense. "
                        "Interview loop: screen, technical, values, manager."
                    ),
                },
            ]

    def new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid4().hex[:8]}"

    def snapshot_agency(self) -> AgencyProfile:
        with self._lock:
            return self.agency.model_copy()

    def update_agency(self, profile: AgencyProfile) -> AgencyProfile:
        with self._lock:
            self.agency = profile.model_copy()
            return self.agency.model_copy()

    def list_clients(self) -> list[Client]:
        with self._lock:
            return deepcopy(self.clients)

    def get_client(self, client_id: str) -> Client | None:
        with self._lock:
            for client in self.clients:
                if client.id == client_id:
                    return client.model_copy()
        return None

    def add_client(self, client: Client) -> Client:
        with self._lock:
            self.clients.append(client)
            return client.model_copy()

    def list_projects(self) -> list[Project]:
        with self._lock:
            return deepcopy(self.projects)

    def get_project(self, project_id: str) -> Project | None:
        with self._lock:
            for project in self.projects:
                if project.id == project_id:
                    return project.model_copy()
        return None

    def add_project(self, project: Project) -> Project:
        with self._lock:
            self.projects.append(project)
            return project.model_copy()

    def list_issues(self, project_id: str | None = None) -> list[Issue]:
        with self._lock:
            issues = self.issues
            if project_id:
                issues = [issue for issue in issues if issue.project_id == project_id]
            return deepcopy(issues)

    def add_issue(self, issue: Issue) -> Issue:
        with self._lock:
            self.issues.append(issue)
            return issue.model_copy()

    def list_requisitions(self) -> list[JobRequisition]:
        with self._lock:
            return deepcopy(self.requisitions)

    def list_candidates(self, requisition_id: str | None = None) -> list[Candidate]:
        with self._lock:
            items = self.candidates
            if requisition_id:
                items = [c for c in items if c.requisition_id == requisition_id]
            return deepcopy(items)

    def list_passports(self) -> list[Passport]:
        with self._lock:
            return deepcopy(self.passports)

    def get_passport(self, passport_id: str) -> Passport | None:
        with self._lock:
            for passport in self.passports:
                if passport.id == passport_id:
                    return passport.model_copy()
        return None

    def search_documents(self, query: str, top_k: int = 5) -> list[dict[str, str]]:
        tokens = [t.lower() for t in query.split() if t.strip()]
        with self._lock:
            scored: list[tuple[int, dict[str, str]]] = []
            for doc in self.documents:
                hay = f"{doc['title']} {doc['body']}".lower()
                score = sum(1 for token in tokens if token in hay) if tokens else 1
                if score > 0:
                    scored.append((score, deepcopy(doc)))
            scored.sort(key=lambda item: item[0], reverse=True)
            return [doc for _, doc in scored[:top_k]]


store = Store()
