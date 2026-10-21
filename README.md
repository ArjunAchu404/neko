# Neko — Anime Companion

Neko is a responsive anime discovery app with interactive AniList details, personal watchlists, saved chat history, streaming AI replies, and email/password accounts. AI replies use **NVIDIA NIM** with **`openai/gpt-oss-20b`** by default.

## Included
- Email/password signup and login; passwords are hashed with scrypt and never stored in plain text.
- Bearer sessions expire after 30 days; signing out revokes the current session.
- Each user's watchlist and chat history are stored separately on the backend and fetched only after authentication.
- NVIDIA API key stays on the backend.
- Responsive interface, dark/light themes, clickable anime details and AniList search.

## Local setup (Windows PowerShell)

From the project root (the folder containing `backend`, `frontend`, and `requirements.txt`):

### Backend terminal

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:NVIDIA_API_KEY = Read-Host "Enter your NVIDIA API key"
$env:NVIDIA_NIM_MODEL = "openai/gpt-oss-20b"
$env:NEKO_DB_PATH = "$PWD\neko.sqlite3"
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Keep this window open. The API key is visible while typing with `Read-Host`; do not screenshot or share the terminal while entering it.

### Frontend terminal

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Public deployment

The included `render.yaml` describes the API service and mounts a persistent disk at `/var/data`. **A persistent disk requires a paid Render web service**; without persistent storage, SQLite data may be lost when a free instance restarts or redeploys. For a larger deployment, use managed PostgreSQL and a migration designed for PostgreSQL.

1. Push this project to a private/public Git repository without secrets.
2. Create a Render Blueprint from `render.yaml` and select a plan that supports persistent disks.
3. Set `NVIDIA_API_KEY` in the backend service environment. Keep `NVIDIA_NIM_MODEL` as `openai/gpt-oss-20b`.
4. Set `ALLOW_ORIGINS` to the exact production frontend origin(s), e.g. `https://your-neko-site.example` (no trailing slash). Do not leave it blank in production.
5. Deploy the frontend as a static site. Set build command `cd frontend && npm ci && npm run build`, publish directory `frontend/dist`, and build-time variable `VITE_API_BASE` to the public backend URL, e.g. `https://your-neko-api.onrender.com`.
6. After the frontend domain is known, update `ALLOW_ORIGINS` with that domain and redeploy/restart the backend.
7. Test signup with two different emails and verify that each account has a separate watchlist and chat history.

## Environment variables
- `NVIDIA_API_KEY` — required secret, backend only.
- `NVIDIA_NIM_MODEL` — defaults to `openai/gpt-oss-20b`.
- `NEKO_DB_PATH` — SQLite path; set this to persistent storage in production (`/var/data/neko.sqlite3` on the supplied Render config).
- `ALLOW_ORIGINS` — comma-separated frontend origins; configure exact production origins.
- `VITE_API_BASE` — frontend build-time public backend URL; defaults to `http://127.0.0.1:8000` for local development.

## Security and production checklist

This starter implementation includes password hashing, expiring/revocable sessions, authenticated account-data endpoints, and per-user data ownership. Before a large public launch, add email verification, password reset, login rate limiting / abuse protection, privacy and terms pages, account deletion/export, monitoring, and preferably a managed PostgreSQL database. HTTPS must be enabled in production. Never commit API keys or user database files.

Anime metadata comes from AniList. Episode counts and other fields may be unavailable for some titles. AI responses can be inaccurate.


## Authentication flows (local development)

- Sign-up now creates an unverified account. The backend terminal prints a `[NEKO EMAIL VERIFICATION]` link. Open it in the same browser to verify and sign in.
- Sign-in includes **Forgot password?** and **Resend verification email** links. Reset and verification URLs are printed in the backend terminal while testing locally.
- Password reset links expire after 30 minutes; verification links expire after 24 hours. Tokens are stored as hashes and are single-use.
- After signing in, open the account menu and select **Profile & settings** to update username/avatar or delete the account and its associated saved data.
- Local terminal links are a development fallback, not real email delivery. Before public launch, configure an SMTP provider and send these links by email, add distributed rate limiting, HTTPS-only secure session handling, automated backups, and a tested Google OAuth flow.
- Existing accounts in an older SQLite database are migrated as already verified so you do not get locked out. Newly registered accounts must verify their email.

The NVIDIA NIM model defaults to `openai/gpt-oss-20b`. Keep `NVIDIA_API_KEY` only in the backend environment; never put it in frontend variables.
