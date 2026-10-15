from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str
    version: str
    environment: str


class AgencyProfile(BaseModel):
    name: str
    legal_name: str = ""
    tagline: str = ""
    website: str = ""
    industry: str = "Software agency"
    company_size: str = "11–50"
    headquarters: str = ""
    about: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    workspace_label: str = "Software agency"


class Client(BaseModel):
    id: str
    name: str
    company: str
    email: str = ""
    phone: str = ""
    website: str = ""
    industry: str = ""
    status: Literal["Active", "Prospect", "Paused", "Churned"] = "Active"
    owner_id: str = ""
    notes: str = ""
    created_at: str


class ClientCreate(BaseModel):
    name: str
    company: str
    email: str = ""
    phone: str = ""
    website: str = ""
    industry: str = ""
    status: Literal["Active", "Prospect", "Paused", "Churned"] = "Prospect"
    owner_id: str = ""
    notes: str = ""


class ProjectMember(BaseModel):
    email: str
    name: str
    role: Literal["Owner", "Admin", "Member", "Viewer"] = "Member"
    status: Literal["Active", "Invited"] = "Active"


class Project(BaseModel):
    id: str
    key: str
    name: str
    team: str = ""
    description: str = ""
    due: str = ""
    status: Literal["Active", "On hold", "Completed"] = "Active"
    visibility: Literal["Private", "Company"] = "Company"
    created_at: str
    members: list[ProjectMember] = Field(default_factory=list)
    client_id: str | None = None


class ProjectCreate(BaseModel):
    key: str
    name: str
    team: str = ""
    description: str = ""
    due: str = ""
    status: Literal["Active", "On hold", "Completed"] = "Active"
    visibility: Literal["Private", "Company"] = "Company"
    client_id: str | None = None


class Issue(BaseModel):
    id: str
    project_id: str
    title: str
    description: str = ""
    priority: Literal["Critical", "High", "Medium", "Low"] = "Medium"
    status: Literal["Backlog", "To do", "In progress", "In review", "Blocked", "Done"] = "Backlog"
    type: Literal["Epic", "Story", "Bug", "Task", "Ticket"] = "Task"
    labels: list[str] = Field(default_factory=list)
    assignee: str = "Unassigned"
    reporter: str = ""
    estimate: str = ""
    due_date: str = ""
    created_at: str
    updated_at: str


class IssueCreate(BaseModel):
    project_id: str
    title: str
    description: str = ""
    priority: Literal["Critical", "High", "Medium", "Low"] = "Medium"
    status: Literal["Backlog", "To do", "In progress", "In review", "Blocked", "Done"] = "Backlog"
    type: Literal["Epic", "Story", "Bug", "Task", "Ticket"] = "Task"
    labels: list[str] = Field(default_factory=list)
    assignee: str = "Unassigned"
    reporter: str = ""
    estimate: str = ""
    due_date: str = ""


class JobRequisition(BaseModel):
    id: str
    title: str
    department: str = ""
    location: str = ""
    employment_type: str = "Full-time"
    status: Literal["Draft", "Open", "On hold", "Closed"] = "Open"
    openings: int = 1
    created_at: str


class Candidate(BaseModel):
    id: str
    requisition_id: str
    name: str
    email: str = ""
    stage: Literal[
        "Applied",
        "Screen",
        "Interview",
        "Offer",
        "Hired",
        "Rejected",
    ] = "Applied"
    score: float | None = None
    notes: str = ""
    created_at: str


class Passport(BaseModel):
    id: str
    agent: str
    description: str = ""
    department_id: str | None = None
    owner_id: str
    autonomy: int | None = None
    capability_ids: list[str] = Field(default_factory=list)
    status: Literal["Active", "Paused"] = "Active"


class GovernanceEvaluateRequest(BaseModel):
    agent_id: str
    capability_id: str
    context: dict[str, str | int | float | bool] = Field(default_factory=dict)


class GovernanceEvaluateResponse(BaseModel):
    allowed: bool
    decision: Literal["allow", "deny", "require_approval"]
    reason: str
    autonomy_level: int
    capability_id: str
    agent_id: str


class BrainAskRequest(BaseModel):
    question: str
    top_k: int = 5


class BrainAskResponse(BaseModel):
    answer: str
    sources: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class WorkDraftRequest(BaseModel):
    project_id: str | None = None
    prompt: str
    kind: Literal["issue", "triage", "standup"] = "issue"


class WorkDraftResponse(BaseModel):
    kind: str
    title: str | None = None
    body: str
    suggestions: list[str] = Field(default_factory=list)
