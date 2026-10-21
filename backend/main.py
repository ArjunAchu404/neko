import hashlib
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

ANILIST_URL = "https://graphql.anilist.co"
AIMLAPI_URL = os.getenv("AIMLAPI_API_URL", "https://api.aimlapi.com/v1/chat/completions")
DEFAULT_MODEL = "openai/gpt-5-5"
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
origins = [o.strip() for o in os.getenv("ALLOW_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
app = FastAPI(title="Neko Anime AI API", version="1.1.0")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])

# For public hosting, point NEKO_DB_PATH at persistent storage (e.g. /var/data/neko.sqlite3)
DB_PATH = os.getenv("NEKO_DB_PATH", str(Path(__file__).resolve().parent.parent / "neko.sqlite3"))
TOKEN_DAYS = 30


def db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          email_verified INTEGER NOT NULL DEFAULT 1,
          username TEXT NOT NULL DEFAULT '',
          avatar_url TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_data (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          data_key TEXT NOT NULL,
          json_value TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(user_id, data_key)
        );
        CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS auth_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purpose TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        """)
        # Migrate existing databases safely. Existing accounts stay usable.
        cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "email_verified" not in cols: conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1")
        if "username" not in cols: conn.execute("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''")
        if "avatar_url" not in cols: conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''")


@app.on_event("startup")
def startup():
    init_db()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + salt.hex() + "$" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$", 2)
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return secrets.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AuthPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value


class GraphQLRequest(BaseModel):
    query: str = Field(min_length=1, max_length=12000)
    variables: dict[str, Any] = Field(default_factory=dict)

class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=5000)

class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=16)

class AccountData(BaseModel):
    value: Any

class EmailPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value): raise ValueError("Enter a valid email address.")
        return value

class TokenPayload(BaseModel):
    token: str = Field(min_length=20, max_length=256)

class ResetPasswordPayload(TokenPayload):
    password: str = Field(min_length=8, max_length=128)

class ProfilePayload(BaseModel):
    username: str = Field(min_length=2, max_length=32)
    avatar_url: str = Field(default="", max_length=500)
    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9 _.-]{2,32}", value): raise ValueError("Use 2–32 letters, numbers, spaces, dots, underscores, or hyphens.")
        return value
    @field_validator("avatar_url")
    @classmethod
    def clean_avatar(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith(("https://", "http://")): raise ValueError("Avatar URL must start with https:// or http://.")
        return value

SYSTEM_INSTRUCTION = """You are Neko, a friendly, thoughtful anime companion. Help with spoiler-aware recommendations, watch orders, character discussions, genre discovery, anime trivia, and manga/anime comparisons. Ask before revealing major spoilers and clearly label spoilers when requested. Be honest when unsure; never pretend to have checked live release dates or news unless live data is supplied. Use readable Markdown and concise, warm responses. For recommendations, bold each anime title and explain briefly why it fits."""


def model_name() -> str:
    return os.getenv("AIMLAPI_MODEL", DEFAULT_MODEL)


def build_messages(payload: ChatRequest, username: str | None = None):
    """Build chat context with the authenticated user's preferred name."""
    safe_name = (username or "").strip()[:32]
    if safe_name:
        personalized_instruction = (
            SYSTEM_INSTRUCTION
            + f"\n\nThe current user's preferred username is {json.dumps(safe_name, ensure_ascii=False)}. "
            + "Address the user by this username naturally from time to time, especially in greetings or personalized recommendations. "
            + "Do not use the username in every message, do not force it into every sentence, and never call the user by their email address. "
            + "If the user asks to be called something else, respect that preference for the conversation."
        )
    else:
        personalized_instruction = (
            SYSTEM_INSTRUCTION
            + "\n\nNo username is available for this user. Do not guess their name; use a friendly neutral greeting instead."
        )
    return [{"role": "system", "content": personalized_instruction}] + [
        {"role": m.role, "content": m.content} for m in payload.messages[-8:]
    ]


def aimlapi_headers():
    key = os.getenv("AIMLAPI_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Neko AI is not configured. Set AIMLAPI_API_KEY in the backend environment.")
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    token = authorization[7:].strip()
    if not token or len(token) > 256:
        raise HTTPException(status_code=401, detail="Invalid session. Please sign in again.")
    with db() as conn:
        row = conn.execute("""SELECT users.id, users.email, users.created_at, users.username, sessions.token_hash
          FROM sessions JOIN users ON users.id=sessions.user_id
          WHERE sessions.token_hash=? AND sessions.expires_at>?""", (token_hash(token), now_iso())).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    username = (row["username"] or "").strip() or row["email"].split("@", 1)[0]
    return {"id": row["id"], "email": row["email"], "username": username[:32], "created_at": row["created_at"], "token_hash": row["token_hash"]}


def issue_session(user_id: int):
    token = secrets.token_urlsafe(36)
    expiry = (datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)).isoformat()
    with db() as conn:
        conn.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", (token_hash(token), user_id, expiry))
    return token, expiry


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "Neko", "stage": "beta", "ai_configured": bool(os.getenv("AIMLAPI_API_KEY")), "provider": "AI/ML API", "model": model_name(), "accounts_enabled": True}


def create_action_token(user_id: int, purpose: str, minutes: int = 30) -> str:
    raw = secrets.token_urlsafe(32)
    expiry = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()
    with db() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE user_id=? AND purpose=?", (user_id, purpose))
        conn.execute("INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)", (token_hash(raw), user_id, purpose, expiry))
    return raw


def local_action_url(path: str, raw: str) -> str:
    frontend = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return f"{frontend}/?{path}={raw}"


@app.post("/api/auth/signup")
async def signup(payload: AuthPayload):
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    created = now_iso()
    username = payload.email.split("@", 1)[0][:32]
    try:
        with db() as conn:
            cursor = conn.execute("INSERT INTO users(email,password_hash,created_at,email_verified,username) VALUES(?,?,?,?,?)", (payload.email, hash_password(payload.password), created, 0, username))
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Try signing in.")
    raw = create_action_token(user_id, "verify_email", 60 * 24)
    # Development fallback: use a real SMTP provider in production.
    print(f"[NEKO EMAIL VERIFICATION] {local_action_url('verify_email', raw)}")
    return {"needs_verification": True, "message": "Account created. Open the verification link printed in the backend terminal.", "email": payload.email}


@app.post("/api/auth/verify-email")
async def verify_email(payload: TokenPayload):
    with db() as conn:
        row = conn.execute("SELECT user_id FROM auth_tokens WHERE token_hash=? AND purpose='verify_email' AND expires_at>?", (token_hash(payload.token), now_iso())).fetchone()
        if not row: raise HTTPException(status_code=400, detail="This verification link is invalid or expired. Request a new one.")
        user_id = row["user_id"]
        conn.execute("UPDATE users SET email_verified=1 WHERE id=?", (user_id,))
        conn.execute("DELETE FROM auth_tokens WHERE token_hash=?", (token_hash(payload.token),))
        user = conn.execute("SELECT id,email,created_at,username,avatar_url FROM users WHERE id=?", (user_id,)).fetchone()
    token, expires = issue_session(user_id)
    return {"token": token, "expires_at": expires, "user": {"id": user["id"], "email": user["email"], "created_at": user["created_at"], "username": user["username"], "avatar_url": user["avatar_url"]}}


@app.post("/api/auth/resend-verification")
async def resend_verification(payload: EmailPayload):
    with db() as conn:
        row = conn.execute("SELECT id,email_verified FROM users WHERE email=? COLLATE NOCASE", (payload.email,)).fetchone()
    if row and not row["email_verified"]:
        raw = create_action_token(row["id"], "verify_email", 60 * 24)
        print(f"[NEKO EMAIL VERIFICATION] {local_action_url('verify_email', raw)}")
    return {"ok": True, "message": "If your account needs verification, a new link has been generated. Check the backend terminal during local development."}


@app.post("/api/auth/login")
async def login(payload: AuthPayload):
    with db() as conn:
        row = conn.execute("SELECT id,email,password_hash,created_at,email_verified,username,avatar_url FROM users WHERE email=? COLLATE NOCASE", (payload.email,)).fetchone()
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if not row["email_verified"]:
        raise HTTPException(status_code=403, detail="Please verify your email first. Use Resend verification email to generate a new link.")
    token, expires = issue_session(row["id"])
    return {"token": token, "expires_at": expires, "user": {"id": row["id"], "email": row["email"], "created_at": row["created_at"], "username": row["username"], "avatar_url": row["avatar_url"]}}


@app.post("/api/auth/forgot-password")
async def forgot_password(payload: EmailPayload):
    with db() as conn:
        row = conn.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE", (payload.email,)).fetchone()
    if row:
        raw = create_action_token(row["id"], "reset_password", 30)
        print(f"[NEKO PASSWORD RESET — expires in 30 minutes] {local_action_url('reset_password', raw)}")
    return {"ok": True, "message": "If an account exists for that email, a reset link has been generated. During local testing, check the backend terminal."}


@app.post("/api/auth/reset-password")
async def reset_password(payload: ResetPasswordPayload):
    with db() as conn:
        row = conn.execute("SELECT user_id FROM auth_tokens WHERE token_hash=? AND purpose='reset_password' AND expires_at>?", (token_hash(payload.token), now_iso())).fetchone()
        if not row: raise HTTPException(status_code=400, detail="This reset link is invalid or expired. Request another reset link.")
        user_id = row["user_id"]
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(payload.password), user_id))
        conn.execute("DELETE FROM auth_tokens WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    return {"ok": True, "message": "Password changed. Sign in with your new password."}


@app.get("/api/auth/me")
async def me(user=Depends(current_user)):
    with db() as conn:
        row = conn.execute("SELECT id,email,created_at,username,avatar_url,email_verified FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"user": {"id": row["id"], "email": row["email"], "created_at": row["created_at"], "username": row["username"], "avatar_url": row["avatar_url"], "email_verified": bool(row["email_verified"])}}


@app.put("/api/account/profile")
async def update_profile(payload: ProfilePayload, user=Depends(current_user)):
    with db() as conn:
        conn.execute("UPDATE users SET username=?, avatar_url=? WHERE id=?", (payload.username, payload.avatar_url, user["id"]))
        row = conn.execute("SELECT id,email,created_at,username,avatar_url,email_verified FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"user": {"id": row["id"], "email": row["email"], "created_at": row["created_at"], "username": row["username"], "avatar_url": row["avatar_url"], "email_verified": bool(row["email_verified"])}}


@app.delete("/api/account/me")
async def delete_account(user=Depends(current_user)):
    with db() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (user["id"],))
    return {"ok": True}


@app.post("/api/auth/logout")
async def logout(user=Depends(current_user)):
    with db() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash=?", (user["token_hash"],))
    return {"ok": True}


@app.get("/api/account/{data_key}")
async def get_account_data(data_key: str, user=Depends(current_user)):
    if data_key not in {"watchlist", "chats"}:
        raise HTTPException(status_code=404, detail="Unknown account data.")
    with db() as conn:
        row = conn.execute("SELECT json_value FROM user_data WHERE user_id=? AND data_key=?", (user["id"], data_key)).fetchone()
    return {"value": json.loads(row["json_value"]) if row else []}


@app.put("/api/account/{data_key}")
async def put_account_data(data_key: str, payload: AccountData, user=Depends(current_user)):
    if data_key not in {"watchlist", "chats"}:
        raise HTTPException(status_code=404, detail="Unknown account data.")
    serialized = json.dumps(payload.value, ensure_ascii=False, separators=(",", ":"))
    if len(serialized) > 2_000_000:
        raise HTTPException(status_code=413, detail="Saved data is too large.")
    if data_key == "watchlist" and (not isinstance(payload.value, list) or len(payload.value) > 1000):
        raise HTTPException(status_code=422, detail="Watchlist must be a list with at most 1000 items.")
    if data_key == "chats" and (not isinstance(payload.value, list) or len(payload.value) > 100):
        raise HTTPException(status_code=422, detail="Chat history must be a list with at most 100 conversations.")
    with db() as conn:
        conn.execute("""INSERT INTO user_data(user_id,data_key,json_value,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(user_id,data_key) DO UPDATE SET json_value=excluded.json_value, updated_at=excluded.updated_at""",
          (user["id"], data_key, serialized, now_iso()))
    return {"ok": True}


@app.post("/api/chat")
async def chat(payload: ChatRequest, user=Depends(current_user)):
    body = {"model": model_name(), "messages": build_messages(payload, user.get("username")), "temperature": float(os.getenv("NEKO_CHAT_TEMPERATURE", "0.5")), "max_tokens": int(os.getenv("NEKO_CHAT_MAX_TOKENS", "650")), "stream": False}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(AIMLAPI_URL, headers=aimlapi_headers(), json=body)
        if response.is_error:
            print(f"AI/ML API HTTP {response.status_code}: {response.text[:700]}")
            raise HTTPException(status_code=502, detail="AI/ML API could not generate a reply. Check your model ID, API key, credits, and account access.")
        data = response.json()
        answer = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        if not answer: raise HTTPException(status_code=502, detail="AI/ML API returned an empty reply. Try again.")
        return {"reply": answer, "model": data.get("model", model_name())}
    except HTTPException: raise
    except httpx.TimeoutException: raise HTTPException(status_code=504, detail="AI/ML API took too long to respond. Try again.")
    except httpx.RequestError as exc:
        print(f"AI/ML API connection failed: {type(exc).__name__}")
        raise HTTPException(status_code=502, detail="Could not connect to AI/ML API. Check your internet connection.")


@app.post("/api/chat/stream")
async def chat_stream(payload: ChatRequest, user=Depends(current_user)):
    headers = aimlapi_headers()
    body = {"model": model_name(), "messages": build_messages(payload, user.get("username")), "temperature": float(os.getenv("NEKO_CHAT_TEMPERATURE", "0.5")), "max_tokens": int(os.getenv("NEKO_CHAT_MAX_TOKENS", "650")), "stream": True}
    async def events() -> AsyncIterator[str]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
                async with client.stream("POST", AIMLAPI_URL, headers=headers, json=body) as response:
                    if response.is_error:
                        detail = (await response.aread()).decode("utf-8", "ignore")[:400]
                        yield "data: " + json.dumps({"error": f"AI/ML API returned HTTP {response.status_code}. Check model access, API credits, and configuration."}) + "\n\n"
                        print(f"AI/ML API stream HTTP {response.status_code}: {detail}")
                        return
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"): continue
                        raw = line[5:].strip()
                        if raw == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            packet = json.loads(raw)
                            choice = (packet.get("choices") or [{}])[0]
                            delta = choice.get("delta", {})
                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                yield "data: " + json.dumps({"text": content}, ensure_ascii=False) + "\n\n"
                            if choice.get("finish_reason") and not content:
                                yield "data: [DONE]\n\n"
                                return
                        except json.JSONDecodeError:
                            continue
        except httpx.TimeoutException:
            yield "data: " + json.dumps({"error": "AI/ML API timed out. Try again."}) + "\n\n"
        except httpx.RequestError as exc:
            print(f"AI/ML API stream connection failed: {type(exc).__name__}")
            yield "data: " + json.dumps({"error": "Could not connect to AI/ML API. Check your internet connection."}) + "\n\n"
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/anilist")
async def anilist_proxy(payload: GraphQLRequest):
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                ANILIST_URL,
                json={
                    "query": payload.query,
                    "variables": payload.variables,
                },
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "NekoAnime/1.0 (https://neko-1-pp28.onrender.com)",
                },
            )

        response.raise_for_status()
        data = response.json()

        if "errors" in data:
            raise HTTPException(
                status_code=502,
                detail="AniList returned a GraphQL error.",
            )

        return data

    except HTTPException:
        raise

    except httpx.TimeoutException:
        print("AniList request timed out.")
        raise HTTPException(
            status_code=504,
            detail="AniList request timed out.",
        )

    except httpx.HTTPStatusError as exc:
        print(
            f"AniList HTTP {exc.response.status_code}: "
            f"{exc.response.text[:500]}"
        )
        raise HTTPException(
            status_code=502,
            detail=f"AniList returned HTTP {exc.response.status_code}.",
        )

    except httpx.RequestError as exc:
        print(f"AniList connection failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Could not reach AniList.",
        )
