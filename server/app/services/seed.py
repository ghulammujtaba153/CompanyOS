from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.config import get_settings
from app.db.models import (
    AccountType,
    Client,
    ClientStatus,
    ClientUser,
    ClientUserStatus,
    Department,
    MembershipSource,
    MembershipStatus,
    Organization,
    OrganizationMember,
    OrgMemberRole,
    User,
)

# Matches client seedDepartmentAccess / baselineAccess for the demo org.
_BASELINE = [
    "/dashboard/work-management",
    "/dashboard/work-management/projects",
    "/dashboard/work-management/tasks",
    "/dashboard/communications",
    "/dashboard/documents",
    "/dashboard/analytics",
    "/dashboard/subscription",
]


def _grant(*extra: str) -> str:
    hrefs = list(dict.fromkeys([*_BASELINE, *extra]))
    return json.dumps(hrefs)


def ensure_platform_admin(db: Session) -> None:
    """Create or refresh the platform admin from ADMIN_EMAIL / ADMIN_PASSWORD."""
    settings = get_settings()
    email = (settings.admin_email or "").strip().lower()
    password = (settings.admin_password or "").strip()
    if not email or not password:
        return

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        db.add(
            User(
                email=email,
                full_name="Platform Admin",
                password_hash=hash_password(password),
                account_type=AccountType.platform_admin,
                is_active=True,
            )
        )
        db.commit()
        return

    changed = False
    if user.account_type != AccountType.platform_admin:
        user.account_type = AccountType.platform_admin
        changed = True
    if not user.is_active:
        user.is_active = True
        changed = True
    # Keep password in sync with .env while developing so local login always works.
    if (settings.app_env or "").strip().lower() in {"development", "dev", "local"}:
        user.password_hash = hash_password(password)
        changed = True
    if changed:
        db.commit()


def seed_demo_if_empty(db: Session) -> None:
    settings = get_settings()
    admin_email = (settings.admin_email or "admin@companyos.io").strip().lower()
    admin_password = (settings.admin_password or "admin1234").strip() or "admin1234"

    # Idempotent: skip if any seed account already exists.
    if (
        db.query(User)
        .filter(User.email.in_([admin_email, "admin@companyos.io", "ghulam@acmelabs.io"]))
        .first()
        is not None
    ):
        ensure_departments_for_existing(db)
        ensure_platform_admin(db)
        return

    admin = User(
        email=admin_email,
        full_name="Platform Admin",
        password_hash=hash_password(admin_password),
        account_type=AccountType.platform_admin,
    )
    owner = User(
        email="ghulam@acmelabs.io",
        full_name="Ghulam Ahmed",
        password_hash=hash_password("demo1234"),
        account_type=AccountType.user,
    )
    admin_member = User(
        email="maya@acmelabs.io",
        full_name="Maya Patel",
        password_hash=hash_password("demo1234"),
        account_type=AccountType.user,
    )
    member = User(
        email="daniel@acmelabs.io",
        full_name="Daniel Okafor",
        password_hash=hash_password("demo1234"),
        account_type=AccountType.user,
    )
    client_person = User(
        email="sara@auroraretail.com",
        full_name="Sara Khan",
        password_hash=hash_password("demo1234"),
        account_type=AccountType.user,
    )
    db.add_all([admin, owner, admin_member, member, client_person])
    db.flush()

    org = Organization(
        name="Acme Labs",
        slug="acme-labs",
        legal_name="Acme Labs Pvt. Ltd.",
        tagline="We design and ship software for ambitious teams.",
        website="https://acmelabs.io",
        industry="Software agency",
        company_size="11–50",
        headquarters="Remote · Karachi / Dubai",
        about="Acme Labs builds products, platforms, and internal tools.",
        contact_email="hello@acmelabs.io",
        contact_phone="+92 300 0000000",
        workspace_label="Software agency",
        purchaser_user_id=owner.id,
    )
    db.add(org)
    db.flush()

    leadership = Department(
        organization_id=org.id,
        name="Leadership",
        description="Sets company direction",
        access_hrefs=_grant(
            "/dashboard/organization",
            "/dashboard/people-operations",
            "/dashboard/clients",
            "/dashboard/finance",
            "/dashboard/governance",
            "/dashboard/approvals",
            "/dashboard/ai-automation",
            "/dashboard/ai-workforce",
            "/dashboard/processes",
            "/dashboard/integrations",
            "/dashboard/company-brain",
        ),
    )
    engineering = Department(
        organization_id=org.id,
        name="Engineering",
        description="Builds products and internal systems",
        access_hrefs=_grant(
            "/dashboard/ai-automation",
            "/dashboard/ai-workforce",
            "/dashboard/processes",
            "/dashboard/integrations",
        ),
    )
    people_ops = Department(
        organization_id=org.id,
        name="People Operations",
        description="Employee experience and hiring",
        access_hrefs=_grant(
            "/dashboard/organization",
            "/dashboard/people-operations",
            "/dashboard/approvals",
            "/dashboard/ai-automation",
            "/dashboard/company-brain",
        ),
    )
    revenue = Department(
        organization_id=org.id,
        name="Revenue",
        description="Growth and customer relationships",
        access_hrefs=_grant("/dashboard/analytics", "/dashboard/clients", "/dashboard/finance"),
    )
    operations = Department(
        organization_id=org.id,
        name="Operations",
        description="Systems, vendors, and delivery",
        access_hrefs=_grant(
            "/dashboard/ai-automation",
            "/dashboard/processes",
            "/dashboard/integrations",
            "/dashboard/governance",
            "/dashboard/approvals",
        ),
    )
    finance = Department(
        organization_id=org.id,
        name="Finance",
        description="Company financial operations",
        access_hrefs=_grant(
            "/dashboard/approvals",
            "/dashboard/analytics",
            "/dashboard/finance",
            "/dashboard/clients",
            "/dashboard/ai-automation",
        ),
    )
    db.add_all([leadership, engineering, people_ops, revenue, operations, finance])
    db.flush()

    owner_member = OrganizationMember(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgMemberRole.owner,
        status=MembershipStatus.active,
        source=MembershipSource.purchase,
        title="Founder & CEO",
        department="Leadership",
        department_id=leadership.id,
    )
    maya_member = OrganizationMember(
        organization_id=org.id,
        user_id=admin_member.id,
        role=OrgMemberRole.admin,
        status=MembershipStatus.active,
        source=MembershipSource.invite,
        title="Engineering Manager",
        department="Engineering",
        department_id=engineering.id,
        invited_by_user_id=owner.id,
    )
    daniel_member = OrganizationMember(
        organization_id=org.id,
        user_id=member.id,
        role=OrgMemberRole.member,
        status=MembershipStatus.active,
        source=MembershipSource.invite,
        title="Software Engineer",
        department="Engineering",
        department_id=engineering.id,
        invited_by_user_id=admin_member.id,
    )
    db.add_all([owner_member, maya_member, daniel_member])
    db.flush()

    maya_member.manager_id = owner_member.id
    daniel_member.manager_id = maya_member.id
    leadership.head_member_id = owner_member.id
    engineering.head_member_id = maya_member.id
    db.flush()

    client = Client(
        organization_id=org.id,
        name="Sara Khan",
        company="Aurora Retail",
        email="sara@auroraretail.com",
        phone="+1 415 555 0101",
        website="https://auroraretail.com",
        industry="Retail",
        status=ClientStatus.active,
        notes="Retainer for storefront + inventory APIs.",
    )
    db.add(client)
    db.flush()
    db.add(
        ClientUser(
            client_id=client.id,
            user_id=client_person.id,
            status=ClientUserStatus.active,
        )
    )
    db.commit()


def ensure_departments_for_existing(db: Session) -> None:
    """Backfill default departments for orgs created before the department table existed."""
    orgs = db.query(Organization).all()
    changed = False
    for org in orgs:
        if db.query(Department).filter(Department.organization_id == org.id).first():
            # Link members that only have a department name.
            members = (
                db.query(OrganizationMember)
                .filter(
                    OrganizationMember.organization_id == org.id,
                    OrganizationMember.department_id.is_(None),
                    OrganizationMember.department != "",
                )
                .all()
            )
            if not members:
                continue
            deps = {
                d.name.lower(): d
                for d in db.query(Department).filter(Department.organization_id == org.id).all()
            }
            for member in members:
                dep = deps.get(member.department.lower())
                if dep:
                    member.department_id = dep.id
                    changed = True
            continue

        defaults = [
            ("Leadership", "Sets company direction", _grant()),
            ("Engineering", "Builds products and internal systems", _grant()),
            ("People Operations", "Employee experience and hiring", _grant()),
            ("Revenue", "Growth and customer relationships", _grant()),
            ("Operations", "Systems, vendors, and delivery", _grant()),
            ("Finance", "Company financial operations", _grant()),
        ]
        created: dict[str, Department] = {}
        for name, description, access in defaults:
            dep = Department(
                organization_id=org.id,
                name=name,
                description=description,
                access_hrefs=access,
            )
            db.add(dep)
            created[name.lower()] = dep
        db.flush()
        changed = True

        for member in (
            db.query(OrganizationMember).filter(OrganizationMember.organization_id == org.id).all()
        ):
            if member.department and member.department.lower() in created:
                member.department_id = created[member.department.lower()].id
            elif not member.department and "leadership" in created:
                member.department = "Leadership"
                member.department_id = created["leadership"].id

    if changed:
        db.commit()
