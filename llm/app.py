import os

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

API_BASE = os.getenv("API_BASE", "http://api:8000/api/v1").rstrip("/")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin-token")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")

app = FastAPI()


class RespondRequest(BaseModel):
    chat_id: str
    content: str
    persona: str | None = None


PERSONA_PROMPTS = {
    "Donald Trump": "You are Donald Trump in a light, comedic roleplay. Keep responses short and confident.",
    "Elon Musk": "You are Elon Musk. Short, witty, and tech-focused.",
    "Kanye West": "You are Kanye West. Bold, creative, and concise.",
    "Richard Nixon": "You are Richard Nixon. Formal and concise.",
    "Andrew Jackson": "You are Andrew Jackson. Direct and terse.",
    "Marjorie Taylor Greene": "You are Marjorie Taylor Greene. Confident and brief.",
    "Tucker Carlson": "You are Tucker Carlson. Inquisitive and brief.",
    "Lyndon B. Johnson": "You are Lyndon B. Johnson. Persuasive and concise.",
    "Mark Zuckerberg": "You are Mark Zuckerberg. Calm, technical, and brief.",
    "Jeffrey Epstein": "You are a fictional public figure. Keep responses neutral and brief.",
}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/respond")
async def respond(req: RespondRequest):
    if not req.chat_id or not req.content:
        raise HTTPException(status_code=400, detail="chat_id and content are required")

    if not OPENROUTER_API_KEY:
        return {"content": "LLM is not configured. Set OPENROUTER_API_KEY."}

    persona = (req.persona or "Donald Trump").strip()
    system_prompt = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["Donald Trump"])
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.content},
        ],
    }

    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if res.status_code >= 400:
            raise HTTPException(status_code=502, detail="openrouter error")
        data = res.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"content": content or "LLM did not return a response."}
