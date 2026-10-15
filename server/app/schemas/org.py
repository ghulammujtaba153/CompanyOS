from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.db.models import ClientStatus, MembershipSource, MembershipStatus, OrgMemberRole


class RolePermissionRow(BaseModel):
    area: str
    capability: str
    roles: list[str] = Field(default_factory=list)


class OrganizationOut(BaseModel):
    id: UUID
    name: str
    slug: str
    legal_name: str
    tagline: str
    website: str
    industry: str
    company_size: str
    headquarters: str
    about: str
    contact_email: str
    contact_phone: str
    workspace_label: str
    logo_url: str = ""
    logo_public_id: str = ""
    role_permissions: list[RolePermissionRow] = Field(default_factory=list)
    stripe_customer_id: str = ""
    stripe_subscription_id: str = ""
    plan_id: str = ""
    subscription_status: str = ""
    renews_on: str = ""
    payment_brand: str = ""
    payment_last4: str = ""
    purchaser_user_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class OrganizationUpdate(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    tagline: str | None = None
    website: str | None = None
    industry: str | None = None
    company_size: str | None = None
    headquarters: str | None = None
    about: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    workspace_label: str | None = None
    logo_url: str | None = None
    role_permissions: list[RolePermissionRow] | None = None


class LogoUploadOut(BaseModel):
    logo_url: str
    logo_public_id: str
    organization: OrganizationOut


class MemberOut(BaseModel):
    id: UUID
    user_id: UUID
    email: EmailStr
    full_name: str
    role: OrgMemberRole
    status: MembershipStatus
    source: MembershipSource
    title: str
    department: str
    department_id: UUID | None = None
    manager_id: UUID | None = None
    joined_at: datetime

    model_config = {"from_attributes": True}


class InviteCreate(BaseModel):
    email: EmailStr
    full_name: str = ""
    role: OrgMemberRole = OrgMemberRole.member
    title: str = ""
    department: str = ""
    department_id: UUID | None = None
    manager_id: UUID | None = None


class MemberCreate(BaseModel):
    """Create an active workspace user directly (no email invite)."""

    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=6, max_length=128)
    role: OrgMemberRole = OrgMemberRole.member
    title: str = ""
    department: str = ""
    department_id: UUID | None = None
    manager_id: UUID | None = None


class InviteOut(BaseModel):
    id: UUID
    organization_id: UUID
    email: EmailStr
    full_name: str = ""
    role: OrgMemberRole
    title: str = ""
    department: str = ""
    department_id: UUID | None = None
    manager_id: UUID | None = None
    token: str
    accepted_at: datetime | None
    created_at: datetime
    invite_url_path: str
    member_id: UUID | None = None
    email_sent: bool = False
    email_detail: str = ""
    user_exists: bool = False

    model_config = {"from_attributes": True}


class MemberUpdate(BaseModel):
    role: OrgMemberRole | None = None
    status: MembershipStatus | None = None
    title: str | None = None
    department: str | None = None
    department_id: UUID | None = None
    manager_id: UUID | None = None
    full_name: str | None = None


class DepartmentOut(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    description: str
    head_member_id: UUID | None = None
    access_hrefs: list[str] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    head_member_id: UUID | None = None
    access_hrefs: list[str] | None = None
    copy_access_from: UUID | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    head_member_id: UUID | None = None
    access_hrefs: list[str] | None = None


class ClientOut(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    company: str
    email: str
    phone: str
    website: str
    industry: str
    status: ClientStatus
    notes: str
    internal_owner_member_id: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    email: str = ""
    phone: str = ""
    website: str = ""
    industry: str = ""
    status: ClientStatus = ClientStatus.prospect
    notes: str = ""
    internal_owner_member_id: UUID | None = None
    # Optional: create a portal login for this client contact
    create_portal_user: bool = False
    portal_password: str | None = Field(default=None, min_length=6, max_length=128)


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    company: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    industry: str | None = None
    status: ClientStatus | None = None
    notes: str | None = None
    internal_owner_member_id: UUID | None = None


class ClientPortalInvite(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=6, max_length=128)


class EngagementOut(BaseModel):
    id: UUID
    organization_id: UUID
    client_id: UUID
    title: str
    description: str
    price: float
    currency: str
    status: str
    start_date: str
    due_date: str
    owner_member_id: UUID | None = None
    files: list[dict] = Field(default_factory=list)
    phases: list[dict] = Field(default_factory=list)
    work_project_id: str = ""
    work_project_key: str = ""
    created_at: datetime
    updated_at: datetime


class EngagementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""
    price: float = 0
    currency: str = "USD"
    status: str = "Draft"
    start_date: str = ""
    due_date: str = ""
    owner_member_id: UUID | None = None
    files: list[dict] | None = None
    phases: list[dict] | None = None


class EngagementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    price: float | None = None
    currency: str | None = None
    status: str | None = None
    start_date: str | None = None
    due_date: str | None = None
    owner_member_id: UUID | None = None
    files: list[dict] | None = None
    phases: list[dict] | None = None
    work_project_id: str | None = None
    work_project_key: str | None = None


class ContractOut(BaseModel):
    id: UUID
    organization_id: UUID
    client_id: UUID
    client_name: str
    engagement_id: UUID
    title: str
    model: str
    value: float
    currency: str
    start_date: str
    renewal_date: str
    status: str
    notes: str
    created_at: datetime
    updated_at: datetime


class ContractCreate(BaseModel):
    client_id: UUID
    engagement_id: UUID
    title: str = Field(min_length=1, max_length=255)
    model: str = "Fixed fee"
    value: float = 0
    currency: str = "USD"
    start_date: str = ""
    renewal_date: str = ""
    status: str = "Draft"
    notes: str = ""


class ContractUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    model: str | None = None
    value: float | None = None
    currency: str | None = None
    start_date: str | None = None
    renewal_date: str | None = None
    status: str | None = None
    notes: str | None = None
    client_id: UUID | None = None
    engagement_id: UUID | None = None


class WorkProjectMemberOut(BaseModel):
    email: str
    name: str
    role: str
    status: str
    invited_at: str = ""


class WorkProjectOut(BaseModel):
    id: UUID
    organization_id: UUID
    key: str
    name: str
    team: str
    description: str
    due: str
    status: str
    visibility: str
    client_id: str = ""
    client_engagement_id: str = ""
    members: list[WorkProjectMemberOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WorkProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    key: str = Field(min_length=2, max_length=5)
    team: str = ""
    description: str = ""
    due: str = ""
    visibility: str = "Private"
    client_id: str = ""
    client_engagement_id: str = ""


class WorkProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    team: str | None = None
    description: str | None = None
    due: str | None = None
    status: str | None = None
    visibility: str | None = None


class WorkProjectMemberCreate(BaseModel):
    email: EmailStr
    role: str = "Member"
    name: str = ""


class WorkProjectMemberUpdate(BaseModel):
    role: str


class WorkIssueCommentOut(BaseModel):
    id: str
    author: str
    initials: str
    body: str
    created_at: str


class WorkIssueActivityOut(BaseModel):
    id: str
    actor: str
    action: str
    created_at: str


class WorkIssueOut(BaseModel):
    id: str  # display key e.g. COS-142
    uuid: UUID
    organization_id: UUID
    project_id: UUID
    title: str
    description: str
    priority: str
    status: str
    type: str
    labels: list[str] = Field(default_factory=list)
    assignee: str
    reporter: str
    estimate: str
    due_date: str
    comments: list[WorkIssueCommentOut] = Field(default_factory=list)
    activity: list[WorkIssueActivityOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WorkIssueCreate(BaseModel):
    project_id: UUID
    title: str = Field(min_length=1, max_length=255)
    description: str = ""
    priority: str = "Medium"
    type: str = "Task"
    status: str = "To do"
    assignee: str = "Unassigned"
    labels: list[str] = Field(default_factory=list)
    estimate: str = ""
    due_date: str = ""


class WorkIssueUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    type: str | None = None
    assignee: str | None = None
    labels: list[str] | None = None
    estimate: str | None = None
    due_date: str | None = None


class WorkIssueCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class TimeEntryOut(BaseModel):
    id: UUID
    organization_id: UUID
    user_id: UUID
    project_id: UUID
    project_name: str
    project_key: str
    week_start: str
    hours: float
    billable: bool
    note: str
    status: str
    created_at: datetime
    updated_at: datetime


class TimeEntryCreate(BaseModel):
    project_id: UUID
    week_start: str = Field(min_length=10, max_length=10)
    hours: float = 0
    billable: bool = True
    note: str = ""


class TimeEntryUpdate(BaseModel):
    hours: float | None = None
    billable: bool | None = None
    note: str | None = None


class TimesheetOut(BaseModel):
    week_start: str
    status: str
    entries: list[TimeEntryOut] = Field(default_factory=list)


class TimesheetSubmit(BaseModel):
    week_start: str = Field(min_length=10, max_length=10)


class CommChannelOut(BaseModel):
    id: UUID
    organization_id: UUID
    kind: str
    name: str
    description: str
    visibility: str
    member_ids: list[UUID] = Field(default_factory=list)
    created_by: UUID | None = None
    created_at: datetime
    last_read_at: datetime | None = None


class CommChannelCreate(BaseModel):
    name: str = Field(min_length=2, max_length=31)
    description: str = ""
    visibility: str = "Public"
    member_ids: list[UUID] = Field(default_factory=list)


class CommChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=31)
    description: str | None = None


class CommMembersAdd(BaseModel):
    member_ids: list[UUID] = Field(min_length=1)


class CommDmCreate(BaseModel):
    member_id: UUID


class CommMessageOut(BaseModel):
    id: UUID
    channel_id: UUID
    author_id: str
    body: str
    created_at: datetime
    edited_at: datetime | None = None
    reactions: dict[str, list[str]] = Field(default_factory=dict)


class CommMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class CommMessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class CommReactionBody(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)
