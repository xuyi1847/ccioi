from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.quant_routes import router as quant_router
from app.api.infra_routes import router as infra_router

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

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/version")
def version():
    return {"engine": "quant_fsm_v1.0"}
