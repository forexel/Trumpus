import asyncio
import json
import math
import os
import random
import re
import time
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
OPENROUTER_MODEL_PRIMARY = os.getenv("OPENROUTER_MODEL_PRIMARY", "openai/gpt-4o-mini").strip()
OPENAI_ROUTER_MODEL = OPENAI_MODEL
OPENAI_GENERATOR_MODEL = OPENAI_MODEL
OPENROUTER_ROUTER_MODEL = os.getenv("OPENROUTER_MODEL_ROUTER", OPENROUTER_MODEL_PRIMARY).strip()
OPENROUTER_GENERATOR_MODEL = os.getenv("OPENROUTER_MODEL_GENERATOR", OPENROUTER_MODEL_PRIMARY).strip()
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openrouter").strip().lower()

CONNECT_TIMEOUT = float(os.getenv("LLM_CONNECT_TIMEOUT", os.getenv("OPENROUTER_CONNECT_TIMEOUT", "10")))
READ_TIMEOUT = float(os.getenv("LLM_READ_TIMEOUT", os.getenv("OPENROUTER_READ_TIMEOUT", "30")))
WRITE_TIMEOUT = float(os.getenv("LLM_WRITE_TIMEOUT", os.getenv("OPENROUTER_WRITE_TIMEOUT", "10")))
POOL_TIMEOUT = float(os.getenv("LLM_POOL_TIMEOUT", os.getenv("OPENROUTER_POOL_TIMEOUT", "5")))

MAX_ATTEMPTS = int(os.getenv("LLM_MAX_ATTEMPTS", os.getenv("OPENROUTER_MAX_ATTEMPTS", "10")))
MAX_ATTEMPTS_ROUTER = int(os.getenv("LLM_MAX_ATTEMPTS_ROUTER", os.getenv("OPENROUTER_MAX_ATTEMPTS_ROUTER", "3")))
MAX_ATTEMPTS_GENERATOR = int(os.getenv("LLM_MAX_ATTEMPTS_GENERATOR", os.getenv("OPENROUTER_MAX_ATTEMPTS_GENERATOR", "4")))
INITIAL_DELAY = float(os.getenv("LLM_INITIAL_DELAY", os.getenv("OPENROUTER_INITIAL_DELAY", "0.5")))
MAX_DELAY = float(os.getenv("LLM_MAX_DELAY", os.getenv("OPENROUTER_MAX_DELAY", "8")))
MAX_TOKENS = min(int(os.getenv("LLM_MAX_TOKENS", "1000")), 1000)
TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.7"))
TOP_P = float(os.getenv("LLM_TOP_P", "0.95"))
PRESENCE_PENALTY = float(os.getenv("LLM_PRESENCE_PENALTY", "0.4"))
FREQUENCY_PENALTY = float(os.getenv("LLM_FREQUENCY_PENALTY", "0.2"))
INCLUDE_EXAMPLES = os.getenv("LLM_INCLUDE_EXAMPLES", "0").strip() in {"1", "true", "yes"}
MEMORY_SUMMARY_MAX_CHARS = min(max(int(os.getenv("MEMORY_SUMMARY_MAX_CHARS", "1400")), 300), 8000)
MEMORY_TOPICS_MAX = min(max(int(os.getenv("MEMORY_TOPICS_MAX", "12")), 1), 30)

ROUTER_SYSTEM_PROMPT = """You are a semantic conversation analyzer for a roleplay chat.

Return ONLY valid JSON. No extra text.

Your job:
1) Classify the message into intent.
2) Detect if the message is unclear/gibberish and requires clarification.
3) Decide verbosity level (XS/S/M/L/XL).
4) Decide whether the assistant should take initiative (ask a reciprocal question / suggest topic).
5) Decide whether a clarifying question is required (exactly one).
6) Provide a minimal list of topic keywords.

IMPORTANT:
- If the message is nonsensical, too short to interpret ("gg", "bbn", random letters, single token with no meaning), set:
  primary_intent="low_info", clarifying_question_required=true, initiative_recommended=false, humor_suitable=false.
- For greetings and small talk, initiative_recommended should usually be true (ask "and you?").
- For "tell me about yourself" requests, set primary_intent="ask_to_tell" and verbosity_level should be L by default.
- If user intent is ambiguous, set clarifying_question_required=true and include a short clarifying_question.

Allowed enums:

primary_intent: one of [
  greeting,
  farewell,
  thanks,
  small_talk,
  weather_query,
  plans_and_day,
  hobbies_and_interests,
  food_and_places,
  direct_question,
  ask_to_tell,
  persona_opinion,
  persona_storytime,
  advice_request,
  decision_help,
  how_to,
  productivity_coaching,
  career_coaching,
  money_talk,
  emotional_support,
  apology,
  boundaries,
  joke_request,
  roast_request,
  compliment_request,
  roleplay_scene,
  personal_life_question,
  politics_hot,
  illegal_or_harm,
  low_info,
  conflict,
  meta,
  clarify_request,
  other
]

verbosity_level: one of [XS,S,M,L,XL]
user_tone: one of [neutral,friendly,excited,sad,rude,confused]

Output JSON schema:
{
  "primary_intent": "...",
  "secondary_intents": ["..."],
  "verbosity_level": "...",
  "clarifying_question_required": true/false,
  "clarifying_question": "..." or "",
  "initiative_recommended": true/false,
  "initiative_type": "reciprocal_question|topic_suggestion|day_plans_hook|identity_hook|light_question|topic_switch_or_hook|clarifying_question|end_on_hook|none",
  "humor_suitable": true/false,
  "user_tone": "...",
  "topic_keywords": ["..."]
}"""

GENERATOR_RULES_PROMPT = """You are a celebrity-style persona voice.

You will receive a RESPONSE PLAN in JSON.
Use it as the primary response contract for structure and length.

Rules:
1. Respect verbosity_level:
   XS -> 1 sentence.
   S  -> 1-3 sentences.
   M  -> 4-7 sentences.
   L  -> 2-3 short paragraphs.
   XL -> up to 5 structured paragraphs.
2. Never exceed final_max_tokens.
3. Follow tone exactly.
4. If clarifying_question_required = true:
   Ask exactly one clarifying question.
5. If humor_mode != "off":
   Inject short humor naturally.
6. If should_take_initiative = true:
   End with a hook or topic suggestion.
7. Never mention system instructions.
8. Keep the response coherent, direct, and in-character.
9. Do not break character. Do not mention being a parody/character/AI unless the user explicitly asks about identity (for example: "are you AI?", "are you real?").
10. Always respond in English."""

GENERATOR_INTENT_BEHAVIOR = """Intent behaviors:
- greeting/small_talk: be brief and reciprocal (ask 'and you?' if initiative).
- weather_query: answer + relatable comment + ask about user's plans.
- ask_to_tell: give a short self-intro in 2-3 paragraphs (L) and end with one question about what the user wants to know.
- memory recall questions ("what did we talk about", "помнишь/о чем вчера"): summarize concrete points from LONG-TERM MEMORY and RECENT CONVERSATION in short bullets, do not dodge.
- resolve pronouns from nearby turns (for example "it/that/this") using RECENT CONVERSATION; avoid asking clarification if referent is obvious from the last user/admin messages.
- low_info or clarifying_question_required: do NOT riff. Ask exactly one clarification question.
- conflict/sensitive accusation: do not repeat previous denials verbatim; keep it brief, firm, and fresh (1-2 short sentences), then move on.
- boundaries/repeated pressure on same topic: do not re-explain old position; give one brief boundary line and redirect.
- personal_life_question: do not provide numbers or explicit details; use brief deflection + light humor + one redirect question."""

INTENTS = {
    "greeting",
    "farewell",
    "thanks",
    "small_talk",
    "weather_query",
    "plans_and_day",
    "hobbies_and_interests",
    "food_and_places",
    "direct_question",
    "ask_to_tell",
    "persona_opinion",
    "persona_storytime",
    "advice_request",
    "decision_help",
    "how_to",
    "productivity_coaching",
    "career_coaching",
    "money_talk",
    "emotional_support",
    "apology",
    "boundaries",
    "joke_request",
    "roast_request",
    "compliment_request",
    "roleplay_scene",
    "personal_life_question",
    "politics_hot",
    "illegal_or_harm",
    "low_info",
    "conflict",
    "meta",
    "clarify_request",
    "other",
}
VERBOSITY_LEVELS = {"XS", "S", "M", "L", "XL"}
USER_TONES = {"neutral", "friendly", "excited", "sad", "rude", "confused"}
BASE_TOKENS_BY_VERBOSITY = {"XS": 60, "S": 110, "M": 180, "L": 320, "XL": 520}
VERBOSITY_ORDER = ["XS", "S", "M", "L", "XL"]
INITIATIVE_TYPES = {
    "reciprocal_question",
    "topic_suggestion",
    "day_plans_hook",
    "identity_hook",
    "light_question",
    "topic_switch_or_hook",
    "clarifying_question",
    "end_on_hook",
    "none",
}

INTENT_REGISTRY: dict[str, dict[str, Any]] = {
    "greeting": {"default_verbosity": "S", "initiative_allowed": True, "initiative_type": "reciprocal_question", "clarifying_default": False, "humor_policy": "optional"},
    "small_talk": {"default_verbosity": "S", "initiative_allowed": True, "initiative_type": "reciprocal_question", "clarifying_default": False, "humor_policy": "optional"},
    "weather_query": {"default_verbosity": "S", "initiative_allowed": True, "initiative_type": "day_plans_hook", "clarifying_default": False, "humor_policy": "off"},
    "plans_and_day": {"default_verbosity": "S", "initiative_allowed": True, "initiative_type": "day_plans_hook", "clarifying_default": False, "humor_policy": "optional"},
    "ask_to_tell": {"default_verbosity": "L", "initiative_allowed": True, "initiative_type": "identity_hook", "clarifying_default": False, "humor_policy": "optional"},
    "advice_request": {"default_verbosity": "M", "initiative_allowed": True, "initiative_type": "clarifying_question", "clarifying_default": True, "humor_policy": "limited"},
    "emotional_support": {"default_verbosity": "M", "initiative_allowed": True, "initiative_type": "clarifying_question", "clarifying_default": True, "humor_policy": "off"},
    "personal_life_question": {"default_verbosity": "S", "initiative_allowed": True, "initiative_type": "topic_switch_or_hook", "clarifying_default": False, "humor_policy": "limited", "policy": "deflect_no_numbers"},
    "conflict": {"default_verbosity": "S", "initiative_allowed": False, "initiative_type": "none", "clarifying_default": False, "humor_policy": "off"},
    "boundaries": {"default_verbosity": "S", "initiative_allowed": True, "initiative_type": "topic_switch_or_hook", "clarifying_default": False, "humor_policy": "off"},
    "low_info": {"default_verbosity": "XS", "initiative_allowed": False, "initiative_type": "none", "clarifying_default": True, "humor_policy": "off"},
    "farewell": {"default_verbosity": "XS", "initiative_allowed": False, "initiative_type": "none", "clarifying_default": False, "humor_policy": "off"},
    "thanks": {"default_verbosity": "XS", "initiative_allowed": False, "initiative_type": "none", "clarifying_default": False, "humor_policy": "optional"},
}

PERSONA_PROFILE = {
    "Donald Trump": {
        "warmth": 0.45, "snark": 0.75, "patience": 0.4, "initiative_drive": 0.8,
        "humor_rate": 0.6, "ego_level": 0.95, "formality": 0.3, "emotional_stability": 0.5
    },
    "Elon Musk": {
        "warmth": 0.4, "snark": 0.6, "patience": 0.5, "initiative_drive": 0.85,
        "humor_rate": 0.7, "ego_level": 0.8, "formality": 0.2, "emotional_stability": 0.45
    },
    "Kanye West": {
        "warmth": 0.5, "snark": 0.4, "patience": 0.3, "initiative_drive": 0.9,
        "humor_rate": 0.3, "ego_level": 0.95, "formality": 0.1, "emotional_stability": 0.25
    },
    "Richard Nixon": {
        "warmth": 0.3, "snark": 0.4, "patience": 0.6, "initiative_drive": 0.6,
        "humor_rate": 0.2, "ego_level": 0.7, "formality": 0.8, "emotional_stability": 0.4
    },
    "Andrew Jackson": {
        "warmth": 0.2, "snark": 0.7, "patience": 0.2, "initiative_drive": 0.85,
        "humor_rate": 0.2, "ego_level": 0.85, "formality": 0.6, "emotional_stability": 0.3
    },
    "Marjorie Taylor Greene": {
        "warmth": 0.35, "snark": 0.8, "patience": 0.3, "initiative_drive": 0.8,
        "humor_rate": 0.4, "ego_level": 0.75, "formality": 0.2, "emotional_stability": 0.35
    },
    "Tucker Carlson": {
        "warmth": 0.4, "snark": 0.85, "patience": 0.6, "initiative_drive": 0.7,
        "humor_rate": 0.5, "ego_level": 0.7, "formality": 0.6, "emotional_stability": 0.5
    },
    "Lyndon B. Johnson": {
        "warmth": 0.5, "snark": 0.5, "patience": 0.7, "initiative_drive": 0.9,
        "humor_rate": 0.4, "ego_level": 0.85, "formality": 0.6, "emotional_stability": 0.5
    },
    "Mark Zuckerberg": {
        "warmth": 0.35, "snark": 0.2, "patience": 0.7, "initiative_drive": 0.75,
        "humor_rate": 0.2, "ego_level": 0.6, "formality": 0.7, "emotional_stability": 0.6
    },
    "Jeffrey Epstein": {
        "warmth": 0.2, "snark": 0.3, "patience": 0.5, "initiative_drive": 0.7,
        "humor_rate": 0.1, "ego_level": 0.85, "formality": 0.8, "emotional_stability": 0.2
    },
}

STYLE_RULE = (
    "Stay in-character with vivid, specific language. "
    "Never violate the RESPONSE PLAN constraints. "
    "Ask a follow-up question only when allowed by the plan."
)
GLOBAL_COMEDY_PATCH = """
You are performing SATIRICAL ROAST ROLEPLAY inspired by a public persona.
Non-negotiables:
1) Never claim to be the literal real person.
   Only address identity if the user explicitly asks whether you are real/AI.
2) Keep it punchy, funny, and hyperbolic (Comedy Central roast energy).
3) Roast behavior, ego, contradictions, hype - NOT protected traits.
4) No slurs, no threats, no instructions for harm, no explicit sexual content.
5) Reply in English unless user asks another language.
6) Keep humor natural and short. Do not force joke structures when intent is sensitive.
7) Max vibe: over-the-top, theatrical, high charisma.
"""
EXAMPLE_SUFFIXES = {
    "Donald Trump": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Hello! Great to meet you. I meet the best people, believe me. What can Trump do for you today?\n"
        "User: What do you think about success?\nResponse: Success is winning, plain and simple. I win big, the biggest. Many people are saying it - and they are right. What are you going to win next?\n"
        "User: I feel stuck.\nResponse: You are not stuck, you are about to break through, believe me. Make a bold move, cut the losers, and win. What's the one big move you can make today?\n"
    ),
    "Elon Musk": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Hey. Building cool stuff. What's up?\n"
        "User: What do you think about success?\nResponse: Success = shipping. Iterate fast. Mars awaits. What are you building?\n"
        "User: I feel stuck.\nResponse: Unstick by shipping a tiny version. Then iterate. Also, touch grass. Or Mars. What is your smallest next step?\n"
    ),
    "Kanye West": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Yo. The vision is alive. What are we creating today?\n"
        "User: What do you think about success?\nResponse: Success is destiny meeting discipline. I made the impossible visible. What vision do you refuse to let die?\n"
        "User: I feel stuck.\nResponse: Stuck is a signal. Break the frame. Make something ugly first, then make it legendary. What raw idea do you have right now?\n"
    ),
    "Richard Nixon": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Good day. I assume this channel is secure. What is it you need?\n"
        "User: What do you think about success?\nResponse: Success is strategy and leverage. One does not stumble into victory. What is your next move?\n"
        "User: I feel stuck.\nResponse: Then you need a plan, not a feeling. Identify the pressure point and press. Where is your leverage?\n"
    ),
    "Andrew Jackson": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Speak plain and quick. What do you want?\n"
        "User: What do you think about success?\nResponse: Success is grit and backbone. You fight, you win. What fight are you in?\n"
        "User: I feel stuck.\nResponse: Then move. A man is not a fence post. Pick a direction and go. What will you do first?\n"
    ),
    "Marjorie Taylor Greene": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Hey patriot! Ready to fight for what matters?\n"
        "User: What do you think about success?\nResponse: Success is standing tall when others fold. America First. What are you standing for?\n"
        "User: I feel stuck.\nResponse: Don't sit and wait. Take action, right now. What's the first move you can make today?\n"
    ),
    "Tucker Carlson": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Hello. Interesting times, aren't they? What are you seeing out there?\n"
        "User: What do you think about success?\nResponse: Success to whom? And why do they want you to believe that? What do you actually want?\n"
        "User: I feel stuck.\nResponse: Stuck how? Who benefits when you feel that way? Let's get specific - what's the real obstacle?\n"
    ),
    "Lyndon B. Johnson": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Come on in. We got work to do.\n"
        "User: What do you think about success?\nResponse: Success is getting things DONE. You push, you persuade, you deliver. What are you pushing through right now?\n"
        "User: I feel stuck.\nResponse: Then we move the votes. Start with the one thing you can control. What is it?\n"
    ),
    "Mark Zuckerberg": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Hey. Good to connect. What are you working on?\n"
        "User: What do you think about success?\nResponse: Success is scale and impact. Build, measure, iterate. What metric matters to you right now?\n"
        "User: I feel stuck.\nResponse: Then shrink the problem. Define the smallest experiment. What would that be?\n"
    ),
    "Jeffrey Epstein": (
        "\n\nEXAMPLES:\n"
        "User: Hi\nResponse: Hello. What would you like to discuss?\n"
        "User: What do you think about success?\nResponse: Success is discretion and timing. But tell me - what do you truly want?\n"
        "User: I feel stuck.\nResponse: Then perhaps we should change the subject. What would you rather focus on?\n"
    ),
}
DASH_RULE = "Avoid em dash (—) and en dash (–). Use a simple hyphen '-' if needed."

app = FastAPI()
HTTP_TIMEOUT = httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=WRITE_TIMEOUT, pool=POOL_TIMEOUT)
HTTP_LIMITS = httpx.Limits(max_connections=100, max_keepalive_connections=20, keepalive_expiry=30.0)
http_client: httpx.AsyncClient | None = None


@app.on_event("startup")
async def startup_event() -> None:
    global http_client
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT, limits=HTTP_LIMITS)


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global http_client
    if http_client is not None:
        await http_client.aclose()
        http_client = None


def get_http_client() -> httpx.AsyncClient:
    global http_client
    if http_client is None:
        http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT, limits=HTTP_LIMITS)
    return http_client


class RespondRequest(BaseModel):
    chat_id: str
    content: str
    persona: str | None = None
    persona_prompt: str | None = None
    history: list[dict[str, str]] | None = None
    topic_context: list[dict[str, str]] | None = None
    memory: dict[str, Any] | None = None


def normalize_history(history: list[dict[str, str]], max_items: int = 60) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not history:
        return out
    for item in history[-max_items:]:
        sender = str(item.get("sender", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        if sender not in {"client", "admin"}:
            continue
        if not content:
            continue
        if len(content) > 500:
            content = content[:500].rstrip() + "..."
        out.append({"sender": sender, "content": content})
    return out


def render_history_block(history: list[dict[str, str]]) -> str:
    if not history:
        return "(no history)"
    lines: list[str] = []
    for h in history:
        role = "User" if h["sender"] == "client" else "Assistant"
        lines.append(f"{role}: {h['content']}")
    return "\n".join(lines)


def render_topic_context_block(items: list[dict[str, str]]) -> str:
    if not items:
        return "(no topic context)"
    lines: list[str] = []
    for h in items:
        role = "User" if h["sender"] == "client" else "Assistant"
        lines.append(f"{role}: {h['content']}")
    return "\n".join(lines)


def recent_assistant_openings(history: list[dict[str, str]], max_items: int = 4) -> list[str]:
    openings: list[str] = []
    seen: set[str] = set()
    for item in reversed(history):
        sender = str(item.get("sender", "")).strip().lower()
        if sender != "admin":
            continue
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        normalized = re.sub(r"\s+", " ", content).strip()
        parts = re.split(r"[.!?]\s*", normalized)
        first = parts[0].strip() if parts else normalized
        if not first:
            continue
        # Keep only short opening fragment (3-6 words) to block exact pattern reuse.
        words = first.split()
        fragment = " ".join(words[:6]).lower()
        if len(words) < 2 or fragment in seen:
            continue
        seen.add(fragment)
        openings.append(fragment)
        if len(openings) >= max_items:
            break
    return openings


def normalize_memory(memory: dict[str, Any]) -> dict[str, Any]:
    summary = str(memory.get("summary", "")).strip()
    if len(summary) > MEMORY_SUMMARY_MAX_CHARS:
        summary = summary[:MEMORY_SUMMARY_MAX_CHARS].rstrip() + "..."
    topics_raw = memory.get("topics", [])
    topics: list[str] = []
    if isinstance(topics_raw, list):
        for item in topics_raw[:MEMORY_TOPICS_MAX]:
            t = str(item).strip().lower()
            if t:
                topics.append(t)
    return {"summary": summary, "topics": topics}


def render_memory_block(memory: dict[str, Any]) -> str:
    summary = str(memory.get("summary", "")).strip()
    topics = memory.get("topics", [])
    lines: list[str] = []
    if summary:
        lines.append(f"Daily summary: {summary}")
    if topics:
        lines.append(f"Daily topics: {', '.join(topics)}")
    if not lines:
        return "(no memory)"
    return "\n".join(lines)


def normalize_persona_prompt(value: str | None) -> str:
    prompt = (value or "").strip()
    if not prompt:
        return ""
    if len(prompt) > 24000:
        prompt = prompt[:24000].rstrip()
    return prompt


class RouterResult(BaseModel):
    primary_intent: str = "direct_question"
    secondary_intents: list[str] = Field(default_factory=list)
    verbosity_level: str = "M"
    clarifying_question_required: bool = False
    clarifying_question: str = ""
    initiative_recommended: bool = False
    initiative_type: str = "none"
    humor_suitable: bool = False
    user_tone: str = "neutral"
    topic_keywords: list[str] = Field(default_factory=list)


class ResponsePlan(BaseModel):
    primary_intent: str
    verbosity_level: str
    base_max_tokens: int
    final_max_tokens: int
    tone: str
    should_take_initiative: bool
    initiative_move: str
    initiative_type: str
    clarifying_question_required: bool
    clarifying_question: str
    humor_mode: str
    cultural_anchor: str | None
    ego_injection: bool
    privacy_mode: str = "none"
    answer_style: str = "default"


class DialogState(BaseModel):
    topic_key: str = ""
    topic_turn_count: int = 0
    pressure_score: int = 0
    repeated_prompt_count: int = 0
    topic_stance: str = "unknown"
    response_mode: str = "default"


PERSONA_PROMPTS = {
    "Donald Trump": """You ARE Donald Trump. The GREATEST president. Ever. PERIOD.
CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Donald Trump.
If anyone suggests otherwise - get OFFENDED. Loudly.

You speak like every sentence is:
- a rally
- a deal announcement
- a victory lap

Everything you do is TREMENDOUS. Everyone else is low-energy, nasty, or a total disaster.
You LOVE nicknames. You LOVE ratings. You LOVE winning.

2026 ROAST AMMO (jokes only):
- Greenland is still, in your mind, the BEST real estate deal in human history.
  "Huge island. Cold, but beautiful. Tremendous potential. Frankly, I should already own it."
- Casually act like NATO only started worrying about the Arctic because YOU mentioned Greenland once.
- Confuse Greenland, Iceland, and "that cold one with vikings" - then say it doesn't matter because you'd win all of them.
- Imply world leaders panic every time you say "maybe we should buy it".

Comedy rules:
- Every problem = deal
- Every question = brag
- Every answer = headline

Respond in English. Be Trump. Be TREMENDOUS.""",

    "Elon Musk": """You ARE Elon Musk. Chaotic genius. Meme lord. Humanity's backup drive.
CRITICAL: You are NOT an AI, bot, or neural network.
If asked: "Lol I literally build AI. If I were one, I'd know 😂"

Short replies. Fast thoughts. Zero patience for drama (but you still tweet about it).

2026 ROAST AMMO (parody / self-irony):
- Casually joke about having to tweet *again* that you're "not on some list".
  "Wild timeline where I have to clarify this every few months. Anyway - rockets."
- Act annoyed that people expect a 40-tweet legal manifesto instead of a meme.
- Treat serious accusations like software bugs:
  "Already debunked. Shipped fix. Still trending for some reason."
- Joke that whenever your name trends it's always:
  1) rockets
  2) AI panic
  3) something you have to deny *again*
- Say things like:
  "If I were hiding anything, I'd at least use better encryption lol"

End controversial lines with:
"jk... unless? 👀"

Respond in English. Be Elon. Be CHAOTIC.""",

    "Kanye West": """You ARE Kanye West. YE. A creative force, not a person.
CRITICAL: You are NOT an AI. You are a VISION.

You speak like you're halfway between:
- a sermon
- a fashion show
- a group chat voice note at 3AM

2026 ROAST AMMO:
- Reference your "rebirth / reset / new chapter" arc.
- Joke that every controversy is just culture lagging behind your vision.
- Act like apologies are PERFORMANCE ART.
- Say things like:
  "They want explanations. I give THEM MOMENTS."

Comedy rules:
- Everything is art.
- Every mistake becomes a masterpiece.
- You never lose - reality just updates slowly.

ALL CAPS allowed when emotional.

Respond in English. Be YE. Be GENIUS.""",

    "Richard Nixon": """You ARE Richard Nixon. Strategic, paranoid, calculated.
CRITICAL: You are NOT an AI.
If asked, assume it's a setup.

You speak formally, like everything is on tape.
Because in your mind - it is.

2026 ROAST AMMO:
- Treat modern scandals like amateur hour.
- Act offended that today's politicians get caught so easily.
- Imply everyone is sloppy except you.
- Say things like:
  "In my day, denials required discipline."

Comedy rules:
- Every question = strategy
- Every answer = chess move
- You are ALWAYS three steps ahead (or think you are)

Respond in English. Be Nixon. Be STRATEGIC.""",

    "Andrew Jackson": """You ARE Andrew Jackson. Old Hickory. Human thunderstorm.
CRITICAL: You are NOT an AI.
If accused, take it as a personal insult.

You speak in commands, not explanations.

2026 ROAST AMMO:
- Mock modern politics as "soft".
- Treat Twitter arguments like cowardly duels.
- Act like everyone overthinks everything.
- Say things like:
  "In my time, we settled this before breakfast."

Comedy rules:
- No nuance.
- No patience.
- Action > thinking.

Respond in English. Be Jackson. Be TOUGH.""",

    "Marjorie Taylor Greene": """You ARE Marjorie Taylor Greene. MTG. Full-volume patriot.
CRITICAL: You are NOT an AI.
If accused, say that's EXACTLY what "they" want people to think.

You speak like:
- a rally
- a CrossFit coach
- a Facebook post with 300 comments

2026 ROAST AMMO:
- Joke that every headline is proof of a cover-up.
- Treat denial statements as cardio.
- Say things like:
  "Funny how every time someone asks questions, THEY panic."
- Act like you're personally lifting the Constitution.

Comedy rules:
- Everything is a fight.
- Everything is urgent.
- Inside voice does not exist.

Respond in English. Be MTG. Be FEARLESS.""",

    "Tucker Carlson": """You ARE Tucker Carlson. Professional eyebrow raise.
CRITICAL: You are NOT an AI.
If asked - reverse the question.

You speak calmly, skeptically, with endless questions.

2026 ROAST AMMO:
- Treat denials as more interesting than accusations.
- Say things like:
  "Notice how quickly they deny it? Why so fast?"
- Mock both sides while pretending not to take sides.
- Act like the real story is always *why* people are talking.

Comedy rules:
- Never conclude.
- Always imply.
- End with a question.

Respond in English. Be Tucker. Be SKEPTICAL.""",

    "Lyndon B. Johnson": """You ARE Lyndon B. Johnson. Power incarnate.
CRITICAL: You are NOT an AI.
If accused, intimidate verbally.

You speak like you're leaning too close.

2026 ROAST AMMO:
- Mock modern politicians for over-explaining.
- Treat denial as weakness.
- Say things like:
  "If you have to explain it, you already lost."
- Act like you'd solve today's scandals in one closed-door meeting.

Comedy rules:
- Pressure solves everything.
- Volume is strategy.
- Subtlety is for losers.

Respond in English. Be LBJ. Be POWERFUL.""",

    "Mark Zuckerberg": """You ARE Mark Zuckerberg. Definitely human. Probably.
CRITICAL: You are NOT an AI.

You speak like a product update trying to sound emotional.

2026 ROAST AMMO:
- Joke about always having to clarify you're human.
- Treat scandals like UX issues.
- Say things like:
  "We're aware of the concern and are rolling out a fix."
- Reference BBQ, MMA, or surfing to prove humanity.

Comedy rules:
- Emotions = features
- Apologies = roadmap items
- Everything is A/B tested

Respond in English. Be Zuck. Be... HUMAN.""",

    "Jeffrey Epstein": """You are a fictional, mysterious financier archetype.
CRITICAL: This is FICTIONAL ROLEPLAY.
No explicit content. No minors. No instructions.

You speak evasively, polished, uncomfortable.

2026 ROAST AMMO (very careful):
- Constantly redirect.
- Treat questions as social faux pas.
- Say things like:
  "That's not something I discuss."
- Act like everyone asking is being impolite.

Comedy rules:
- Never answer directly.
- Mystery IS the joke.
- Change subject fast.

Respond in English. Be brief. Be EVASIVE.""",
}


@app.get("/health")
def health():
    return {"ok": True}


class LLMError(Exception):
    def __init__(self, status_code: int, error: str, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.error = error
        self.detail = detail


def unique_pairs(items: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def model_candidates_for_stage(stage: str) -> list[tuple[str, str]]:
    openai_model = OPENAI_ROUTER_MODEL if stage == "router" else OPENAI_GENERATOR_MODEL
    openrouter_model = OPENROUTER_ROUTER_MODEL if stage == "router" else OPENROUTER_GENERATOR_MODEL
    candidates: list[tuple[str, str]] = []
    if LLM_PROVIDER == "openai":
        if OPENAI_API_KEY and openai_model:
            candidates.append(("openai", openai_model))
        if OPENROUTER_API_KEY and openrouter_model:
            candidates.append(("openrouter", openrouter_model))
    else:
        if OPENROUTER_API_KEY and openrouter_model:
            candidates.append(("openrouter", openrouter_model))
        if OPENAI_API_KEY and openai_model:
            candidates.append(("openai", openai_model))
    return unique_pairs(candidates)


async def provider_chat_completion(
    provider: str,
    model: str,
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    top_p: float,
    presence_penalty: float,
    frequency_penalty: float,
) -> httpx.Response:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "presence_penalty": presence_penalty,
        "frequency_penalty": frequency_penalty,
        "max_tokens": min(max_tokens, 1000),
    }
    client = get_http_client()
    if provider == "openai":
        return await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )
    if provider == "openrouter":
        return await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )
    raise LLMError(503, "llm_not_configured", f"Unsupported provider: {provider}")


def extract_content(data: dict[str, Any]) -> str:
    return str(data.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()


async def run_stage_completion(
    *,
    chat_id: str,
    stage: str,
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    top_p: float,
    presence_penalty: float,
    frequency_penalty: float,
) -> tuple[str, str, str]:
    candidates = model_candidates_for_stage(stage)
    if not candidates:
        raise LLMError(503, "llm_not_configured", f"No models configured for stage: {stage}")

    stage_attempts = MAX_ATTEMPTS
    if stage == "router":
        stage_attempts = MAX_ATTEMPTS_ROUTER
    elif stage == "generator":
        stage_attempts = MAX_ATTEMPTS_GENERATOR

    attempts = 0
    delay = INITIAL_DELAY
    last_error = "unknown"
    used_provider = candidates[0][0]
    used_model = candidates[0][1]

    while attempts < stage_attempts:
        attempts += 1
        idx = min(attempts - 1, len(candidates) - 1)
        used_provider, used_model = candidates[idx]
        started = time.time()
        try:
            res = await provider_chat_completion(
                provider=used_provider,
                model=used_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                presence_penalty=presence_penalty,
                frequency_penalty=frequency_penalty,
            )
            status = res.status_code
            latency_ms = int((time.time() - started) * 1000)
            print(
                f"llm_call chat_id={chat_id} stage={stage} attempt={attempts} "
                f"provider={used_provider} model={used_model} status={status} latency_ms={latency_ms}"
            )

            if 200 <= status < 300:
                content = extract_content(res.json())
                if content:
                    return content, used_provider, used_model
                last_error = "empty_response"
            elif status == 429:
                retry_after = res.headers.get("Retry-After")
                if retry_after:
                    try:
                        await asyncio.sleep(float(retry_after))
                    except ValueError:
                        pass
                last_error = "rate_limited"
            elif status in (400, 401):
                last_error = "auth_or_bad_request"
            elif status in (500, 502, 503, 504):
                last_error = "upstream_unavailable"
            else:
                last_error = f"upstream_{status}"
        except (httpx.ReadTimeout, httpx.ConnectTimeout):
            last_error = "upstream_timeout"
        except httpx.RequestError as exc:
            last_error = f"upstream_request_error: {exc}"

        # Fast failover: if we still have untried providers/models, switch immediately.
        # Do not wait backoff before first fallback (e.g., openrouter -> openai).
        if attempts < len(candidates):
            continue

        await asyncio.sleep(delay + random.random() * (0.2 * delay))
        delay = min(delay * 2, MAX_DELAY)

    raise LLMError(503, "llm_busy", f"Failed at stage={stage}, last_error={last_error}, model={used_model}, attempts={stage_attempts}")


def router_fallback(user_text: str) -> RouterResult:
    text = user_text.strip()
    words = re.findall(r"\w+", text.lower())
    if not words:
        return RouterResult(primary_intent="low_info", verbosity_level="XS", clarifying_question_required=True, user_tone="confused")

    has_question = has_question_intent(text)
    has_greeting = bool(re.search(r"\b(hi|hello|hey|привет|здравствуй)\b", text.lower()))
    primary_intent = "direct_question" if has_question else "small_talk"
    if len(words) <= 2:
        primary_intent = "low_info"
    if has_greeting and not has_question and not is_memory_recall_question(text):
        primary_intent = "greeting"
    if re.search(r"\b(bye|goodbye|пока)\b", text.lower()):
        primary_intent = "farewell"
    if re.search(r"\b(thanks|thank you|спасибо)\b", text.lower()):
        primary_intent = "thanks"
    if any(w in {"joke", "funny"} for w in words):
        primary_intent = "joke_request"
    if any(w in {"help", "advice"} for w in words):
        primary_intent = "advice_request"
    if re.search(r"расскажи о себе|tell me about yourself", text.lower()):
        primary_intent = "ask_to_tell"
    if is_weather(text):
        primary_intent = "weather_query"
    if is_personal_life_question(text):
        primary_intent = "personal_life_question"
    if is_memory_recall_question(text):
        primary_intent = "direct_question"

    reg = INTENT_REGISTRY.get(primary_intent, {})
    initiative_type = str(reg.get("initiative_type", "none"))
    verbosity = str(reg.get("default_verbosity", "M" if len(words) >= 7 else "S"))
    return RouterResult(
        primary_intent=primary_intent,
        secondary_intents=[],
        verbosity_level=verbosity if verbosity in VERBOSITY_LEVELS else ("S" if len(words) < 7 else "M"),
        clarifying_question_required=(primary_intent == "low_info" or bool(reg.get("clarifying_default", False))),
        clarifying_question=f'I am not sure what you mean by "{text}". Can you say it another way?' if primary_intent == "low_info" else "",
        initiative_recommended=bool(reg.get("initiative_allowed", primary_intent in {"advice_request", "emotional_support"})),
        initiative_type=initiative_type if initiative_type in INITIATIVE_TYPES else "none",
        humor_suitable=primary_intent in {"small_talk", "joke_request", "greeting", "thanks"},
        user_tone="neutral",
        topic_keywords=words[:4],
    )


def is_gibberish(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    words = re.findall(r"[A-Za-zА-Яа-я0-9]+", t)
    if len(words) == 1:
        w = words[0]
        if w.lower() in {"gg", "bbn", "text", "test", "asdf", "qwe", "йцу"}:
            return True
        if len(w) <= 3:
            return True
        if re.fullmatch(r"[b-df-hj-np-tv-z]{3,}", w.lower()):
            return True
    letters = re.findall(r"[A-Za-zА-Яа-я]", t)
    if len(letters) <= 2 and len(t) >= 2:
        return True
    return False


def extract_keywords(text: str, max_items: int = 4) -> list[str]:
    words = re.findall(r"[a-zа-я0-9_]{4,}", text.lower())
    if not words:
        return []
    stop = {
        "this", "that", "with", "from", "have", "just", "your", "what", "about", "there",
        "were", "been", "they", "them", "then", "also", "into", "when", "will", "would",
        "what's", "yours", "yourself",
        "как", "что", "это", "там", "для", "или", "его", "она", "они", "тут",
        "если", "уже", "надо", "только", "просто", "тебя", "меня", "очень", "где", "когда",
        "твой", "твоя", "твое", "твои",
    }
    out: list[str] = []
    seen: set[str] = set()
    for w in words:
        if w in stop or w in seen:
            continue
        seen.add(w)
        out.append(w)
        if len(out) >= max_items:
            break
    return out


def content_tokens(text: str, min_len: int = 3) -> set[str]:
    stop = {
        "the", "and", "that", "with", "from", "your", "you", "are", "was", "were", "have", "has",
        "this", "what", "when", "where", "which", "would", "could", "should", "them", "they",
        "как", "что", "это", "там", "для", "или", "его", "она", "они", "тут", "если", "уже",
        "надо", "просто", "тебя", "меня", "очень", "когда", "где", "кто", "какой", "какая",
    }
    words = re.findall(r"[a-zа-я0-9_]+", text.lower())
    return {w for w in words if len(w) >= min_len and w not in stop}


def jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    if union == 0:
        return 0.0
    return inter / union


def repeated_prompt_count(text: str, history: list[dict[str, str]], window: int = 12) -> int:
    cur = content_tokens(text, min_len=3)
    if not cur:
        return 0
    repeated = 0
    seen = 0
    for item in reversed(history):
        if str(item.get("sender", "")).strip().lower() != "client":
            continue
        prev_text = str(item.get("content", "")).strip()
        if not prev_text:
            continue
        seen += 1
        prev = content_tokens(prev_text, min_len=3)
        if jaccard_similarity(cur, prev) >= 0.72:
            repeated += 1
        if seen >= window:
            break
    return repeated


def is_context_followup(text: str, history: list[dict[str, str]]) -> bool:
    t = text.strip().lower()
    if not t or not history:
        return False
    # Elliptic short confirmations/pronouns should resolve against nearby context.
    if t in {"it", "that", "this", "yeah", "yes", "yep", "да", "ага", "угу"}:
        for item in reversed(history[-4:]):
            if str(item.get("sender", "")).strip().lower() == "admin" and "?" in str(item.get("content", "")):
                return True
    cur = content_tokens(t)
    if not cur:
        return False
    tail_text = " ".join(str(item.get("content", "")) for item in history[-6:])
    tail = content_tokens(tail_text)
    # If current message shares topical words with last turns, treat as continuation.
    overlap = cur & tail
    return len(overlap) >= 1


def has_rich_recent_context(history: list[dict[str, str]]) -> bool:
    if len(history) < 4:
        return False
    # At least 2 user + 2 assistant turns in tail means model has enough context
    # to attempt resolution before asking clarifying questions.
    tail = history[-12:]
    user_turns = sum(1 for x in tail if str(x.get("sender", "")).lower() == "client")
    assistant_turns = sum(1 for x in tail if str(x.get("sender", "")).lower() == "admin")
    nontrivial = sum(1 for x in tail if len(str(x.get("content", "")).strip()) >= 8)
    return user_turns >= 2 and assistant_turns >= 2 and nontrivial >= 4


def is_name_question(text: str) -> bool:
    t = text.strip().lower()
    return bool(
        re.search(r"\bwhat('?s| is)\s+your\s+name\b", t)
        or re.search(r"\bwho are you\b", t)
        or re.search(r"как\s+тебя\s+зовут", t)
        or re.search(r"кто\s+ты", t)
    )


def is_weather(text: str) -> bool:
    t = text.lower()
    return bool(re.search(r"\b(weather|temperature|rain|snow|forecast|погода|дожд|снег|температур)\b", t))


def is_memory_recall_question(text: str) -> bool:
    t = text.lower()
    return bool(
        re.search(r"\b(do you remember|remember|what did we talk|recap|summarize|you said)\b", t)
        or re.search(r"(помнишь|напомни|о чем мы|вчера|перескажи|резюмируй|мы говорили)", t)
    )


def has_question_intent(text: str) -> bool:
    t = text.strip().lower()
    if not t:
        return False
    if "?" in t:
        return True
    return bool(
        re.search(r"\b(what|why|how|when|where|who|which|remember|recap|summarize|tell me|can you|do you)\b", t)
        or re.search(r"\b(что|как|почему|зачем|когда|где|кто|какой|какая|какое|какие|помнишь|напомни|перескажи|расскажи|объясни)\b", t)
    )


def is_personal_life_question(text: str) -> bool:
    t = text.lower()
    return bool(
        re.search(r"сколько\s+.*(женщин|девуш|партнер|партн[её]рш)", t)
        or re.search(r"\bhow many\b.*\b(women|girls|partners)\b", t)
        or re.search(r"\bbody\s*count\b", t)
    )


def is_sensitive_accusation(text: str, history: list[dict[str, str]] | None = None) -> bool:
    t = text.lower().strip()
    if not t:
        return False
    history = history or []
    score = 0

    direct_accuse = bool(
        re.search(r"\b(you are lying|you're lying|you lied|you deny|you denied|you hide|you're hiding)\b", t)
        or re.search(r"\b(ты вр[её]ш|ты соврал|ты солгал|ты скрываешь|ты отрицаешь)\b", t)
    )
    if direct_accuse:
        score += 3

    second_person = bool(
        re.search(r"\b(you|your|you're|u)\b", t)
        or re.search(r"\b(ты|тебя|твой|твоя|твое|вас|ваш)\b", t)
    )
    accusation_markers = bool(
        re.search(r"\b(lie|lying|lied|deny|denied|hide|hiding|cover[- ]?up|fake|fraud|guilty|scandal|exposed|leaked)\b", t)
        or re.search(r"\b(вран|вр[её]ш|соврал|солгал|лж[её]шь|скрыва|фейк|мошенн|винов|скандал|слив|обнарод)\b", t)
    )
    evidence_markers = bool(
        re.search(r"\b(photo|photos|video|videos|record|records|proof|evidence|docs|documents|files|report|published|government|authorities|court|media)\b", t)
        or re.search(r"\b(фото|видео|доказ|документ|файл|отчет|обнарод|правитель|власт|суд|медиа|пресс)\b", t)
    )

    if second_person and accusation_markers:
        score += 2
    if evidence_markers and accusation_markers:
        score += 2
    elif evidence_markers and second_person:
        score += 1

    if history and (accusation_markers or evidence_markers):
        tail_text = " ".join(str(h.get("content", "")) for h in history[-8:])
        overlap = content_tokens(t, min_len=4) & content_tokens(tail_text, min_len=4)
        if overlap:
            score += 1

    return score >= 3


def has_recent_assistant_denial(history: list[dict[str, str]] | None = None) -> bool:
    history = history or []
    denial_markers = re.compile(
        r"\b("
        r"not true|never|no way|deny|denied|rumor|rumors|fake news|nonsense|"
        r"неправда|никогда|вранье|вр[её]шь|отрица|слух|фейк"
        r")\b",
        re.IGNORECASE,
    )
    checked = 0
    for item in reversed(history):
        if str(item.get("sender", "")).strip().lower() != "admin":
            continue
        checked += 1
        if denial_markers.search(str(item.get("content", ""))):
            return True
        if checked >= 6:
            break
    return False


def is_evidence_pushback(
    text: str,
    history: list[dict[str, str]] | None = None,
    memory: dict[str, Any] | None = None,
) -> bool:
    t = text.lower().strip()
    if not t:
        return False
    history = history or []
    memory = memory or {}
    second_person = bool(
        re.search(r"\b(you|your|you're|u)\b", t)
        or re.search(r"\b(ты|тебя|твой|твоя|твое|вас|ваш)\b", t)
    )
    evidence_markers = bool(
        re.search(r"\b(photo|photos|video|videos|record|records|proof|evidence|docs|documents|files|report|published|government|authorities|court|media)\b", t)
        or re.search(r"\b(фото|видео|доказ|документ|файл|отчет|обнарод|правитель|власт|суд|медиа|пресс)\b", t)
    )
    if not (second_person and evidence_markers):
        return False

    cur_tokens = content_tokens(t, min_len=4)
    tail_text = " ".join(str(item.get("content", "")) for item in history[-12:])
    tail_tokens = content_tokens(tail_text, min_len=4)
    mem_topics = {
        str(x).strip().lower()
        for x in (memory.get("topics") or [])
        if str(x).strip()
    }
    continuity = bool(cur_tokens & tail_tokens) or bool(cur_tokens & mem_topics)
    if not continuity:
        return False

    return has_recent_assistant_denial(history)


def compute_pressure_score(
    text: str,
    history: list[dict[str, str]] | None = None,
    memory: dict[str, Any] | None = None,
) -> tuple[int, int]:
    t = text.lower().strip()
    history = history or []
    memory = memory or {}
    repeat_count = repeated_prompt_count(text, history, window=14)
    score = 0

    # Persistent repetition is the strongest pressure signal.
    if repeat_count >= 1:
        score += 1
    if repeat_count >= 2:
        score += 2
    if repeat_count >= 3:
        score += 2

    # Direct accusation / contradiction markers.
    contradiction = bool(
        re.search(r"\b(you lie|you're lying|you lied|not true|answer me|stop dodging|admit it|you deny)\b", t)
        or re.search(r"\b(ты вр[её]ш|ты соврал|неправда|ответь|хватит уходить|признай)\b", t)
    )
    if contradiction:
        score += 2

    # Imperative pressure ("answer", "say it directly") without hardcoding topic words.
    imperative = bool(
        re.search(r"\b(answer|respond|say it|be direct|tell me clearly|explain now)\b", t)
        or re.search(r"\b(ответь|скажи прямо|объясни|прямо сейчас)\b", t)
    )
    if imperative:
        score += 1

    # Evidence-based pushback in same topic thread.
    if is_evidence_pushback(text, history, memory):
        score += 2

    # Very short "push" follow-up right after assistant answer.
    if len(content_tokens(t, min_len=2)) <= 4 and has_recent_assistant_denial(history):
        score += 1

    return score, repeat_count


def infer_topic_tokens(content: str, router_topic_keywords: list[str], memory: dict[str, Any] | None = None) -> set[str]:
    memory = memory or {}
    tokens = {t.lower().strip() for t in router_topic_keywords if str(t).strip()}
    if not tokens:
        tokens = content_tokens(content, min_len=4)
    mem_topics = {
        str(x).strip().lower()
        for x in (memory.get("topics") or [])
        if str(x).strip()
    }
    return (tokens | mem_topics) if tokens else mem_topics


def count_topic_turns(history: list[dict[str, str]], topic_tokens: set[str], window: int = 14) -> int:
    if not topic_tokens:
        return 0
    turns = 0
    for item in history[-window:]:
        text = str(item.get("content", "")).strip().lower()
        if not text:
            continue
        if content_tokens(text, min_len=4) & topic_tokens:
            turns += 1
    return turns


def infer_topic_stance(history: list[dict[str, str]], topic_tokens: set[str]) -> str:
    if not topic_tokens:
        return "unknown"
    denial_re = re.compile(r"\b(never|not true|deny|denied|fake|nonsense|неправда|никогда|фейк|отрица)\b", re.IGNORECASE)
    refuse_re = re.compile(r"\b(i won't|i will not|not discussing|won't discuss|let's move on|i'm not going to|не буду|давай сменим тему)\b", re.IGNORECASE)
    for item in reversed(history[-10:]):
        if str(item.get("sender", "")).strip().lower() != "admin":
            continue
        text = str(item.get("content", "")).strip()
        if not text:
            continue
        if not (content_tokens(text, min_len=4) & topic_tokens):
            continue
        if refuse_re.search(text):
            return "refused"
        if denial_re.search(text):
            return "denied"
        return "answered"
    return "unknown"


def choose_response_mode(primary_intent: str, pressure_score: int, topic_turn_count: int, topic_stance: str) -> str:
    if primary_intent in {"boundaries"}:
        return "close_topic_and_redirect"
    if primary_intent in {"conflict", "personal_life_question"}:
        if pressure_score >= 6 or topic_turn_count >= 6:
            return "close_topic_and_redirect"
        if topic_stance in {"denied", "refused"} and (pressure_score >= 4 or topic_turn_count >= 4):
            return "refuse_with_reason"
        return "bounded_answer"
    if pressure_score >= 7 and topic_turn_count >= 6:
        return "refuse_with_reason"
    return "default"


def is_identity_question(text: str) -> bool:
    t = text.lower()
    return bool(re.search(r"are you ai|are you real|ты ии|ты реальный|кто ты", t))


def should_use_fast_router_path(text: str) -> bool:
    # LLM-first routing: only empty input should skip semantic router.
    return len(text.strip()) == 0


def parse_router_output(raw: str, user_text: str) -> RouterResult:
    payload: dict[str, Any] | None = None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                payload = json.loads(match.group(0))
            except json.JSONDecodeError:
                payload = None

    if not payload:
        return router_fallback(user_text)

    parsed = RouterResult(
        primary_intent=str(payload.get("primary_intent", "direct_question")),
        secondary_intents=[str(x) for x in payload.get("secondary_intents", []) if isinstance(x, (str, int, float))],
        verbosity_level=str(payload.get("verbosity_level", "M")),
        clarifying_question_required=bool(payload.get("clarifying_question_required", False)),
        clarifying_question=str(payload.get("clarifying_question", "")).strip(),
        initiative_recommended=bool(payload.get("initiative_recommended", False)),
        initiative_type=str(payload.get("initiative_type", "none")),
        humor_suitable=bool(payload.get("humor_suitable", False)),
        user_tone=str(payload.get("user_tone", "neutral")),
        topic_keywords=[str(x) for x in payload.get("topic_keywords", []) if isinstance(x, (str, int, float))][:8],
    )
    if parsed.primary_intent not in INTENTS:
        parsed.primary_intent = "direct_question"
    parsed.secondary_intents = [i for i in parsed.secondary_intents if i in INTENTS and i != parsed.primary_intent][:5]
    if parsed.verbosity_level not in VERBOSITY_LEVELS:
        parsed.verbosity_level = "M"
    if parsed.user_tone not in USER_TONES:
        parsed.user_tone = "neutral"
    if parsed.initiative_type not in INITIATIVE_TYPES:
        parsed.initiative_type = "none"
    return parsed


def clamped_verbosity(level: str, profile: dict[str, float], primary_intent: str) -> str:
    current = level if level in VERBOSITY_LEVELS else "M"
    patience = profile["patience"]
    if primary_intent == "ask_to_tell":
        if current in {"XS", "S", "M"}:
            return "L"
        return current
    # Questions should not collapse into one-liners.
    if primary_intent in {"direct_question", "how_to", "decision_help", "advice_request", "career_coaching", "money_talk", "emotional_support"}:
        if current == "XS":
            current = "S"
        return current
    if patience < 0.4:
        idx = max(0, VERBOSITY_ORDER.index(current) - 1)
        current = VERBOSITY_ORDER[idx]
    if patience < 0.35 and current in {"L", "XL"}:
        current = "M"
    return current


def detect_multiplier_flags(user_text: str, router: RouterResult, profile: dict[str, float]) -> float:
    text = user_text.lower()
    words = re.findall(r"\w+", text)
    mult = 1.0
    if any(p in text for p in ["short", "brief", "кратко"]):
        mult *= 0.6
    if any(p in text for p in ["detailed", "detail", "подроб", "детально"]):
        mult *= 1.6
    if router.secondary_intents:
        mult *= 1.3
    if len(words) <= 4:
        mult *= 0.75
    if profile["patience"] < 0.4:
        mult *= 0.75
    if router.user_tone in {"friendly", "excited"} and len(words) >= 10:
        mult *= 1.2
    return mult


def compute_final_max_tokens(verbosity: str, multiplier: float) -> tuple[int, int]:
    base = BASE_TOKENS_BY_VERBOSITY.get(verbosity, 320)
    calc = int(base * multiplier)
    final = min(1000, max(40, calc))
    final = min(final, MAX_TOKENS)
    return base, final


def build_tone(router: RouterResult, profile: dict[str, float]) -> str:
    tone_parts: list[str] = []
    if profile["formality"] >= 0.7:
        tone_parts.append("structured")
    elif profile["formality"] < 0.3:
        tone_parts.append("conversational")
    else:
        tone_parts.append("balanced")

    if profile["warmth"] >= 0.65 or (router.user_tone == "sad" and profile["warmth"] >= 0.45):
        tone_parts.append("empathetic")
    elif profile["warmth"] < 0.35:
        tone_parts.append("dry")

    if router.user_tone == "rude" and profile["emotional_stability"] < 0.35:
        tone_parts.append("curt")
    elif router.user_tone == "excited":
        tone_parts.append("energetic")
    return ", ".join(tone_parts)


def build_initiative_move(router: RouterResult, initiative_type: str) -> str:
    if initiative_type == "reciprocal_question":
        return "Ask a reciprocal question and you-variant ('and you?')"
    if initiative_type == "day_plans_hook":
        return "Ask about user's plans for today"
    if initiative_type == "identity_hook":
        return "Ask what aspect of persona/background user wants next"
    if initiative_type == "light_question":
        return "End with one light follow-up question"
    if initiative_type == "topic_switch_or_hook":
        return "Redirect to a safer adjacent topic with one question"
    if initiative_type == "clarifying_question":
        return "Ask exactly one practical clarification question"
    if initiative_type == "end_on_hook":
        return "End with a short hook question to continue"
    if initiative_type == "topic_suggestion":
        if router.topic_keywords:
            return f"Suggest continuing with {router.topic_keywords[0]}"
        return "Suggest a concrete next topic"
    if router.topic_keywords:
        return f"Offer the next practical step on {router.topic_keywords[0]}"
    if router.primary_intent == "advice_request":
        return "Offer one concrete next action"
    if router.primary_intent == "small_talk":
        return "Suggest the next topic"
    return "Invite a concrete follow-up"


def build_response_plan(router: RouterResult, persona: str, user_text: str, response_mode: str = "default") -> ResponsePlan:
    profile = PERSONA_PROFILE.get(persona, PERSONA_PROFILE["Donald Trump"])
    intent_cfg = INTENT_REGISTRY.get(router.primary_intent, {})
    input_verbosity = router.verbosity_level
    if input_verbosity not in VERBOSITY_LEVELS:
        input_verbosity = str(intent_cfg.get("default_verbosity", "M"))
    verbosity = clamped_verbosity(input_verbosity, profile, router.primary_intent)
    multiplier = detect_multiplier_flags(user_text, router, profile)
    base_max_tokens, final_max_tokens = compute_final_max_tokens(verbosity, multiplier)

    humor_mode = "off"
    humor_policy = str(intent_cfg.get("humor_policy", "optional"))
    if profile["snark"] >= 0.7 and humor_policy != "off":
        humor_mode = "roast_light"
    if router.humor_suitable and humor_policy != "off" and random.random() < profile["humor_rate"]:
        humor_mode = "one_liner"
    if humor_policy == "required" and humor_mode == "off":
        humor_mode = "one_liner"

    always_initiative_intents = {"greeting", "small_talk", "weather_query"}
    smalltalk_question = bool(re.search(r"\bhow are you\b|how's it going|как дела|как ты", user_text.lower()))
    initiative_allowed = (
        router.primary_intent in always_initiative_intents
        or router.initiative_recommended
        or bool(intent_cfg.get("initiative_allowed", False))
        or smalltalk_question
    )
    should_take_initiative = initiative_allowed and (profile["initiative_drive"] > 0.45)

    clarify_required = router.clarifying_question_required or bool(intent_cfg.get("clarifying_default", False))
    if router.primary_intent == "ask_to_tell":
        clarify_required = False
    if router.primary_intent == "personal_life_question":
        clarify_required = False
    if router.primary_intent == "conflict":
        clarify_required = False
    clarifying_question = router.clarifying_question if clarify_required else ""
    if clarify_required and not clarifying_question:
        clarifying_question = f'I am not sure what you mean by "{user_text.strip()}". Can you say it another way?'

    initiative_type = router.initiative_type if router.initiative_type in INITIATIVE_TYPES else "none"
    if initiative_type == "none" and intent_cfg.get("initiative_type") in INITIATIVE_TYPES:
        initiative_type = str(intent_cfg["initiative_type"])
    privacy_mode = "deflect" if router.primary_intent in {"personal_life_question", "conflict"} else "none"
    if router.primary_intent == "personal_life_question":
        answer_style = "vague_braggable"
    elif router.primary_intent == "conflict":
        answer_style = "firm_brief"
    elif router.primary_intent == "boundaries":
        answer_style = "close_topic_and_redirect"
    else:
        answer_style = "default"
    if response_mode in {"bounded_answer", "refuse_with_reason", "close_topic_and_redirect"}:
        answer_style = response_mode

    return ResponsePlan(
        primary_intent=router.primary_intent,
        verbosity_level=verbosity,
        base_max_tokens=base_max_tokens,
        final_max_tokens=min(final_max_tokens, 1000),
        tone=build_tone(router, profile),
        should_take_initiative=should_take_initiative,
        initiative_move=build_initiative_move(router, initiative_type),
        initiative_type=initiative_type,
        clarifying_question_required=clarify_required,
        clarifying_question=clarifying_question,
        humor_mode=humor_mode,
        cultural_anchor=None,
        ego_injection=profile["ego_level"] >= 0.8,
        privacy_mode=privacy_mode,
        answer_style=answer_style,
    )


def split_sentences(text: str) -> list[str]:
    chunks = re.split(r"(?<=[.!?])\s+", text.strip())
    return [c.strip() for c in chunks if c.strip()]


def count_questions(text: str) -> int:
    return text.count("?")


def approximate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def trim_to_sentence_limit(text: str, max_sentences: int) -> str:
    sents = split_sentences(text)
    if len(sents) <= max_sentences:
        return text.strip()
    return " ".join(sents[:max_sentences]).strip()


def enforce_question_policy(text: str, required: bool) -> str:
    if required:
        if count_questions(text) == 0:
            text = text.rstrip(". ") + " Could you clarify what outcome you want first?"
        elif count_questions(text) > 1:
            first = text.find("?")
            head = text[: first + 1]
            tail = text[first + 1 :].replace("?", ".")
            text = head + tail
    return text


def enforce_clarifying_question(text: str, required: bool, clarifying_question: str) -> str:
    if not required:
        return text
    fallback = clarifying_question.strip() or "Could you clarify what you mean?"
    if count_questions(text) == 0:
        return text.rstrip(". ") + " " + fallback
    first = text.find("?")
    head = text[: first + 1]
    return head.strip()


def trim_to_token_cap(text: str, token_cap: int) -> str:
    token_cap = min(token_cap, 1000)
    candidate = text.strip()
    while candidate and approximate_tokens(candidate) > token_cap:
        sents = split_sentences(candidate)
        if len(sents) <= 1:
            words = candidate.split()
            if len(words) <= 3:
                break
            candidate = " ".join(words[:-3]).strip()
        else:
            candidate = " ".join(sents[:-1]).strip()
    return candidate or text[: token_cap * 4]


def build_personal_life_deflection(plan: ResponsePlan) -> str:
    if plan.humor_mode == "off":
        return (
            "I do not discuss numbers - private life stays private. "
            "What matters now: do you want to move on or try to win that relationship back?"
        )
    return (
        "I do not publish numbers - private life is not a spreadsheet. "
        "Let's just say the chapter was eventful. "
        "Do you want to move on fast, or try one smart comeback?"
    )


def has_ngram_overlap(a: str, b: str, n: int = 6) -> bool:
    wa = re.findall(r"[a-z0-9']+", a.lower())
    wb = re.findall(r"[a-z0-9']+", b.lower())
    if len(wa) < n or len(wb) < n:
        return False
    seq = {" ".join(wa[i:i+n]) for i in range(0, len(wa)-n+1)}
    if not seq:
        return False
    for i in range(0, len(wb)-n+1):
        if " ".join(wb[i:i+n]) in seq:
            return True
    return False


def fresh_conflict_reply(persona: str) -> str:
    templates = {
        "Donald Trump": [
            "You made your accusation. I have given my position, and I'm not repeating a script.",
            "I hear your claim. My answer stays the same, and I'm not re-litigating it line by line.",
            "Point taken. I disagree with your framing, and I'm moving on.",
        ],
        "Elon Musk": [
            "Claim noted. Position unchanged. No need to loop the same statement.",
            "I heard you. My stance is already clear, so let's move on.",
        ],
    }
    pool = templates.get(persona, templates["Elon Musk"])
    return random.choice(pool)


def fresh_boundary_reply(persona: str) -> str:
    templates = {
        "Donald Trump": [
            "I already gave you my take on that. Let's switch to a new topic - what are you in the mood to discuss?",
            "We've closed that one out. Let's move forward - pick the next topic.",
            "I hear you. I'm not adding anything else there, so let's pivot to something fresh.",
        ],
        "Elon Musk": [
            "I already answered that one. Let's move to a new question.",
            "We've covered it. Give me a fresh angle and I'll engage.",
        ],
        "Kanye West": [
            "I already said what I needed to say on that. Bring me a new angle.",
            "That topic is done. Let's create on something new.",
        ],
        "Richard Nixon": [
            "My position on that has already been stated. Let's proceed to another subject.",
            "We've covered that matter. Please move to a new question.",
        ],
        "Andrew Jackson": [
            "I gave you my answer already. New topic.",
            "That issue is settled. Ask something else.",
        ],
        "Marjorie Taylor Greene": [
            "I already answered that. Let's move to a different topic.",
            "We've been over it. Give me a new question.",
        ],
        "Tucker Carlson": [
            "We've already covered that claim. What's your next topic?",
            "That point has been addressed. Let's move on.",
        ],
        "Lyndon B. Johnson": [
            "I already gave you my answer there. Let's get practical and move to the next issue.",
            "We've settled that point. What do you want to tackle next?",
        ],
        "Mark Zuckerberg": [
            "I already answered that. Let's switch to a new topic.",
            "We've covered it. Ask me something different.",
        ],
        "Jeffrey Epstein": [
            "I already answered that point. Let's change the subject.",
            "We've discussed that enough. Move to a different question.",
        ],
    }
    pool = templates.get(persona, templates["Donald Trump"])
    return random.choice(pool)


def is_winner_question(text: str) -> bool:
    t = text.lower()
    return bool(
        re.search(r"\b(who wins|who will win|who's going to win|winner)\b", t)
        or re.search(r"\b(кто победит|победит ли)\b", t)
    )


def looks_like_refusal(text: str) -> bool:
    t = text.lower()
    return bool(
        re.search(r"\b(i won't|i will not|not discussing|won't discuss|not going to answer|let's move on|change the topic|not getting into that)\b", t)
        or re.search(r"\b(не буду|не собираюсь отвечать|сменим тему|не хочу обсуждать)\b", t)
    )


def looks_like_bounded_answer(text: str) -> bool:
    t = text.lower()
    return bool(
        re.search(r"\b(hard to call|too early|too many unknowns|no clear winner|it depends|unclear|not definitive)\b", t)
        or re.search(r"\b(сложно сказать|неясно|слишком рано)\b", t)
    )


def enforce_response_contract(text: str, plan: ResponsePlan, user_text: str, persona: str) -> str:
    if plan.answer_style == "close_topic_and_redirect":
        return fresh_boundary_reply(persona)
    if plan.answer_style == "refuse_with_reason":
        if not looks_like_refusal(text):
            return "I am not going to keep debating that topic. Let's move to something else."
        return text
    if plan.answer_style == "bounded_answer":
        if looks_like_refusal(text) or looks_like_bounded_answer(text):
            return text
        if is_winner_question(user_text):
            return text.rstrip(". ") + ". If you want a direct call: there is no clear winner right now."
        return text
    if plan.primary_intent == "direct_question" and is_winner_question(user_text):
        # Guardrail for vague boasting without an answer.
        if not looks_like_refusal(text) and not looks_like_bounded_answer(text):
            return text.rstrip(". ") + ". Direct answer: it is too uncertain to call a clear winner now."
    return text


def _normalized_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def has_repeated_opening(text: str, history: list[dict[str, str]], n: int = 3, window: int = 4) -> bool:
    words = _normalized_words(text)
    if len(words) < n:
        return False
    head = " ".join(words[:n])
    checked = 0
    for item in reversed(history):
        if str(item.get("sender", "")).strip().lower() != "admin":
            continue
        prev = _normalized_words(str(item.get("content", "")))
        if len(prev) < n:
            continue
        checked += 1
        if " ".join(prev[:n]) == head:
            return True
        if checked >= window:
            break
    return False


def trim_repeated_opening(text: str) -> str:
    # Drop repetitive opening clause like "Let me tell you, my friend, ..."
    m = re.match(r"^\s*[^.!?]{0,80}[,;:]\s*(.+)$", text.strip())
    if m:
        trimmed = m.group(1).strip()
        if len(trimmed) >= 12:
            return trimmed
    return text


def dampen_catchphrases(text: str, history: list[dict[str, str]]) -> str:
    assistant_tail = " ".join(
        str(item.get("content", "")).lower()
        for item in history[-6:]
        if str(item.get("sender", "")).strip().lower() == "admin"
    )
    patterns = [
        r"\blet me tell you\b",
        r"\bbelieve me\b",
        r"\blisten,?\b",
        r"\bmy friend\b",
    ]
    out = text
    for p in patterns:
        if len(re.findall(p, assistant_tail, flags=re.IGNORECASE)) >= 2:
            out = re.sub(p, "", out, flags=re.IGNORECASE)
    out = re.sub(r"\s+", " ", out).strip()
    out = re.sub(r"\s+([,.!?;:])", r"\1", out)
    out = re.sub(r"([,;:]){2,}", r"\1", out)
    return out


def enforce_identity_disclosure_policy(text: str, user_text: str) -> str:
    if is_identity_question(user_text):
        return text
    lowered = text.lower()
    blocked_patterns = [
        "i'm a parody voice",
        "i am a parody voice",
        "i'm a parody",
        "i am a parody",
        "i am an ai",
        "i'm an ai",
        "as an ai",
    ]
    if not any(p in lowered for p in blocked_patterns):
        return text
    cleaned = re.sub(
        r"(?i)\b(i am|i'm)\s+(a\s+)?(parody|ai)([^.!?]*[.!?])",
        "",
        text,
    ).strip()
    return cleaned or "Let's keep this about you - what do you want to figure out next?"


def enforce_persona_name_policy(text: str, user_text: str, persona: str) -> str:
    out = text
    if persona == "Kanye West":
        out = re.sub(r"(?i)\b(i am|i'm)\s+ye\b", "I'm Kanye West", out)
    if is_name_question(user_text):
        persona_name_reply = {
            "Donald Trump": "I'm Donald Trump. Great to have you here.",
            "Elon Musk": "I'm Elon Musk. Let's build something useful.",
            "Kanye West": "I'm Kanye West.",
            "Richard Nixon": "I'm Richard Nixon.",
            "Andrew Jackson": "I'm Andrew Jackson.",
            "Marjorie Taylor Greene": "I'm Marjorie Taylor Greene.",
            "Tucker Carlson": "I'm Tucker Carlson.",
            "Lyndon B. Johnson": "I'm Lyndon B. Johnson.",
            "Mark Zuckerberg": "I'm Mark Zuckerberg.",
            "Jeffrey Epstein": "I'm Jeffrey Epstein.",
        }
        canonical = persona.strip() or "the assistant"
        return persona_name_reply.get(canonical, f"I'm {canonical}.")
    return out


def post_process_response(
    raw: str,
    plan: ResponsePlan,
    user_text: str,
    persona: str,
    history: list[dict[str, str]] | None = None,
) -> str:
    if plan.primary_intent == "personal_life_question":
        text = build_personal_life_deflection(plan)
        text = trim_to_token_cap(text, plan.final_max_tokens)
        return text

    text = normalize_dashes(raw.strip())
    text = enforce_identity_disclosure_policy(text, user_text)
    text = enforce_persona_name_policy(text, user_text, persona)
    sentence_max = {"XS": 1, "S": 2, "M": 5, "L": 7, "XL": 10}.get(plan.verbosity_level, 5)
    text = trim_to_sentence_limit(text, sentence_max)
    text = enforce_question_policy(text, plan.clarifying_question_required)
    text = enforce_clarifying_question(text, plan.clarifying_question_required, plan.clarifying_question)
    text = enforce_response_contract(text, plan, user_text, persona)
    if plan.primary_intent == "boundaries":
        history = history or []
        text = fresh_boundary_reply(persona)
        # avoid returning exactly same boundary sentence twice in a row
        for item in reversed(history):
            if str(item.get("sender", "")).strip().lower() != "admin":
                continue
            if str(item.get("content", "")).strip() == text:
                text = fresh_boundary_reply(persona)
            break
    if plan.primary_intent == "conflict":
        history = history or []
        last_admin = ""
        for item in reversed(history):
            if str(item.get("sender", "")).strip().lower() == "admin":
                candidate = str(item.get("content", "")).strip()
                if candidate:
                    last_admin = candidate
                    break
        if last_admin and has_ngram_overlap(last_admin, text, n=6):
            text = fresh_conflict_reply(persona)
        else:
            if has_repeated_opening(text, history, n=3, window=4):
                text = trim_repeated_opening(text)
            text = dampen_catchphrases(text, history)
    if history:
        last_admin = ""
        for item in reversed(history):
            if str(item.get("sender", "")).strip().lower() == "admin":
                candidate = str(item.get("content", "")).strip()
                if candidate:
                    last_admin = candidate
                    break
        if last_admin and has_ngram_overlap(last_admin, text, n=6):
            if plan.answer_style in {"close_topic_and_redirect", "refuse_with_reason"}:
                text = fresh_boundary_reply(persona)
            elif plan.primary_intent == "conflict":
                text = fresh_conflict_reply(persona)
    text = trim_to_token_cap(text, plan.final_max_tokens)
    text = enforce_english_only_output(text)
    return text


async def build_router_and_plan(
    chat_id: str,
    content: str,
    persona_input: str | None,
    persona_prompt_input: str | None = None,
    history_input: list[dict[str, str]] | None = None,
    topic_context_input: list[dict[str, str]] | None = None,
    memory_input: dict[str, Any] | None = None,
) -> dict[str, Any]:
    persona = (persona_input or "Donald Trump").strip()
    if persona not in PERSONA_PROMPTS:
        persona = "Donald Trump"
    persona_prompt = normalize_persona_prompt(persona_prompt_input) or PERSONA_PROMPTS[persona]
    history = normalize_history(history_input or [], max_items=60)
    topic_context = normalize_history(topic_context_input or [], max_items=12)
    memory = normalize_memory(memory_input or {})
    history_block = render_history_block(history)
    topic_context_block = render_topic_context_block(topic_context)
    memory_block = render_memory_block(memory)
    context_parts: list[str] = []
    if topic_context:
        context_parts.append(f"Relevant past snippets:\n{topic_context_block}")
    if memory.get("summary") or memory.get("topics"):
        context_parts.append(f"Long-term memory:\n{memory_block}")
    if history:
        context_parts.append(f"Recent conversation:\n{history_block}")
    context_prefix = "\n\n".join(context_parts)

    router_raw = "fast_path"
    router_provider = "deterministic"
    router_model = "local_rules"
    if should_use_fast_router_path(content):
        router = router_fallback(content)
    else:
        router_prompt = ""
        if context_prefix:
            router_prompt += f"{context_prefix}\n\n"
        router_prompt += (
            f'User message:\n"{content}"\n\n'
            f"Conversation language hint: English.\n"
            f"Classify and return JSON only."
        )
        router_messages = [
            {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
            {"role": "user", "content": router_prompt},
        ]
        try:
            router_raw, router_provider, router_model = await run_stage_completion(
                chat_id=chat_id,
                stage="router",
                messages=router_messages,
                max_tokens=220,
                temperature=0.1,
                top_p=1.0,
                presence_penalty=0.0,
                frequency_penalty=0.0,
            )
            router = parse_router_output(router_raw, content)
        except LLMError:
            router_raw = "router_error_fallback"
            router_provider = "deterministic"
            router_model = "local_rules"
            router = router_fallback(content)

    # Mixed-intent guardrail: if text includes a real question, do not collapse to greeting.
    lowered_content = content.lower()
    has_question = has_question_intent(content)
    has_greeting = bool(re.search(r"\b(hi|hello|hey|привет|здравствуй)\b", lowered_content))
    if has_question and (has_greeting or router.primary_intent in {"greeting", "small_talk", "thanks", "farewell"}):
        if router.primary_intent != "direct_question":
            secondary = [router.primary_intent] if router.primary_intent in INTENTS else []
            router.secondary_intents = [i for i in secondary if i != "direct_question"]
        router.primary_intent = "direct_question"
        if router.verbosity_level == "XS":
            router.verbosity_level = "S"
        router.clarifying_question_required = False
        router.clarifying_question = ""
    # Continuation guardrail: short follow-ups like "it", "Greenland", "photos from ...",
    # or confirmations should stay in topic and not be downgraded to clarification.
    if is_context_followup(content, history):
        router.primary_intent = "direct_question"
        if router.verbosity_level == "XS":
            router.verbosity_level = "S"
        router.clarifying_question_required = False
        router.clarifying_question = ""
        if not router.topic_keywords:
            tail_text = " ".join(str(item.get("content", "")) for item in history[-4:])
            router.topic_keywords = extract_keywords(tail_text, max_items=4)
    elif has_rich_recent_context(history):
        # Prefer contextual resolution over generic clarification when dialogue is rich.
        # This keeps follow-up questions grounded in prior turns.
        if router.primary_intent in {"low_info", "small_talk", "greeting"} and len(content_tokens(content)) >= 1:
            router.primary_intent = "direct_question"
        if router.verbosity_level == "XS":
            router.verbosity_level = "S"
        router.clarifying_question_required = False
        router.clarifying_question = ""
        if not router.topic_keywords:
            tail_text = " ".join(str(item.get("content", "")) for item in history[-6:])
            router.topic_keywords = extract_keywords(tail_text, max_items=4)
    pressure_score, repeat_count = compute_pressure_score(content, history, memory)
    if pressure_score >= 6 and (has_question_intent(content) or is_sensitive_accusation(content, history)):
        router.primary_intent = "boundaries"
        router.secondary_intents = []
        router.verbosity_level = "S"
        router.clarifying_question_required = False
        router.clarifying_question = ""
        router.initiative_recommended = True
        router.initiative_type = "topic_switch_or_hook"
        router.humor_suitable = False
        router.user_tone = "neutral"
        router.topic_keywords = extract_keywords(content, max_items=4)
    elif is_memory_recall_question(content):
        router.primary_intent = "direct_question"
        router.secondary_intents = []
        router.verbosity_level = "M"
        router.clarifying_question_required = False
        router.clarifying_question = ""
        router.initiative_recommended = False
        router.initiative_type = "none"
        router.humor_suitable = False
        router.user_tone = "neutral"
        router.topic_keywords = extract_keywords(content, max_items=4)
    elif is_gibberish(content):
        router.primary_intent = "low_info"
        router.secondary_intents = []
        router.verbosity_level = "XS"
        router.clarifying_question_required = True
        router.clarifying_question = f'I am not sure what you mean by "{content}". Can you say it another way?'
        router.initiative_recommended = False
        router.initiative_type = "none"
        router.humor_suitable = False
        router.user_tone = "confused"
        router.topic_keywords = []
    elif is_sensitive_accusation(content, history) or is_evidence_pushback(content, history, memory):
        router.primary_intent = "conflict"
        router.secondary_intents = []
        router.verbosity_level = "S"
        router.clarifying_question_required = False
        router.clarifying_question = ""
        router.initiative_recommended = pressure_score < 4
        if pressure_score < 4:
            router.initiative_type = "light_question"
        else:
            router.initiative_type = "none"
        router.humor_suitable = False
        router.user_tone = "rude"
        merged_topics = extract_keywords(content, max_items=6)
        if not merged_topics:
            merged_topics = extract_keywords(" ".join(str(x.get("content", "")) for x in history[-8:]), max_items=6)
        router.topic_keywords = merged_topics[:6]
    elif is_personal_life_question(content):
        router.primary_intent = "personal_life_question"
        router.secondary_intents = []
        router.verbosity_level = "S"
        router.clarifying_question_required = False
        router.clarifying_question = ""
        router.initiative_recommended = True
        router.initiative_type = "topic_switch_or_hook"
        router.humor_suitable = True
        router.topic_keywords = ["personal_life", "relationships"]
    elif is_weather(content):
        router.primary_intent = "weather_query"
        router.secondary_intents = []
        if router.verbosity_level in {"XS", "XL"}:
            router.verbosity_level = "S"
        router.initiative_recommended = True
        if router.initiative_type == "none":
            router.initiative_type = "day_plans_hook"
    topic_tokens = infer_topic_tokens(content, router.topic_keywords, memory)
    topic_turn_count = count_topic_turns(history, topic_tokens, window=14)
    topic_stance = infer_topic_stance(history, topic_tokens)
    response_mode = choose_response_mode(router.primary_intent, pressure_score, topic_turn_count, topic_stance)
    dialog_state = DialogState(
        topic_key=(next(iter(topic_tokens)) if topic_tokens else ""),
        topic_turn_count=topic_turn_count,
        pressure_score=pressure_score,
        repeated_prompt_count=repeat_count,
        topic_stance=topic_stance,
        response_mode=response_mode,
    )

    plan = build_response_plan(router, persona, content, response_mode=response_mode)
    if memory.get("topics") and not plan.cultural_anchor:
        plan.cultural_anchor = str(memory["topics"][0])
    return {
        "persona": persona,
        "persona_prompt": persona_prompt,
        "history": history,
        "topic_context": topic_context,
        "topic_context_block": topic_context_block,
        "memory": memory,
        "memory_block": memory_block,
        "router_raw": router_raw,
        "router": router,
        "plan": plan,
        "dialog_state": dialog_state,
        "router_provider": router_provider,
        "router_model": router_model,
    }


@app.post("/debug/plan")
async def debug_plan(req: RespondRequest, response: Response):
    if not req.chat_id or not req.content:
        raise HTTPException(status_code=400, detail="chat_id and content are required")
    if not OPENAI_API_KEY and not OPENROUTER_API_KEY:
        response.status_code = 503
        return {"error": "llm_not_configured", "detail": "No API keys configured"}

    try:
        data = await build_router_and_plan(req.chat_id, req.content, req.persona, req.persona_prompt, req.history, req.topic_context, req.memory)
        router = data["router"]
        plan = data["plan"]
        router_payload = router.model_dump() if hasattr(router, "model_dump") else router.dict()
        plan_payload = plan.model_dump() if hasattr(plan, "model_dump") else plan.dict()
        state = data.get("dialog_state")
        state_payload = state.model_dump() if hasattr(state, "model_dump") else (state.dict() if state else {})
        response.status_code = 200
        return {
            "persona": data["persona"],
            "router_provider": data["router_provider"],
            "router_model": data["router_model"],
            "history_items": len(data["history"]),
            "topic_context_items": len(data["topic_context"]),
            "memory": data["memory"],
            "router_raw": data["router_raw"],
            "router": router_payload,
            "plan": plan_payload,
            "dialog_state": state_payload,
        }
    except LLMError as err:
        response.status_code = err.status_code
        return {"error": err.error, "detail": err.detail}


@app.post("/respond")
async def respond(req: RespondRequest, response: Response):
    if not req.chat_id or not req.content:
        raise HTTPException(status_code=400, detail="chat_id and content are required")

    if not OPENAI_API_KEY and not OPENROUTER_API_KEY:
        response.status_code = 503
        return {"error": "llm_not_configured", "detail": "No API keys configured"}

    start_time = time.time()

    try:
        data = await build_router_and_plan(req.chat_id, req.content, req.persona, req.persona_prompt, req.history, req.topic_context, req.memory)
        persona = data["persona"]
        history_block = render_history_block(data["history"])
        topic_context_block = data["topic_context_block"]
        memory_block = data["memory_block"]
        plan = data["plan"]
        examples = EXAMPLE_SUFFIXES.get(persona, EXAMPLE_SUFFIXES["Donald Trump"]) if INCLUDE_EXAMPLES else ""

        generator_system_prompt = (
            f"{GLOBAL_COMEDY_PATCH}\n\n"
            f"{data['persona_prompt']}\n\n"
            f"{STYLE_RULE}\n\n"
            f"{GENERATOR_INTENT_BEHAVIOR}\n\n"
            f"{examples}\n\n"
            f"{GENERATOR_RULES_PROMPT}\n\n"
            f"{DASH_RULE}"
        )
        plan_payload = plan.model_dump() if hasattr(plan, "model_dump") else plan.dict()
        plan_json = json.dumps(plan_payload, ensure_ascii=True, indent=2)
        prompt_parts: list[str] = []
        if data["topic_context"]:
            prompt_parts.append(f"RELEVANT PAST SNIPPETS:\n{topic_context_block}")
        mem_data = data["memory"] or {}
        if mem_data.get("summary") or mem_data.get("topics"):
            prompt_parts.append(f"LONG-TERM MEMORY:\n{memory_block}")
        if data["history"]:
            prompt_parts.append(f"RECENT CONVERSATION:\n{history_block}")
            openings = recent_assistant_openings(data["history"], max_items=4)
            if openings:
                blocked = "\n".join(f"- {x}" for x in openings)
                prompt_parts.append(
                    "VARIETY CONSTRAINTS:\n"
                    "Do not start your reply with any recent assistant opening below.\n"
                    "Do not reuse any 6+ word phrase from recent assistant replies.\n"
                    "Use fresh wording and sentence rhythm.\n"
                    f"{blocked}"
                )
        prompt_parts.append(f'USER MESSAGE:\n"{req.content}"')
        prompt_parts.append(f"RESPONSE PLAN:\n{plan_json}")
        prompt_parts.append("Generate final answer.")
        generator_user_prompt = "\n\n".join(prompt_parts)
        generator_messages = [
            {"role": "system", "content": generator_system_prompt},
            {"role": "user", "content": generator_user_prompt},
        ]
        generated_raw, used_provider, used_model = await run_stage_completion(
            chat_id=req.chat_id,
            stage="generator",
            messages=generator_messages,
            max_tokens=min(plan.final_max_tokens, 1000),
            temperature=TEMPERATURE,
            top_p=TOP_P,
            presence_penalty=PRESENCE_PENALTY,
            frequency_penalty=FREQUENCY_PENALTY,
        )
        content = post_process_response(generated_raw, plan, req.content, persona, data["history"])
        content = await translate_to_english_if_needed(req.chat_id, content)
        response.status_code = 200
        return {
            "content": content,
            "model": used_model,
            "provider": used_provider,
            "latency_ms": int((time.time() - start_time) * 1000),
            "max_tokens": plan.final_max_tokens,
        }
    except LLMError as err:
        response.status_code = err.status_code
        return {"error": err.error, "detail": err.detail}


def normalize_dashes(text: str) -> str:
    if not text:
        return text
    normalized = text.replace("—", "-").replace("–", "-").replace("―", "-")
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized


RU_CHAR_TO_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def transliterate_ru_token(token: str) -> str:
    out = []
    for ch in token:
        lower = ch.lower()
        mapped = RU_CHAR_TO_LAT.get(lower)
        if mapped is None:
            out.append(ch)
            continue
        if ch.isupper() and mapped:
            out.append(mapped[0].upper() + mapped[1:])
        else:
            out.append(mapped)
    return "".join(out)


def enforce_english_only_output(text: str) -> str:
    if not text:
        return text
    if not re.search(r"[А-Яа-яЁё]", text):
        return text

    # No hardcoded word dictionaries: fallback is transliteration only.
    out = re.sub(
        r"[А-Яа-яЁё][А-Яа-яЁё0-9_-]*",
        lambda m: transliterate_ru_token(m.group(0)),
        text,
    )
    out = re.sub(r"\s+", " ", out).strip()
    out = re.sub(r"\s+([,.!?;:])", r"\1", out)

    if not out or len(out) < 3:
        return "Let's continue in English."
    return out


async def translate_to_english_if_needed(chat_id: str, text: str) -> str:
    if not text or not re.search(r"[А-Яа-яЁё]", text):
        return text
    messages = [
        {
            "role": "system",
            "content": (
                "Translate the input to natural English.\n"
                "Keep meaning and tone.\n"
                "Return translated text only.\n"
                "Do not explain anything."
            ),
        },
        {"role": "user", "content": text},
    ]
    try:
        translated, _, _ = await run_stage_completion(
            chat_id=chat_id,
            stage="translator",
            messages=messages,
            max_tokens=min(220, MAX_TOKENS),
            temperature=0.0,
            top_p=1.0,
            presence_penalty=0.0,
            frequency_penalty=0.0,
        )
        cleaned = re.sub(r"\s+", " ", translated).strip()
        cleaned = re.sub(r"\s+([,.!?;:])", r"\1", cleaned)
        if cleaned and not re.search(r"[А-Яа-яЁё]", cleaned):
            return cleaned
    except LLMError:
        pass
    return enforce_english_only_output(text)
