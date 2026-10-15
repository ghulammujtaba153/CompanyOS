from __future__ import annotations

import enum
import json
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class AccountType(str, enum.Enum):
    """Global account kind on the user row."""

    platform_admin = "platform_admin"
    user = "user"


class OrgMemberRole(str, enum.Enum):
    """Role inside a society / organization."""

    owner = "owner"  # purchased the org (or transferred ownership)
    admin = "admin"  # invited admin of the society
    manager = "manager"  # team lead / approver
    member = "member"  # invited member of the society


class MembershipStatus(str, enum.Enum):
    active = "active"
    invited = "invited"
    suspended = "suspended"


class MembershipSource(str, enum.Enum):
    purchase = "purchase"  # the buyer who created/paid for the society
    invite = "invite"


class ClientStatus(str, enum.Enum):
    active = "active"
    prospect = "prospect"
    paused = "paused"
    churned = "churned"


class ClientUserStatus(str, enum.Enum):
    active = "active"
    invited = "invited"
    suspended = "suspended"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType, name="account_type", native_enum=False),
        nullable=False,
        default=AccountType.user,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    memberships: Mapped[list[OrganizationMember]] = relationship(
        back_populates="user",
        foreign_keys="OrganizationMember.user_id",
    )
    client_links: Mapped[list[ClientUser]] = relationship(back_populates="user")
    owned_organizations: Mapped[list[Organization]] = relationship(
        back_populates="purchaser",
        foreign_keys="Organization.purchaser_user_id",
    )


class Organization(Base):
    """A society / company workspace purchased by an owner."""

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    tagline: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    website: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    industry: Mapped[str] = mapped_column(String(120), nullable=False, default="Software agency")
    company_size: Mapped[str] = mapped_column(String(40), nullable=False, default="11–50")
    headquarters: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    about: Mapped[str] = mapped_column(Text, nullable=False, default="")
    contact_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    contact_phone: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    workspace_label: Mapped[str] = mapped_column(String(120), nullable=False, default="Software agency")
    logo_url: Mapped[str] = mapped_column(String(800), nullable=False, default="")
    logo_public_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # JSON list of {area, capability, roles[]} — empty means use product defaults.
    role_permissions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Stripe SaaS subscription
    stripe_customer_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    stripe_subscription_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    plan_id: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    subscription_status: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    renews_on: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    payment_brand: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    payment_last4: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    purchaser_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    purchaser: Mapped[User] = relationship(
        back_populates="owned_organizations",
        foreign_keys=[purchaser_user_id],
    )
    members: Mapped[list[OrganizationMember]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    departments: Mapped[list[Department]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    clients: Mapped[list[Client]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    work_projects: Mapped[list["WorkProject"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    invites: Mapped[list[Invite]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )


class Department(Base):
    """Team / department inside an organization workspace."""

    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_org_department_name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    head_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "organization_members.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_departments_head_member_id",
        ),
        nullable=True,
    )
    # JSON-encoded list of sidebar hrefs this department may open.
    access_hrefs: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="departments")
    head: Mapped[OrganizationMember | None] = relationship(
        foreign_keys=[head_member_id],
        post_update=True,
    )
    members: Mapped[list[OrganizationMember]] = relationship(
        back_populates="department_ref",
        foreign_keys="OrganizationMember.department_id",
    )

    def access_list(self) -> list[str]:
        try:
            raw = json.loads(self.access_hrefs or "[]")
            return [str(item) for item in raw] if isinstance(raw, list) else []
        except Exception:
            return []

    def set_access_list(self, hrefs: list[str]) -> None:
        self.access_hrefs = json.dumps(list(dict.fromkeys(hrefs)))


class OrganizationMember(Base):
    """Owner (buyer) or invited member/admin of a society."""

    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[OrgMemberRole] = mapped_column(
        Enum(OrgMemberRole, name="org_member_role", native_enum=False),
        nullable=False,
        default=OrgMemberRole.member,
    )
    status: Mapped[MembershipStatus] = mapped_column(
        Enum(MembershipStatus, name="membership_status", native_enum=False),
        nullable=False,
        default=MembershipStatus.active,
    )
    source: Mapped[MembershipSource] = mapped_column(
        Enum(MembershipSource, name="membership_source", native_enum=False),
        nullable=False,
        default=MembershipSource.invite,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    # Denormalized department name kept for legacy MembershipOut / search.
    department: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="SET NULL"), nullable=True
    )
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="members")
    user: Mapped[User] = relationship(
        back_populates="memberships",
        foreign_keys=[user_id],
    )
    invited_by: Mapped[User | None] = relationship(
        foreign_keys=[invited_by_user_id],
    )
    department_ref: Mapped[Department | None] = relationship(
        back_populates="members",
        foreign_keys=[department_id],
    )
    manager: Mapped[OrganizationMember | None] = relationship(
        remote_side="OrganizationMember.id",
        foreign_keys=[manager_id],
    )


class Invite(Base):
    """Pending invite into a society (owner/admin invites a member)."""

    __tablename__ = "invites"
    __table_args__ = (UniqueConstraint("token", name="uq_invite_token"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    role: Mapped[OrgMemberRole] = mapped_column(
        Enum(OrgMemberRole, name="invite_role", native_enum=False),
        nullable=False,
        default=OrgMemberRole.member,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    department: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="SET NULL"), nullable=True
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="invites")


class Client(Base):
    """External client company of a society."""

    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    website: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    industry: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    status: Mapped[ClientStatus] = mapped_column(
        Enum(ClientStatus, name="client_status", native_enum=False),
        nullable=False,
        default=ClientStatus.prospect,
    )
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    internal_owner_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="clients")
    users: Mapped[list[ClientUser]] = relationship(
        back_populates="client",
        cascade="all, delete-orphan",
    )
    engagements: Mapped[list[Engagement]] = relationship(
        back_populates="client",
        cascade="all, delete-orphan",
    )


class Engagement(Base):
    """Client engagement / deal tracked in the Clients pipeline."""

    __tablename__ = "engagements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Draft")
    start_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    due_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    owner_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="SET NULL"), nullable=True
    )
    # JSON arrays for files / phases (matches frontend ClientFile / EngagementPhase).
    files_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    phases_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    work_project_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    work_project_key: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped[Client] = relationship(back_populates="engagements")
    contracts: Mapped[list[Contract]] = relationship(
        back_populates="engagement",
        cascade="all, delete-orphan",
    )

    def files_list(self) -> list:
        try:
            raw = json.loads(self.files_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_files_list(self, files: list) -> None:
        self.files_json = json.dumps(files)

    def phases_list(self) -> list:
        try:
            raw = json.loads(self.phases_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_phases_list(self, phases: list) -> None:
        self.phases_json = json.dumps(phases)


class Contract(Base):
    """Commercial contract / SOW tied to a client engagement."""

    __tablename__ = "contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(40), nullable=False, default="Fixed fee")
    value: Mapped[str] = mapped_column(String(40), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    start_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    renewal_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Draft")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    engagement: Mapped[Engagement] = relationship(back_populates="contracts")
    client: Mapped[Client] = relationship()


class ClientUser(Base):
    """Portal login for a client contact (role = client)."""

    __tablename__ = "client_users"
    __table_args__ = (UniqueConstraint("client_id", "user_id", name="uq_client_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[ClientUserStatus] = mapped_column(
        Enum(ClientUserStatus, name="client_user_status", native_enum=False),
        nullable=False,
        default=ClientUserStatus.active,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped[Client] = relationship(back_populates="users")
    user: Mapped[User] = relationship(back_populates="client_links")


class WorkProject(Base):
    """Work Management project scoped to an organization."""

    __tablename__ = "work_projects"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_work_project_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    team: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    due: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Active")
    visibility: Mapped[str] = mapped_column(String(40), nullable=False, default="Private")
    client_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    client_engagement_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="work_projects")
    members: Mapped[list["WorkProjectMember"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    issues: Mapped[list["WorkIssue"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class WorkProjectMember(Base):
    """Member of a work project (email-keyed, mirrors UI ProjectMember)."""

    __tablename__ = "work_project_members"
    __table_args__ = (UniqueConstraint("project_id", "email", name="uq_work_project_member"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="Member")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Active")
    invited_at: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[WorkProject] = relationship(back_populates="members")


class WorkIssue(Base):
    """Issue / ticket inside a work project. Display id is issue_key (e.g. COS-142)."""

    __tablename__ = "work_issues"
    __table_args__ = (UniqueConstraint("project_id", "issue_key", name="uq_work_issue_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    issue_key: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    priority: Mapped[str] = mapped_column(String(40), nullable=False, default="Medium")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="To do")
    type: Mapped[str] = mapped_column(String(40), nullable=False, default="Task")
    labels_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    assignee: Mapped[str] = mapped_column(String(200), nullable=False, default="Unassigned")
    reporter: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    estimate: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    due_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    comments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    activity_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[WorkProject] = relationship(back_populates="issues")

    def labels_list(self) -> list:
        try:
            raw = json.loads(self.labels_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_labels_list(self, labels: list) -> None:
        self.labels_json = json.dumps(labels)

    def comments_list(self) -> list:
        try:
            raw = json.loads(self.comments_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_comments_list(self, comments: list) -> None:
        self.comments_json = json.dumps(comments)

    def activity_list(self) -> list:
        try:
            raw = json.loads(self.activity_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_activity_list(self, activity: list) -> None:
        self.activity_json = json.dumps(activity)


class CommChannel(Base):
    """Slack-style channel or DM within an organization."""

    __tablename__ = "comm_channels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="channel")
    name: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="Public")
    created_by_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    members: Mapped[list["CommChannelMember"]] = relationship(
        back_populates="channel",
        cascade="all, delete-orphan",
    )
    messages: Mapped[list["CommMessage"]] = relationship(
        back_populates="channel",
        cascade="all, delete-orphan",
    )


class CommChannelMember(Base):
    __tablename__ = "comm_channel_members"
    __table_args__ = (UniqueConstraint("channel_id", "member_id", name="uq_comm_channel_member"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comm_channels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    channel: Mapped[CommChannel] = relationship(back_populates="members")


class CommMessage(Base):
    __tablename__ = "comm_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comm_channels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="SET NULL"), nullable=True
    )
    author_agent_key: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    channel: Mapped[CommChannel] = relationship(back_populates="messages")
    reactions: Mapped[list["CommReaction"]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
    )


class CommReaction(Base):
    __tablename__ = "comm_reactions"
    __table_args__ = (
        UniqueConstraint("message_id", "member_id", "emoji", name="uq_comm_reaction"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comm_messages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    emoji: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    message: Mapped[CommMessage] = relationship(back_populates="reactions")


class TimeEntry(Base):
    """Weekly timesheet line against a work project."""

    __tablename__ = "time_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", "week_start", name="uq_time_entry_week"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    week_start: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    hours: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[WorkProject] = relationship()


class HiringJob(Base):
    """Open role / requisition in People Operations hiring."""

    __tablename__ = "hiring_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    hiring_manager_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    openings: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Open")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    location: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    employment_type: Mapped[str] = mapped_column(String(80), nullable=False, default="Full-time")
    hiring_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    candidates: Mapped[list["HiringCandidate"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
    )

    def hiring_dict(self) -> dict:
        try:
            raw = json.loads(self.hiring_json or "{}")
            return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}

    def set_hiring_dict(self, value: dict) -> None:
        self.hiring_json = json.dumps(value)


class HiringCandidate(Base):
    __tablename__ = "hiring_candidates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hiring_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="Apply form")
    stage: Mapped[str] = mapped_column(String(40), nullable=False, default="Applied")
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    applied_at: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    employee_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    resume_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    interview_token: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    job: Mapped[HiringJob] = relationship(back_populates="candidates")

    def payload_dict(self) -> dict:
        try:
            raw = json.loads(self.payload_json or "{}")
            return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}

    def set_payload_dict(self, value: dict) -> None:
        self.payload_json = json.dumps(value)


class LeaveRequestRow(Base):
    __tablename__ = "leave_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    start: Mapped[str] = mapped_column(String(10), nullable=False)
    end: Mapped[str] = mapped_column(String(10), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Pending")
    approver_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    decision_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OnboardingPlanRow(Base):
    __tablename__ = "onboarding_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    start_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    buddy_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    tasks_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def tasks_list(self) -> list:
        try:
            raw = json.loads(self.tasks_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_tasks_list(self, tasks: list) -> None:
        self.tasks_json = json.dumps(tasks)


class OffboardingPlanRow(Base):
    __tablename__ = "offboarding_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    employee_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    department: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    last_day: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    reason: Mapped[str] = mapped_column(String(80), nullable=False, default="Resignation")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="In progress")
    tasks_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def tasks_list(self) -> list:
        try:
            raw = json.loads(self.tasks_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_tasks_list(self, tasks: list) -> None:
        self.tasks_json = json.dumps(tasks)


class PerformanceCycleRow(Base):
    __tablename__ = "performance_cycles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    employee_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    manager_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    period: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Active")
    goals_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    one_on_ones_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def goals_list(self) -> list:
        try:
            raw = json.loads(self.goals_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_goals_list(self, goals: list) -> None:
        self.goals_json = json.dumps(goals)

    def one_on_ones_list(self) -> list:
        try:
            raw = json.loads(self.one_on_ones_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_one_on_ones_list(self, notes: list) -> None:
        self.one_on_ones_json = json.dumps(notes)


class JobOfferRow(Base):
    __tablename__ = "job_offers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    candidate_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    candidate_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    candidate_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    job_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    job_title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    salary: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    equity_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    start_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    expires_on: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Draft")
    sign_token: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    signed_at: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    signed_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ClientInvoiceRow(Base):
    """Agency accounts-receivable invoices billed to clients."""

    __tablename__ = "client_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    client_id: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    client_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    engagement_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    engagement_title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    issue_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    due_date: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Draft")
    line_items_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def line_items_list(self) -> list:
        try:
            raw = json.loads(self.line_items_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_line_items_list(self, items: list) -> None:
        self.line_items_json = json.dumps(items)


class AuditEventRow(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    at: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    actor: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    action: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    target: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    area: Mapped[str] = mapped_column(String(40), nullable=False, default="Organization")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VaultDocumentRow(Base):
    __tablename__ = "vault_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Optional link to a Work Management project (project-scoped docs).
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="HR")
    owner_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    size_label: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    uploaded_at: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    shared_with: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Active")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    file_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    file_public_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OrgAiSettings(Base):
    __tablename__ = "org_ai_settings"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    default_autonomy: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    default_provider: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AiPassportRow(Base):
    __tablename__ = "ai_passports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_key: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    agent: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    department_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    owner_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    autonomy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capability_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def capability_ids(self) -> list[str]:
        try:
            raw = json.loads(self.capability_ids_json or "[]")
            return [str(x) for x in raw] if isinstance(raw, list) else []
        except Exception:
            return []

    def set_capability_ids(self, ids: list[str]) -> None:
        self.capability_ids_json = json.dumps(ids)


class FirewallRuleRow(Base):
    __tablename__ = "firewall_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_key: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    capability_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    condition: Mapped[str] = mapped_column(String(40), nullable=False, default="Always")
    threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    risk: Mapped[str] = mapped_column(String(40), nullable=False, default="Medium")
    path: Mapped[str] = mapped_column(String(80), nullable=False, default="Accountable owner")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AgentActionRow(Base):
    __tablename__ = "agent_actions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    passport_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    agent: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    capability_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")
    context_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Pending")
    risk: Mapped[str] = mapped_column(String(40), nullable=False, default="Medium")
    required_path: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    reasons_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    decided_by: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    decided_at: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProcessRow(Base):
    __tablename__ = "ai_processes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_key: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    department_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    owner_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    runs_per_week: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    context_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    steps_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProcessRunRow(Base):
    """Executable instance of a process definition."""

    __tablename__ = "ai_process_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_key: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    process_client_key: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    process_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="Running", index=True)
    current_step_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    steps_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    step_results_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    started_by: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def context_dict(self) -> dict:
        try:
            raw = json.loads(self.context_json or "{}")
            return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}

    def steps_list(self) -> list:
        try:
            raw = json.loads(self.steps_snapshot_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def results_list(self) -> list:
        try:
            raw = json.loads(self.step_results_json or "[]")
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def set_context(self, value: dict) -> None:
        self.context_json = json.dumps(value or {})

    def set_steps(self, value: list) -> None:
        self.steps_snapshot_json = json.dumps(value or [])

    def set_results(self, value: list) -> None:
        self.step_results_json = json.dumps(value or [])


class SupportTicketStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class SupportTicketPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class SupportTicket(Base):
    """Platform-ops support ticket (e.g. auto-created from log classification alerts)."""

    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    ticket_key: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[SupportTicketStatus] = mapped_column(
        Enum(SupportTicketStatus, name="support_ticket_status", native_enum=False),
        nullable=False,
        default=SupportTicketStatus.open,
        index=True,
    )
    priority: Mapped[SupportTicketPriority] = mapped_column(
        Enum(SupportTicketPriority, name="support_ticket_priority", native_enum=False),
        nullable=False,
        default=SupportTicketPriority.medium,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    source: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    log_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    classification_label: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    classification_method: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    ai_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    ai_suggested_actions: Mapped[str] = mapped_column(Text, nullable=False, default="")  # JSON list
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_user_id])
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])


class NotificationRow(Base):
    """Per-user internal notification (role-/member-targeted)."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False, default="system", index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    href: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    role_scope: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
