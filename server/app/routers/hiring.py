from fastapi import APIRouter, Query

from app.data import store
from app.models.schemas import Candidate, JobRequisition

router = APIRouter(prefix="/hiring", tags=["hiring"])


@router.get("/requisitions", response_model=list[JobRequisition])
def list_requisitions() -> list[JobRequisition]:
    return store.list_requisitions()


@router.get("/candidates", response_model=list[Candidate])
def list_candidates(requisition_id: str | None = Query(default=None)) -> list[Candidate]:
    return store.list_candidates(requisition_id)
