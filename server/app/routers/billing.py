from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import get_settings
from app.db.models import AccountType, MembershipStatus, Organization, OrganizationMember, OrgMemberRole, User
from app.db.session import get_db
from app.services import stripe_billing

router = APIRouter(prefix="/billing", tags=["billing"])


def _ensure_billing_admin(db: Session, user: User, org_id: UUID) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if user.account_type == AccountType.platform_admin:
        return org
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .first()
    )
    if not membership or membership.role not in (OrgMemberRole.owner, OrgMemberRole.admin):
        raise HTTPException(status_code=403, detail="Owner or admin required for billing")
    return org


def _ensure_org_member(db: Session, user: User, org_id: UUID) -> None:
    if user.account_type == AccountType.platform_admin:
        return
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.status == MembershipStatus.active,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")


class SubscriptionOut(BaseModel):
    organization_id: str
    planId: str = ""
    status: str = ""
    renewsOn: str = ""
    billingEmail: str = ""
    paymentMethod: dict[str, str] = Field(default_factory=dict)
    stripeConfigured: bool = False
    hasCustomer: bool = False


class CheckoutRequest(BaseModel):
    planId: str


class CheckoutOut(BaseModel):
    url: str


class PortalOut(BaseModel):
    url: str


class BillingInvoiceOut(BaseModel):
    id: str
    date: str
    amount: float
    status: str
    description: str
    hostedInvoiceUrl: str = ""
    pdfUrl: str = ""


def _apply_subscription(org: Organization, sub) -> None:
    org.stripe_subscription_id = str(sub.get("id") if isinstance(sub, dict) else sub["id"])
    status = sub.get("status") if isinstance(sub, dict) else sub["status"]
    org.subscription_status = stripe_billing.map_subscription_status(str(status or ""))
    org.plan_id = stripe_billing.plan_id_from_subscription(sub) or org.plan_id
    org.renews_on = stripe_billing.renews_on_from_subscription(sub)
    if org.stripe_customer_id:
        try:
            brand, last4 = stripe_billing.payment_method_summary(org.stripe_customer_id, sub)
            if brand:
                org.payment_brand = brand
            if last4:
                org.payment_last4 = last4
        except Exception:
            pass


@router.get("/subscription", response_model=SubscriptionOut)
def get_subscription(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    _ensure_org_member(db, user, organization_id)
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    settings = get_settings()
    return SubscriptionOut(
        organization_id=str(org.id),
        planId=org.plan_id or "",
        status=org.subscription_status or ("Inactive" if not org.plan_id else ""),
        renewsOn=org.renews_on or "",
        billingEmail=org.contact_email or "",
        paymentMethod={
            "brand": org.payment_brand or "",
            "last4": org.payment_last4 or "",
            "expires": "",
        },
        stripeConfigured=settings.stripe_configured,
        hasCustomer=bool(org.stripe_customer_id),
    )


@router.post("/checkout", response_model=CheckoutOut)
def create_checkout(
    payload: CheckoutRequest,
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CheckoutOut:
    org = _ensure_billing_admin(db, user, organization_id)
    settings = get_settings()
    if not settings.stripe_configured:
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured. Add STRIPE_SECRET_KEY to server/.env",
        )
    if payload.planId not in stripe_billing.PLAN_CATALOG:
        raise HTTPException(status_code=400, detail="Invalid plan")
    try:
        customer_id = stripe_billing.ensure_customer(
            customer_id=org.stripe_customer_id,
            email=org.contact_email or user.email,
            name=org.legal_name or org.name,
            org_id=str(org.id),
        )
        if customer_id != org.stripe_customer_id:
            org.stripe_customer_id = customer_id
            db.commit()
        site = settings.site_url.rstrip("/")
        url = stripe_billing.create_checkout_session(
            customer_id=customer_id,
            plan_id=payload.planId,
            org_id=str(org.id),
            success_url=f"{site}/dashboard/subscription?checkout=success&plan={payload.planId}",
            cancel_url=f"{site}/dashboard/subscription?checkout=cancel",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {exc}") from exc
    return CheckoutOut(url=url)


@router.post("/portal", response_model=PortalOut)
def create_portal(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortalOut:
    org = _ensure_billing_admin(db, user, organization_id)
    settings = get_settings()
    if not settings.stripe_configured:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    if not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer yet — choose a plan first")
    try:
        url = stripe_billing.create_portal_session(
            customer_id=org.stripe_customer_id,
            return_url=f"{settings.site_url.rstrip('/')}/dashboard/subscription/billing",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe portal failed: {exc}") from exc
    return PortalOut(url=url)


@router.get("/invoices", response_model=list[BillingInvoiceOut])
def list_billing_invoices(
    organization_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BillingInvoiceOut]:
    org = _ensure_billing_admin(db, user, organization_id)
    settings = get_settings()
    if not settings.stripe_configured or not org.stripe_customer_id:
        return []
    try:
        rows = stripe_billing.list_customer_invoices(org.stripe_customer_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not load Stripe invoices: {exc}") from exc
    return [BillingInvoiceOut(**row) for row in rows]


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, bool]:
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe_billing.construct_event(payload, sig)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    etype = event["type"]
    data = event["data"]["object"]

    if etype == "checkout.session.completed":
        org_id = (data.get("metadata") or {}).get("organization_id") or data.get("client_reference_id")
        if org_id:
            try:
                org = db.get(Organization, UUID(str(org_id)))
            except Exception:
                org = None
            if org:
                customer = data.get("customer")
                subscription = data.get("subscription")
                if customer:
                    org.stripe_customer_id = str(customer)
                plan = (data.get("metadata") or {}).get("plan_id")
                if plan:
                    org.plan_id = plan
                if subscription:
                    org.stripe_subscription_id = str(subscription)
                    try:
                        import stripe

                        stripe_billing.configure_stripe()
                        sub = stripe.Subscription.retrieve(str(subscription))
                        _apply_subscription(org, sub)
                    except Exception:
                        org.subscription_status = "Active"
                db.commit()

    elif etype in {"customer.subscription.updated", "customer.subscription.created"}:
        org_id = (data.get("metadata") or {}).get("organization_id")
        org = None
        if org_id:
            try:
                org = db.get(Organization, UUID(str(org_id)))
            except Exception:
                org = None
        if org is None and data.get("customer"):
            org = (
                db.query(Organization)
                .filter(Organization.stripe_customer_id == str(data.get("customer")))
                .first()
            )
        if org:
            _apply_subscription(org, data)
            db.commit()

    elif etype == "customer.subscription.deleted":
        customer = data.get("customer")
        org = (
            db.query(Organization).filter(Organization.stripe_customer_id == str(customer)).first()
            if customer
            else None
        )
        if org:
            org.subscription_status = "Canceled"
            org.stripe_subscription_id = ""
            db.commit()

    elif etype in {"invoice.paid", "invoice.payment_failed"}:
        customer = data.get("customer")
        org = (
            db.query(Organization).filter(Organization.stripe_customer_id == str(customer)).first()
            if customer
            else None
        )
        if org and etype == "invoice.payment_failed":
            org.subscription_status = "Past due"
            db.commit()

    return {"ok": True}
