from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.quant_routes import router as quant_router
from app.api.infra_routes import get_user_from_auth, router as infra_router
from app.database import init_database, log_operation
from app.local_storage import STORAGE_ROOT, init_local_storage

app = FastAPI(
    title="Quant Asset Evaluator",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.ccioi.com",
        "https://ccioi.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://115.191.1.112:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quant_router)
app.include_router(infra_router)
app.mount(
    "/storage/uploads",
    StaticFiles(directory=str(STORAGE_ROOT / "uploads"), check_dir=False),
    name="storage-uploads",
)


@app.middleware("http")
async def audit_authenticated_operations(request: Request, call_next):
    response = await call_next(request)
    authorization = request.headers.get("authorization", "")
    ignored_paths = {"/me", "/gpus", "/admin/operations"}
    if (
        authorization.startswith("Bearer ")
        and not request.url.path.startswith("/storage/")
        and request.url.path not in ignored_paths
    ):
        try:
            auth = get_user_from_auth(authorization)
            log_operation(auth["sub"], request.method, request.url.path, response.status_code)
        except Exception as exc:
            print("operation audit skipped:", exc)
    return response
app.mount(
    "/storage/videos",
    StaticFiles(directory=str(STORAGE_ROOT / "videos"), check_dir=False),
    name="storage-videos",
)


@app.on_event("startup")
def startup():
    init_database()
    init_local_storage()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/version")
def version():
    return {"engine": "quant_fsm_v1.0"}
