from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="amoCRM 1C Gate")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # В продакшене укажите конкретные поддомены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DocumentRequest(BaseModel):
    deal_id: int
    subdomain: str

@app.post("/api/v1/documents/create")
async def create_document(payload: DocumentRequest):
    try:
        return {"status": "success", "message": "Document queued/created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
