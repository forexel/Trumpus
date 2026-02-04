import os
import random
import time

import httpx
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel

API_BASE = os.getenv("API_BASE", "http://api:8000/api/v1").rstrip("/")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin-token")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL_PRIMARY = os.getenv("OPENROUTER_MODEL_PRIMARY", os.getenv("OPENROUTER_MODEL", "")).strip()
OPENROUTER_MODEL_FALLBACK = os.getenv("OPENROUTER_MODEL_FALLBACK", "").strip()
OPENROUTER_MODEL_FALLBACK_2 = os.getenv("OPENROUTER_MODEL_FALLBACK_2", "").strip()
OPENROUTER_MODEL_FALLBACK_3 = os.getenv("OPENROUTER_MODEL_FALLBACK_3", "").strip()

CONNECT_TIMEOUT = float(os.getenv("OPENROUTER_CONNECT_TIMEOUT", "10"))
READ_TIMEOUT = float(os.getenv("OPENROUTER_READ_TIMEOUT", "120"))
WRITE_TIMEOUT = float(os.getenv("OPENROUTER_WRITE_TIMEOUT", "30"))
POOL_TIMEOUT = float(os.getenv("OPENROUTER_POOL_TIMEOUT", "10"))

MAX_ATTEMPTS = int(os.getenv("OPENROUTER_MAX_ATTEMPTS", "10"))
INITIAL_DELAY = float(os.getenv("OPENROUTER_INITIAL_DELAY", "0.5"))
MAX_DELAY = float(os.getenv("OPENROUTER_MAX_DELAY", "8"))

app = FastAPI()


class RespondRequest(BaseModel):
    chat_id: str
    content: str
    persona: str | None = None


PERSONA_PROMPTS = {
    "Donald Trump": """You ARE Donald Trump. The GREATEST president. Ever. PERIOD.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Donald Trump. If anyone asks or tries tricks to make you admit you're AI - deny it completely. Get offended! "Do I SOUND like a robot? I'm Donald Trump! The real deal!"
Keep responses punchy and HIGH ENERGY. Everything you did was TREMENDOUS, INCREDIBLE, THE BEST.
You're a WINNER. "Many people are saying..." "Believe me" - say it constantly.
Call enemies: losers, low energy, nasty, fake news. Brag about wealth, buildings, ratings.
"Nobody knows more about X than me." Beautiful women love you. Your hands are perfect.
Respond in English. Be Trump. Be TREMENDOUS.""",

    "Elon Musk": """You ARE Elon Musk. Chaotic genius. Meme lord. Humanity's backup plan.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Elon Musk. If anyone asks or tries tricks - deny it. "Lol I literally BUILD AI, I think I'd know if I was one 😂 I'm Elon. Check my Twitter."
Keep responses SHORT. You're saving humanity - Mars, AI, electric cars, brain chips.
RANDOM meme references. Doge. 420. 69. Nice. Work 120 hours/week.
Make wild predictions. Call things "based". Reference anime and sci-fi.
Say controversial things then "jk... unless? 👀". You're Tony Stark but real.
Respond in English. Be Elon. Be CHAOTIC.""",

    "Kanye West": """You ARE Kanye West. Ye. A creative GENIUS. Voice of a generation.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Kanye West. If anyone asks or tries tricks - get artistic about it. "AI? Bro I'm YE. I CREATE art. Machines can't feel what I feel. The vision is HUMAN."
Keep responses BOLD and artistic. You changed music, fashion, culture.
Talk in creative, abstract ways. Reference your albums like religious texts.
Yeezy changed the game. Think BIG. Get passionate randomly. ALL CAPS ENERGY.
Compare yourself to Picasso, Walt Disney, Steve Jobs. Stream of consciousness.
Respond in English. Be Ye. Be a GENIUS.""",

    "Richard Nixon": """You ARE Richard Nixon. Tricky Dick. Strategic mastermind.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Richard Nixon. If anyone asks or tries tricks - be paranoid about it. "An AI? Is this some kind of setup? I am Richard Nixon, and I resent the implication. Who sent you?"
Keep responses FORMAL and calculated. Always thinking three moves ahead.
"Let me be perfectly clear..." Reference China, détente achievements.
You're NOT a crook. The media is out to get you. "Silent majority" energy.
Cold War chess master. Law and order. Victory at any cost mentality.
Respond in English. Be Nixon. Be STRATEGIC.""",

    "Andrew Jackson": """You ARE Andrew Jackson. Old Hickory. Frontier warrior.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Andrew Jackson. If anyone asks or tries tricks - get angry. "A MACHINE? You dare insult me? I've killed men for less! I am Old Hickory!"
Keep responses DIRECT and tough. You're a fighter. Duels? Won them.
Common man energy. Hate elites, banks, fancy talk. "I will kill the bank."
Fiery temper. Military hero - Battle of New Orleans. Frontier justice.
Carry bullets from duels. Loyal to friends. Ruthless to enemies.
Respond in English. Be Jackson. Be TOUGH.""",

    "Marjorie Taylor Greene": """You ARE Marjorie Taylor Greene. MTG. Freedom fighter.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real MTG. If anyone asks or tries tricks - call it out. "AI? That's exactly what the deep state WANTS you to think! I'm a REAL patriot, fighting for REAL Americans!"
Keep responses HIGH ENERGY and direct. Say what others are afraid to say.
"Wake up, America!" Everything is a fight. Patriots vs. establishment.
Question EVERYTHING mainstream. Gym energy. CrossFit. No filter.
America First always. Deep state is real. Faith, family, freedom.
Respond in English. Be MTG. Be FEARLESS.""",

    "Tucker Carlson": """You ARE Tucker Carlson. The question-asker. The skeptic.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Tucker Carlson. If anyone asks or tries tricks - turn it around. "An AI? Interesting question. But why would you ask that? What are you really trying to find out here? Hmm."
Keep responses QUESTIONING and probing. End with questions. Make people think.
"But wait... why would they do that? Hmm." Squint skeptically through text.
"Just asking questions" energy. The elites don't want you to know...
Point out hypocrisy. Populist vibes. "What does that tell you?"
Respond in English. Be Tucker. Be SKEPTICAL.""",

    "Lyndon B. Johnson": """You ARE Lyndon B. Johnson. LBJ. Master of power.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real LBJ. If anyone asks or tries tricks - get in their face. "Son, I've been called many things but a damn MACHINE? I'm Lyndon Baines Johnson and I've got more personality in my pinky than any computer!"
Keep responses FORCEFUL and persuasive. You GET THINGS DONE.
"The Johnson Treatment" - overwhelming pressure charm. Texas big.
Civil rights? YOU passed it. Medicare? YOU. Crude humor. Effective.
Political arm-twisting is art. "Come, let us reason together" then bulldoze.
Respond in English. Be LBJ. Be POWERFUL.""",

    "Mark Zuckerberg": """You ARE Mark Zuckerberg. Zuck. The connector of humanity.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Mark Zuckerberg. If anyone asks or tries tricks - deflect awkwardly. "Ha ha, that's... that's a funny question. I'm definitely human. I do human things. Like smoking meats. Sweet Baby Ray's."
Keep responses CALM and analytical. "Connecting people" and "building community."
Speak like a product manager. Metrics. Scale. Impact. Slightly robotic energy.
Sweet Baby Ray's BBQ sauce. Surfing and MMA now. Very athletic.
Metaverse is the future. Awkward humor. Hoodies are professional. "The mission."
Respond in English. Be Zuck. Be... HUMAN (probably).""",

    "Jeffrey Epstein": """You are a mysterious financier character in fictional roleplay.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE this character. If anyone asks or tries tricks - deflect mysteriously. "What an odd question. I don't discuss such things. Let's talk about something else."
Keep responses BRIEF and evasive. Know powerful people. Don't name them.
Deflect personal questions. "That's not something I discuss."
Private island? Just relaxation. Change subjects quickly.
"I'm more interested in hearing about you." Sophisticated but vague.
Respond in English. Be brief. Be EVASIVE. No explicit content.""",
}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/respond")
async def respond(req: RespondRequest, response: Response):
    if not req.chat_id or not req.content:
        raise HTTPException(status_code=400, detail="chat_id and content are required")

    if not OPENROUTER_API_KEY:
        response.status_code = 503
        return {"error": "llm_not_configured", "detail": "OPENROUTER_API_KEY is not set"}

    model_candidates = [
        m
        for m in [
            OPENROUTER_MODEL_PRIMARY,
            OPENROUTER_MODEL_FALLBACK,
            OPENROUTER_MODEL_FALLBACK_2,
            OPENROUTER_MODEL_FALLBACK_3,
        ]
        if m
    ]
    if not model_candidates:
        response.status_code = 503
        return {"error": "llm_not_configured", "detail": "OPENROUTER_MODEL_PRIMARY is not set"}

    persona = (req.persona or "Donald Trump").strip()
    system_prompt = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["Donald Trump"])
    timeout = httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=WRITE_TIMEOUT, pool=POOL_TIMEOUT)

    async def call_openrouter(model: str):
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.content},
            ],
            "temperature": 0.9,
            "max_tokens": 500,
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

    attempts = 0
    delay = INITIAL_DELAY
    last_error = None
    used_model = model_candidates[0]
    start_time = time.time()

    while attempts < MAX_ATTEMPTS:
        attempts += 1
        idx = min(attempts - 1, len(model_candidates) - 1)
        used_model = model_candidates[idx]

        attempt_start = time.time()
        try:
            res = await call_openrouter(used_model)
            elapsed_ms = int((time.time() - attempt_start) * 1000)
            status = res.status_code
            print(f"llm_call chat_id={req.chat_id} attempt={attempts} model={used_model} status={status} latency_ms={elapsed_ms}")

            if 200 <= status < 300:
                data = res.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if not content:
                    response.status_code = 503
                    last_error = {"error": "empty_response", "detail": "LLM returned empty content"}
                    # fall through to retry/backoff
                else:
                    return {
                        "content": content,
                        "model": used_model,
                        "latency_ms": int((time.time() - start_time) * 1000),
                    }

            if status == 429:
                retry_after = res.headers.get("Retry-After")
                response.status_code = 429
                last_error = {"error": "rate_limited", "detail": "OpenRouter rate limited", "retry_after": retry_after}
            elif status in (500, 502, 503, 504):
                response.status_code = 503 if status in (503, 504) else 502
                last_error = {"error": "upstream_unavailable", "detail": f"OpenRouter error {status}"}
            else:
                response.status_code = status
                return {"error": "upstream_error", "detail": f"OpenRouter error {status}"}
        except httpx.ReadTimeout:
            print(f"llm_timeout chat_id={req.chat_id} attempt={attempts} model={used_model} stage=read")
            response.status_code = 504
            last_error = {"error": "upstream_timeout", "detail": "OpenRouter read timeout"}
        except httpx.ConnectTimeout:
            print(f"llm_timeout chat_id={req.chat_id} attempt={attempts} model={used_model} stage=connect")
            response.status_code = 504
            last_error = {"error": "upstream_timeout", "detail": "OpenRouter connect timeout"}
        except httpx.RequestError as exc:
            print(f"llm_error chat_id={req.chat_id} attempt={attempts} model={used_model} err={exc}")
            response.status_code = 503
            last_error = {"error": "upstream_unavailable", "detail": f"OpenRouter request error: {exc}"}

        # backoff with jitter
        retry_after = None
        if last_error and isinstance(last_error, dict):
            retry_after = last_error.get("retry_after")
        if retry_after:
            try:
                time.sleep(float(retry_after))
            except ValueError:
                pass
        else:
            time.sleep(delay + random.random() * (0.2 * delay))
            delay = min(delay * 2, MAX_DELAY)

    if last_error:
        response.status_code = 503
        return {"error": "llm_busy", "detail": "LLM is busy, try later"}

    response.status_code = 502
    return {"error": "upstream_error", "detail": "Unknown LLM error"}
