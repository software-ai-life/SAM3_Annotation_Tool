"""
SAM3 Annotation Tool - Backend API
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import annotation, export

app = FastAPI(
    title="SAM3 Annotation Tool API",
    description="Backend API for SAM3-powered image annotation",
    version="1.0.0"
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(annotation.router, prefix="/api", tags=["annotation"])
app.include_router(export.router, prefix="/api", tags=["export"])


@app.get("/")
async def root():
    return {"message": "SAM3 Annotation Tool API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
