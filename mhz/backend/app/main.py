from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.router import router
from app.core.config import get_settings
from app.db.session import SessionFactory
from app.services.bootstrap import seed_data


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with SessionFactory() as session:
        await seed_data(session, include_mock_tracks=settings.music_provider == "mock")
    yield


app = FastAPI(title="MHz API", version="0.1.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "provider": settings.music_provider}


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"data": None, "error": {"code": "internal_error", "message": str(exc)}})
