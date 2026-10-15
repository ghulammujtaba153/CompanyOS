from __future__ import annotations

from typing import Any

AUTONOMY_NAMES = {
    0: "Observe",
    1: "Recommend",
    2: "Draft",
    3: "Execute with approval",
    4: "Conditional autonomy",
    5: "Autonomous",
}

PATH_RANK = {
    "Auto-execute": 0,
    "Accountable owner": 1,
    "Department head": 2,
    "Executive": 3,
    "Legal / security review": 4,
    "Block": 5,
}


def condition_label(rule: dict[str, Any]) -> str:
    condition = rule.get("condition")
    threshold = rule.get("threshold") or 0
    if condition == "Amount over":
        return f"Amount over ${float(threshold):,.0f}"
    if condition == "Records over":
        return f"More than {float(threshold):,.0f} records"
    if condition == "External party":
        return "Involves an external party"
    return "Always"


def _rule_matches(rule: dict[str, Any], context: dict[str, Any]) -> bool:
    condition = rule.get("condition")
    threshold = float(rule.get("threshold") or 0)
    if condition == "Always":
        return True
    if condition == "Amount over":
        return float(context.get("amount") or 0) > threshold
    if condition == "Records over":
        return float(context.get("records") or 0) > threshold
    if condition == "External party":
        return bool(context.get("external"))
    return False


def evaluate(
    passport: dict[str, Any],
    capability_id: str,
    context: dict[str, Any],
    rules: list[dict[str, Any]],
    default_autonomy: int,
) -> dict[str, Any]:
    level = passport.get("autonomy")
    if level is None:
        level = default_autonomy
    level = int(level)
    level_name = AUTONOMY_NAMES.get(level, f"L{level}")
    matched = [
        rule
        for rule in rules
        if rule.get("enabled")
        and rule.get("capabilityId") == capability_id
        and _rule_matches(rule, context)
    ]

    if passport.get("status") == "Paused":
        return {
            "outcome": "Blocked",
            "reasons": [f"{passport.get('agent')} is paused."],
            "matchedRules": matched,
        }
    caps = passport.get("capabilityIds") or []
    if capability_id not in caps:
        return {
            "outcome": "Blocked",
            "reasons": [f'"{capability_id}" is not in {passport.get("agent")}\'s passport.'],
            "matchedRules": matched,
        }

    strictest = None
    if matched:
        strictest = sorted(matched, key=lambda r: PATH_RANK.get(str(r.get("path")), 0), reverse=True)[0]
    rule_reasons = [
        f"Rule: {condition_label(rule)} → {rule.get('path')} ({rule.get('risk')} risk)."
        for rule in matched
    ]

    if strictest and strictest.get("path") == "Block":
        return {"outcome": "Blocked", "reasons": rule_reasons, "matchedRules": matched}
    if level <= 1:
        return {
            "outcome": "Blocked",
            "reasons": [f"Autonomy L{level} ({level_name}) can only observe or recommend."],
            "matchedRules": matched,
        }
    if level == 2:
        return {
            "outcome": "Draft only",
            "reasons": [
                f"Autonomy L2 ({level_name}): the agent drafts, a person sends.",
                *rule_reasons,
            ],
            "matchedRules": matched,
        }

    needs_approval = (
        level == 3
        or (level == 4 and strictest and strictest.get("path") != "Auto-execute")
        or (
            level == 5
            and strictest
            and strictest.get("path") != "Auto-execute"
            and strictest.get("risk") in {"High", "Critical"}
        )
    )
    if needs_approval:
        approver = (
            strictest.get("path")
            if strictest and strictest.get("path") != "Auto-execute"
            else "Accountable owner"
        )
        return {
            "outcome": "Needs approval",
            "approver": approver,
            "reasons": [
                (
                    f"Autonomy L3 ({level_name}) requires approval for every action."
                    if level == 3
                    else f"Autonomy L{level} ({level_name})."
                ),
                *rule_reasons,
            ],
            "matchedRules": matched,
        }

    return {
        "outcome": "Auto-execute",
        "reasons": [
            f"Autonomy L{level} ({level_name}).",
            *(
                [f"{reason} Allowed at this level." for reason in rule_reasons]
                if rule_reasons
                else ["No firewall rule triggered."]
            ),
        ],
        "matchedRules": matched,
    }
