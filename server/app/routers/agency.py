from fastapi import APIRouter

from app.data import store
from app.models.schemas import AgencyProfile

router = APIRouter(prefix="/agency", tags=["agency"])


@router.get("", response_model=AgencyProfile)
def get_agency() -> AgencyProfile:
    return store.snapshot_agency()


@router.put("", response_model=AgencyProfile)
def update_agency(profile: AgencyProfile) -> AgencyProfile:
    return store.update_agency(profile)
