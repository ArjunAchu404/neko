# Neko — Anime Companion 🌸

Neko is a modern, responsive anime discovery platform built for anime fans. Discover trending anime, explore seasonal releases, search for your favorite series, manage your personal watchlist, and chat with Neko, your AI anime companion.

Featuring a sleek purple-and-black interface, AniList integration, user accounts, and an embedded chatbot, Neko brings anime discovery and conversation together in one place.

## ✨ Features

- **Anime discovery:** Explore trending anime, popular titles, and seasonal releases.
- **Anime search:** Search for anime and explore available details.
- **Anime details:** View information provided by AniList, including available metadata and episode information.
- **AI anime companion:** Chat with Neko about anime, discover new series, and get recommendations.
- **Conferbot integration:** Embedded chatbot with customizable greetings and anime-focused suggested questions.
- **Personal watchlists:** Save anime and access your saved titles.
- **User accounts:** Email/password registration, login, email verification, and password reset.
- **Private user data:** Watchlists and chat histories are associated with individual accounts.
- **Chat history:** Store and retrieve conversations through the backend.
- **Profile settings:** Manage your username and avatar, or delete your account and associated data.
- **Responsive interface:** Designed for desktop and mobile screens.
- **Dark and light themes:** Switch between visual themes.
- **Modern UI:** Purple-and-black styling with an anime-inspired aesthetic.

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite, JavaScript |
| Backend | Python, FastAPI |
| Anime data | AniList API |
| Chat widget | Conferbot |
| Database | SQLite |
| Version control | Git and GitHub |
| Deployment | Render |

The AI response provider depends on the current chatbot/backend configuration. NVIDIA NIM is not required by this README.

## 📁 Project Structure

```text
Neko/
├── backend/
│   ├── main.py
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── ChatPanel.jsx
│   │   ├── ConferbotWidget.jsx
│   │   └── ...
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── requirements.txt
├── render.yaml
├── .gitignore
└── README.md
```

The exact files may vary depending on your current implementation.

## ⚙️ Requirements

Install the following tools before running Neko locally:

- Python
- Node.js and npm
- Git
- A modern web browser

Any credentials required by your current AI integration should be configured separately and kept out of the frontend and Git repository.

## 🚀 Run Locally

### 1. Clone the repository

```powershell
git clone https://github.com/ArjunAchu404/neko.git
cd neko
```

### 2. Set up the Python backend

From the project root, create a virtual environment:

```powershell
py -m venv .venv
```

Install the Python dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Keep the backend terminal open while developing.

If your current backend requires additional environment variables, configure them according to your actual implementation before starting the server.

### 3. Set up the React frontend

Open a second PowerShell terminal:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite, usually:

`http://localhost:5173`

The frontend must be configured to communicate with the local backend when backend functionality is required.

## 🌐 Deploy to Render

Neko can be deployed publicly using Render and GitHub.

A typical deployment uses:

- A **Static Site** for the React/Vite frontend.
- A **Web Service** for the Python/FastAPI backend.
- Persistent database storage or a managed database for production user data.

### 1. Push the project to GitHub

Ensure your project is committed to:

[ArjunAchu404/neko](https://github.com/ArjunAchu404/neko)

Before pushing, verify that `.env` files, API credentials, database files, virtual environments, and other sensitive data are excluded from version control.

### 2. Deploy the backend

In the Render dashboard, create a Web Service connected to your GitHub repository.

If the backend is located in the `backend` directory, configure the service according to your actual project structure and `render.yaml`.

For a FastAPI application whose ASGI object is named `app` in `main.py`, a typical configuration is:

**Build command**

```bash
pip install -r requirements.txt
```

If `requirements.txt` is located in the repository root, configure the root directory and build command accordingly.

**Start command**

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

Use this command only if the module path matches your repository structure. If the Render service root directory is set to `backend`, the module path may instead be `main:app`.

Configure the backend's required environment variables in Render.

### 3. Configure backend environment variables

Common configuration variables may include:

| Variable | Purpose |
|---|---|
| `NEKO_DB_PATH` | Database file location, if supported by the backend |
| `ALLOW_ORIGINS` | Allowed frontend origins, if implemented |
| AI provider credentials | Credentials required by the currently configured AI integration |

Only configure variables that your backend actually supports.

Keep all private credentials in the backend environment. Never expose API secrets through frontend variables or commit them to GitHub.

### 4. Deploy the frontend

Create a Render Static Site connected to the same repository.

Use these settings when the frontend is in the `frontend` directory:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |

Configure the public backend URL as a frontend build-time variable if your app uses one:

```text
VITE_API_BASE=https://YOUR-NEKO-API.onrender.com
```

Replace the example URL with your actual deployed backend URL.

If the Conferbot widget is enabled, configure its public widget ID:

```text
VITE_CONFERBOT_BOT_ID=YOUR_CONFERBOT_BOT_ID
```

The `VITE_` prefix makes a variable accessible to browser-side code. Use it only for public configuration values, never private API keys.

### 5. Configure production access

After the frontend has been deployed:

1. Set the backend's allowed frontend origins to the exact production frontend URL if CORS configuration is implemented.
2. Update the frontend API URL to point to the deployed backend.
3. Redeploy the frontend and restart the backend if necessary.
4. Open the public website and test its functionality.

### 6. Configure persistent storage

If Neko uses SQLite to store accounts, watchlists, or chat history, ensure the database is stored on persistent storage.

A database saved on an ephemeral filesystem may be lost during restarts or redeployments.

Persistent disks require an eligible paid Render service. For larger deployments, consider a managed PostgreSQL database and a tested migration.

Review `render.yaml` before deployment to confirm that its service configuration, disk path, environment variables, and commands match your current code.

## 🔐 Authentication and User Data

The project documentation describes the following authentication features:

- Email/password registration and login.
- Password hashing rather than plain-text password storage.
- Email verification for newly registered accounts.
- Password-reset flows.
- Expiring and revocable bearer sessions.
- Separate watchlists and chat histories for individual accounts.
- Profile management and account deletion.

Existing accounts created with an older local database may be handled differently depending on the backend's migration logic.

For production use, verify that the implemented authentication flows work as intended and that users cannot access another user's private data.

### Local email verification

During local development, verification and password-reset links may be printed in the backend terminal if the application uses this development fallback.

This is not real email delivery. Configure an email provider before relying on email verification and password resets in production.

## 🔑 Environment Variables

The exact variables depend on the current code. Potential settings include:

### Backend

- `NEKO_DB_PATH` — SQLite database location, if supported.
- `ALLOW_ORIGINS` — permitted frontend origins, if supported.
- AI provider credentials required by the current integration.

### Frontend

- `VITE_API_BASE` — public backend API URL, if used.
- `VITE_CONFERBOT_BOT_ID` — public Conferbot widget ID, if enabled.

Use `.env.example` to document required configuration without including real credentials.

Never commit private API keys, session secrets, database files containing user data, or real `.env` files.

## 🧪 Testing Checklist

Before publishing Neko publicly, verify the following:

- [ ] The frontend builds successfully.
- [ ] The backend starts and responds correctly.
- [ ] Anime search returns relevant titles.
- [ ] Anime details load correctly from AniList.
- [ ] The chatbot opens and responds as expected.
- [ ] Anime recommendations match the user's requested genres.
- [ ] Seasonal anime and episode information use a working live data source where required.
- [ ] Registration, verification, login, logout, and password reset work.
- [ ] Different accounts have separate watchlists and chat histories.
- [ ] Profile changes and account deletion work correctly.
- [ ] Frontend API requests reach the deployed backend.
- [ ] CORS permits only the intended production origins.
- [ ] Private credentials are not exposed in frontend code or GitHub.
- [ ] Database persistence and backups are configured.
- [ ] The production website works on desktop and mobile.

## ⚠️ Limitations

- AniList data may be incomplete for some titles.
- AI-generated answers can be inaccurate.
- Current seasonal anime and episode schedules require a working live data integration.
- Chatbot personality instructions alone do not provide live anime data.
- Features described in this README should be verified against the current implementation before a public release.
- A public deployment should include appropriate security controls, privacy information, and a tested recovery process.

## 🔒 Security Recommendations

Before a larger public launch, consider adding or verifying:

- Login and API rate limiting.
- Abuse protection and input validation.
- Secure production session handling over HTTPS.
- Email verification and password-reset delivery.
- Privacy policy and terms of service.
- Account-data export and deletion.
- Database backups and recovery testing.
- Monitoring and error reporting.
- A managed database if the application grows.

## 📄 License

No open-source license has been selected in this README.

Unless a license is added to the repository, the project remains subject to its default copyright protections. Add a license file if you decide to permit others to reuse or distribute the code.

---

Made with 💜 for anime fans — **Neko**
