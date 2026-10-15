from fastapi import APIRouter

from app.data import store
from app.models.schemas import (
    BrainAskRequest,
    BrainAskResponse,
    WorkDraftRequest,
    WorkDraftResponse,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/brain/ask", response_model=BrainAskResponse)
def brain_ask(payload: BrainAskRequest) -> BrainAskResponse:
    docs = store.search_documents(payload.question, top_k=payload.top_k)
    if not docs:
        return BrainAskResponse(
            answer="No matching documents in Company Brain yet.",
            sources=[],
            confidence=0.0,
        )

    snippets = [f"- {doc['title']}: {doc['body'][:180]}" for doc in docs]
    answer = (
        f"Based on {len(docs)} document(s) related to “{payload.question}”:\n\n"
        + "\n".join(snippets)
    )
    confidence = min(0.95, 0.45 + 0.15 * len(docs))
    return BrainAskResponse(
        answer=answer,
        sources=[doc["title"] for doc in docs],
        confidence=confidence,
    )


@router.post("/work/draft", response_model=WorkDraftResponse)
def work_draft(payload: WorkDraftRequest) -> WorkDraftResponse:
    prompt = payload.prompt.strip()
    if payload.kind == "standup":
        issues = store.list_issues(payload.project_id)
        active = [i for i in issues if i.status in {"In progress", "Blocked", "In review"}]
        lines = [
            f"• {issue.title} — {issue.status} ({issue.assignee})"
            for issue in active[:8]
        ] or ["• No active issues in scope."]
        return WorkDraftResponse(
            kind="standup",
            title="Daily standup draft",
            body="Standup notes\n\n" + "\n".join(lines),
            suggestions=["Add blockers", "Call out demos due this week"],
        )

    if payload.kind == "triage":
        return WorkDraftResponse(
            kind="triage",
            title="Triage suggestion",
            body=(
                f"Suggested triage for: {prompt or 'incoming item'}\n"
                "- Priority: Medium\n"
                "- Type: Task\n"
                "- Next: clarify acceptance criteria, then assign owner"
            ),
            suggestions=["Raise priority if customer-facing", "Link related epic"],
        )

    title = prompt.split(".")[0][:80] if prompt else "Untitled issue"
    return WorkDraftResponse(
        kind="issue",
        title=title,
        body=(
            f"## Summary\n{prompt or 'Describe the work.'}\n\n"
            "## Acceptance criteria\n- [ ] Defined\n- [ ] Verified\n\n"
            "## Notes\nDrafted by Work AI copilot."
        ),
        suggestions=["Add estimate", "Attach labels", "Assign owner"],
    )
