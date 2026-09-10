from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.mac_music import MacMusicError, MacMusicService

router = APIRouter(prefix="/mac-music", tags=["mac-music"])


class PlayIn(BaseModel):
    persistent_id: str = Field(alias="persistentId")
    model_config = {"populate_by_name": True}


@router.get("/tracks")
async def tracks(limit: int = Query(100, ge=1, le=500)) -> list[dict]:
    try:
        return [asdict(item) for item in await MacMusicService().list_tracks(limit)]
    except MacMusicError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/play")
async def play(payload: PlayIn) -> dict:
    try:
        return {"status": "playing", "track": asdict(await MacMusicService().play(payload.persistent_id))}
    except MacMusicError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/pause")
async def pause() -> dict:
    await MacMusicService().pause();return {"status": "paused"}


@router.post("/resume")
async def resume() -> dict:
    await MacMusicService().resume();return {"status": "playing"}


@router.get("/state")
async def state() -> dict:
    value = await MacMusicService().state()
    return {"state": value["state"], "position": value["position"], "track": asdict(value["track"]) if value["track"] else None}
