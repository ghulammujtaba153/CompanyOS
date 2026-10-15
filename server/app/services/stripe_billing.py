from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import stripe

from app.config import get_settings

PLAN_CATALOG: dict[str, dict[str, Any]] = {
    "starter": {"name": "Starter", "amount": 4900, "seats": 10},
    "growth": {"name": "Growth", "amount": 14900, "seats": 40},
    "scale": {"name": "Scale", "amount": 39900, "seats": 150},
}

STATUS_MAP = {
    "active": "Active",
    "trialing": "Trialing",
    "past_due": "Past due",
    "canceled": "Canceled",
    "unpaid": "Past due",
    "incomplete": "Incomplete",
    "incomplete_expired": "Canceled",
    "paused": "Paused",
}


def configure_stripe() -> None:
    settings = get_settings()
    if not settings.stripe_configured:
        raise RuntimeError("Set STRIPE_SECRET_KEY in server/.env")
    stripe.api_key = settings.stripe_secret_key.strip()


def plan_price_id(plan_id: str) -> str:
    settings = get_settings()
    mapping = {
        "starter": settings.stripe_price_starter.strip(),
        "growth": settings.stripe_price_growth.strip(),
        "scale": settings.stripe_price_scale.strip(),
    }
    return mapping.get(plan_id, "")


def line_items_for_plan(plan_id: str) -> list[dict[str, Any]]:
    if plan_id not in PLAN_CATALOG:
        raise ValueError("Invalid plan")
    price_id = plan_price_id(plan_id)
    if price_id:
        return [{"price": price_id, "quantity": 1}]
    plan = PLAN_CATALOG[plan_id]
    return [
        {
            "price_data": {
                "currency": "usd",
                "unit_amount": plan["amount"],
                "recurring": {"interval": "month"},
                "product_data": {
                    "name": f"CompanyOS {plan['name']}",
                    "metadata": {"plan_id": plan_id},
                },
            },
            "quantity": 1,
        }
    ]


def ensure_customer(*, customer_id: str, email: str, name: str, org_id: str) -> str:
    configure_stripe()
    if customer_id:
        return customer_id
    customer = stripe.Customer.create(
        email=email or None,
        name=name or None,
        metadata={"organization_id": org_id},
    )
    return str(customer["id"])


def create_checkout_session(
    *,
    customer_id: str,
    plan_id: str,
    org_id: str,
    success_url: str,
    cancel_url: str,
) -> str:
    configure_stripe()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=line_items_for_plan(plan_id),
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=org_id,
        metadata={"organization_id": org_id, "plan_id": plan_id},
        subscription_data={"metadata": {"organization_id": org_id, "plan_id": plan_id}},
        allow_promotion_codes=True,
    )
    return str(session["url"])


def create_portal_session(*, customer_id: str, return_url: str) -> str:
    configure_stripe()
    session = stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)
    return str(session["url"])


def list_customer_invoices(customer_id: str, limit: int = 24) -> list[dict[str, Any]]:
    configure_stripe()
    if not customer_id:
        return []
    invoices = stripe.Invoice.list(customer=customer_id, limit=limit)
    rows: list[dict[str, Any]] = []
    for inv in invoices.auto_paging_iter():
        status = str(inv.get("status") or "")
        mapped = "Open"
        if status == "paid":
            mapped = "Paid"
        elif status in {"uncollectible", "void"}:
            mapped = "Failed"
        elif status == "open":
            mapped = "Open"
        created = inv.get("created")
        date = (
            datetime.fromtimestamp(int(created), tz=timezone.utc).date().isoformat()
            if created
            else ""
        )
        amount = float(inv.get("amount_paid") or inv.get("amount_due") or 0) / 100.0
        rows.append(
            {
                "id": str(inv.get("number") or inv.get("id") or ""),
                "stripeInvoiceId": str(inv.get("id") or ""),
                "date": date,
                "amount": amount,
                "status": mapped,
                "description": str(inv.get("description") or inv.get("billing_reason") or "Subscription"),
                "hostedInvoiceUrl": str(inv.get("hosted_invoice_url") or ""),
                "pdfUrl": str(inv.get("invoice_pdf") or ""),
            }
        )
        if len(rows) >= limit:
            break
    return rows


def map_subscription_status(status: str) -> str:
    return STATUS_MAP.get(status, status.replace("_", " ").title() if status else "")


def renews_on_from_subscription(sub: Any) -> str:
    end = sub.get("current_period_end") if isinstance(sub, dict) else getattr(sub, "current_period_end", None)
    if not end:
        return ""
    return datetime.fromtimestamp(int(end), tz=timezone.utc).date().isoformat()


def plan_id_from_subscription(sub: Any) -> str:
    meta = sub.get("metadata") if isinstance(sub, dict) else getattr(sub, "metadata", None)
    if meta and meta.get("plan_id") in PLAN_CATALOG:
        return str(meta["plan_id"])
    items = sub.get("items") if isinstance(sub, dict) else getattr(sub, "items", None)
    data = items.get("data") if isinstance(items, dict) else getattr(items, "data", None)
    if not data:
        return ""
    first = data[0]
    price = first.get("price") if isinstance(first, dict) else getattr(first, "price", None)
    if not price:
        return ""
    price_id = price.get("id") if isinstance(price, dict) else getattr(price, "id", "")
    settings = get_settings()
    for plan_id, env_price in (
        ("starter", settings.stripe_price_starter),
        ("growth", settings.stripe_price_growth),
        ("scale", settings.stripe_price_scale),
    ):
        if env_price.strip() and env_price.strip() == price_id:
            return plan_id
    product = price.get("product") if isinstance(price, dict) else getattr(price, "product", None)
    # Inline price_data metadata lives on product metadata sometimes; fall back to amount.
    unit = price.get("unit_amount") if isinstance(price, dict) else getattr(price, "unit_amount", None)
    for plan_id, plan in PLAN_CATALOG.items():
        if unit == plan["amount"]:
            return plan_id
    if isinstance(product, str):
        return ""
    return ""


def payment_method_summary(customer_id: str, subscription: Any | None = None) -> tuple[str, str]:
    configure_stripe()
    pm_id = None
    if subscription is not None:
        pm_id = (
            subscription.get("default_payment_method")
            if isinstance(subscription, dict)
            else getattr(subscription, "default_payment_method", None)
        )
    if not pm_id:
        customer = stripe.Customer.retrieve(customer_id)
        invoice_settings = customer.get("invoice_settings") or {}
        pm_id = invoice_settings.get("default_payment_method")
    if not pm_id or isinstance(pm_id, dict):
        if isinstance(pm_id, dict):
            card = pm_id.get("card") or {}
            return str(card.get("brand") or "").title(), str(card.get("last4") or "")
        return "", ""
    pm = stripe.PaymentMethod.retrieve(str(pm_id))
    card = pm.get("card") or {}
    return str(card.get("brand") or "").title(), str(card.get("last4") or "")


def construct_event(payload: bytes, sig_header: str):
    settings = get_settings()
    configure_stripe()
    if not settings.stripe_webhook_secret.strip():
        raise RuntimeError("Set STRIPE_WEBHOOK_SECRET for webhook verification")
    return stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret.strip())
