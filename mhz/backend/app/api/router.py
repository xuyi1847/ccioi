from fastapi import APIRouter
from app.api.routes import analytics, apple, channels, events, recommendations, tracks, users

router = APIRouter(prefix="/api/v1")
router.include_router(users.router)
router.include_router(channels.router)
router.include_router(events.router)
router.include_router(recommendations.router)
router.include_router(apple.router)
router.include_router(analytics.router)
router.include_router(tracks.router)
