from fastapi import APIRouter, HTTPException, Query

from app.data import store
from app.data.store import now_iso, today
from app.models.schemas import Issue, IssueCreate, Project, ProjectCreate

router = APIRouter(tags=["projects"])


@router.get("/projects", response_model=list[Project])
def list_projects() -> list[Project]:
    return store.list_projects()


@router.get("/projects/{project_id}", response_model=Project)
def get_project(project_id: str) -> Project:
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/projects", response_model=Project, status_code=201)
def create_project(payload: ProjectCreate) -> Project:
    project = Project(
        id=store.new_id("prj"),
        created_at=today(),
        members=[],
        **payload.model_dump(),
    )
    return store.add_project(project)


@router.get("/issues", response_model=list[Issue])
def list_issues(project_id: str | None = Query(default=None)) -> list[Issue]:
    return store.list_issues(project_id)


@router.post("/issues", response_model=Issue, status_code=201)
def create_issue(payload: IssueCreate) -> Issue:
    if not store.get_project(payload.project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    now = now_iso()
    issue = Issue(
        id=store.new_id("iss"),
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    return store.add_issue(issue)
