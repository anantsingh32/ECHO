import os
import sqlite3
from pathlib import Path
from typing import Optional
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
DB_PATH = BASE_DIR / "hear_me.db"

app = FastAPI(title="HEAR ME API", version="0.1.0",
              description="Two-way accessibility communication MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

CARDS = [
    {"id":"deaf","category":"Everyday","text":"I am deaf. Please type or write what you would like to say."},
    {"id":"repeat","category":"Everyday","text":"Please repeat that slowly."},
    {"id":"help","category":"Emergency","text":"I need help. Please assist me."},
    {"id":"wait","category":"Everyday","text":"Please give me a moment to read and respond."},
    {"id":"hospital","category":"Hospital","text":"I have an appointment. Could you please communicate with me in writing?"},
    {"id":"pain","category":"Hospital","text":"I am experiencing pain. Please help me contact a doctor."},
    {"id":"bank","category":"Bank","text":"I need help with a banking service. Please communicate with me in writing."},
    {"id":"shopping","category":"Shopping","text":"Could you please show me the price and details in writing?"},
]

CONTEXT_CARDS = {
    "hospital": ["hospital", "pain", "deaf", "repeat", "help"],
    "bank": ["bank", "deaf", "repeat", "wait", "help"],
    "shopping": ["shopping", "deaf", "repeat", "wait"],
    "general": ["deaf", "repeat", "help", "wait"],
}

def init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")

@app.on_event("startup")
def startup():
    init_db()

class LogRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=1, max_length=2000)

class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
    voice_id: Optional[str] = None

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "HEAR ME"}

@app.get("/api/cards")
def get_cards():
    return {"cards": CARDS}

@app.get("/api/context/{context_name}")
def get_context(context_name: str):
    key = context_name.lower()
    if key not in CONTEXT_CARDS:
        raise HTTPException(status_code=404, detail="Unknown context")
    ids = set(CONTEXT_CARDS[key])
    return {"context": key, "cards": [c for c in CARDS if c["id"] in ids]}

@app.post("/api/log")
def log_interaction(payload: LogRequest):
    with sqlite3.connect(DB_PATH) as con:
        cur = con.execute("INSERT INTO interactions(kind, content) VALUES (?, ?)",
                          (payload.kind, payload.content))
        return {"saved": True, "id": cur.lastrowid}

@app.post("/api/tts")
async def elevenlabs_tts(payload: TTSRequest):
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = payload.voice_id or os.getenv("ELEVENLABS_VOICE_ID")
    if not api_key or not voice_id:
        raise HTTPException(status_code=503, detail="ElevenLabs is not configured")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {"xi-api-key": api_key, "Content-Type": "application/json",
               "Accept": "audio/mpeg"}
    body = {"text": payload.text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(url, headers=headers, json=body)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="ElevenLabs request failed")
    from fastapi.responses import Response
    return Response(content=response.content, media_type="audio/mpeg")
