from fastapi import APIRouter, HTTPException

from app.data import store
from app.models.schemas import (
    GovernanceEvaluateRequest,
    GovernanceEvaluateResponse,
    Passport,
)

router = APIRouter(prefix="/governance", tags=["governance"])

# Capabilities that always need human approval in the demo.
APPROVAL_REQUIRED = {
    "offer.send",
    "payment.execute",
    "vendor.bank_change",
    "pricing.change",
    "data.export",
    "policy.publish",
}


@router.get("/passports", response_model=list[Passport])
def list_passports() -> list[Passport]:
    return store.list_passports()


@router.post("/evaluate", response_model=GovernanceEvaluateResponse)
def evaluate(payload: GovernanceEvaluateRequest) -> GovernanceEvaluateResponse:
    passport = store.get_passport(payload.agent_id)
    if not passport:
        raise HTTPException(status_code=404, detail="Agent passport not found")

    autonomy = passport.autonomy if passport.autonomy is not None else 2

    if passport.status != "Active":
        return GovernanceEvaluateResponse(
            allowed=False,
            decision="deny",
            reason="Agent passport is paused.",
            autonomy_level=autonomy,
            capability_id=payload.capability_id,
            agent_id=payload.agent_id,
        )

    if payload.capability_id not in passport.capability_ids:
        return GovernanceEvaluateResponse(
            allowed=False,
            decision="deny",
            reason="Capability not on agent passport.",
            autonomy_level=autonomy,
            capability_id=payload.capability_id,
            agent_id=payload.agent_id,
        )

    if payload.capability_id in APPROVAL_REQUIRED or autonomy <= 3:
        if autonomy <= 2:
            return GovernanceEvaluateResponse(
                allowed=False,
                decision="require_approval",
                reason="Autonomy level requires human approval before acting.",
                autonomy_level=autonomy,
                capability_id=payload.capability_id,
                agent_id=payload.agent_id,
            )
        if payload.capability_id in APPROVAL_REQUIRED:
            return GovernanceEvaluateResponse(
                allowed=False,
                decision="require_approval",
                reason="Firewall rule: high-risk capability needs approval.",
                autonomy_level=autonomy,
                capability_id=payload.capability_id,
                agent_id=payload.agent_id,
            )

    return GovernanceEvaluateResponse(
        allowed=True,
        decision="allow",
        reason="Within passport capabilities and autonomy level.",
        autonomy_level=autonomy,
        capability_id=payload.capability_id,
        agent_id=payload.agent_id,
    )
