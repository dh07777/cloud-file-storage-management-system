# CloudVault - Secure Cloud File Storage

A full-stack file management platform: upload, organise, preview, search, share, version and collaborate on files, with an admin console. **React + Tailwind** frontend, **Flask + SQLAlchemy + SQLite** backend, pluggable storage (local disk, optional S3-compatible).

> Metadata lives in SQLite; **file contents never do** - blobs are stored on disk (or S3) under random server-generated ids.

---

## 1. Quick start in VS Code (step by step)

### Prerequisites
| Tool | Version | Check |
|---|---|---|
| Python | 3.11 or newer | `python --version` (Windows) / `python3 --version` |
| Node.js | 18 or newer (20 LTS recommended) | `node --version` |
| VS Code | any | with the *Python* extension (optional but handy) |

### Step 1 - Unzip and open the project
1. Unzip `cloudvault.zip`.
2. VS Code -> **File -> Open Folder...** -> choose the `cloudvault` folder.
3. Open the integrated terminal: **Terminal -> New Terminal** (`` Ctrl+` ``).
   You will use **two terminals**: one for the backend, one for the frontend (use the **+** / split button in the terminal panel).

### Step 2 - Backend (terminal 1)
```bash
cd backend

# create + activate a virtual environment
python -m venv .venv            # macOS/Linux: python3 -m venv .venv
.venv\Scripts\activate          # Windows (PowerShell/cmd)
source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt

# configuration (defaults work as-is for development)
copy .env.example .env          # Windows      |   cp .env.example .env   (macOS/Linux)

# create the SQLite database, roles, demo users, folders and files
python seed.py

# start the API on http://127.0.0.1:5000
python run.py
```
Leave this terminal running. Verify: open <http://127.0.0.1:5000/api/health> -> `{"status":"ok"}`.

> **PowerShell blocks `activate`?** Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `cmd`.
> **Select the interpreter in VS Code:** `Ctrl+Shift+P` -> *Python: Select Interpreter* -> `backend/.venv`.

### Step 3 - Frontend (terminal 2)
```bash
cd frontend
npm install
npm run dev
```
Open **<http://localhost:5173>**. Vite proxies `/api` to Flask, so no CORS setup is needed in development.

### Step 4 - Sign in with a demo account
| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@cloudvault.local` | `Admin@12345` |
| Administrator | `manager@cloudvault.local` | `Manager@12345` |
| Regular User (sample data) | `alice@example.com` | `Alice@12345` |
| Regular User | `bob@example.com` | `Bob@12345` |
| Shared Collaborator | `carol@example.com` | `Carol@12345` |

Registration emails (verify / reset) are written to `backend/instance/outbox.log` when SMTP is not configured, and the links are also returned in the UI while `DEV_EXPOSE_TOKENS=true`.

### Step 5 - Try the main flows (2-minute tour)
1. **alice** -> *My Files*: drag files in, watch the progress panel, cancel one mid-upload, upload the same file twice (duplicate detection).
2. Open a file's **... menu** -> Share link -> password + expiry -> open the link in a private window.
3. *Version history* of `project-brief.txt`: compare v1 and v3, restore v1.
4. Invite **bob** as *Editor* to a folder (menu -> Collaborators), sign in as bob, accept under *Shared with me*, upload into it.
5. Delete a folder -> *Trash* -> restore it.
6. Sign in as **admin** -> *Admin dashboard*, *User management* (quotas, suspend), *Activity logs*, *Suspicious activity* (fail a login 5 times to see an alert).

### Run the tests
```bash
cd backend && pytest                 # 49 backend tests (auth, uploads, permissions, sharing, versions, quota, security)
cd frontend && npm test              # component + route-guard tests (Vitest)
```
See `docs/TESTING.md`.

---

## 2. Project layout
```
cloudvault/
|-- backend/
|   |-- app/
|   |   |-- __init__.py        app factory, error handlers, security headers, CLI, trash cleaner
|   |   |-- models.py          all 22 tables (users, roles, files, folders, file_versions, file_shares, ...)
|   |   |-- storage.py         storage abstraction: LocalStorage + S3Storage
|   |   |-- permissions.py     owner / editor / viewer resolution (folder inheritance)
|   |   |-- services.py        upload pipeline, versions, trash, purge, cleanup
|   |   |-- utils.py           validation, quota accounting, malware-scan hook, email, auth decorators
|   |   `-- routes/            auth, files, folders, trash, shares(+public), collab, misc, admin
|   |-- tests/                 pytest suite
|   |-- config.py  seed.py  run.py  wsgi.py  requirements.txt  .env.example
|-- frontend/
|   |-- src/
|   |   |-- pages/             all 24 pages (+ search, reset/verify, public share)
|   |   |-- components/        Layout, FileBrowser, UploadManager, Preview, Share/Collab modals, ui kit
|   |   |-- context/           Auth, Theme, Toast
|   |   `-- __tests__/
|   `-- package.json  vite.config.js  tailwind.config.js
`-- docs/                      API.md  DEPLOYMENT.md  TESTING.md
```

## 3. Feature coverage
| Area | Implemented |
|---|---|
| **Auth** | Register, login/logout (revocable JWT sessions + refresh), forgot/reset password, email verification, profile + avatar (re-encoded with Pillow), change password, login history, protected + admin routes |
| **Roles** | Super Admin, Administrator, Regular User, Shared Collaborator (see matrix below) |
| **Upload** | Single/multiple, drag & drop, per-file progress, cancel, size + type + content (magic-byte) validation, duplicate detection (SHA-256), status panel, upload history |
| **Organise** | Nested folders, breadcrumbs, rename, move, copy, grid/list, context menus, trash, restore, permanent delete, automatic trash cleanup (hourly thread or `flask cleanup-trash` cron) |
| **Preview** | Image, PDF, text/code, video + audio (duration/dimensions read in-browser), file details page |
| **Sharing** | Unguessable tokens, public/private (specific users), password, expiry, view-only vs download, revoke, access log, temporary signed access tokens (15 min), folder shares |
| **Search** | Name, extension, type, date range, size range, sorting, recent searches |
| **Favorites** | Files + folders, favorites page, dashboard counter |
| **Storage** | Per-user quotas, live usage, warnings at 80/90/100 %, large-file finder, analytics charts, cleanup suggestions (trash, old versions, duplicates, stale files) |
| **Versions** | New version upload, history, preview/download any version, restore (non-destructive), compare metadata, retention limit |
| **Collaboration** | Invite by email, viewer/editor, accept/decline, shared workspace, collaboration activity feed |
| **Notifications** | Upload, share, download, storage warning, share-link access, invitations, deletions - with unread badge |
| **Admin** | Live stats + charts, user CRUD, role changes, quotas, suspend, delete, activity logs, suspicious-activity detection, support tickets, platform configuration |
| **UI/UX** | Responsive sidebar layout, dark/light/system themes, toasts, skeleton loaders, empty states, confirm dialogs, keyboard + ARIA support |

### Role / permission matrix
| Capability | Collaborator | User | Administrator | Super Admin |
|---|:-:|:-:|:-:|:-:|
| Own files, folders, trash, favorites | yes (100 MB default quota) | yes | yes | yes |
| Work in folders shared with them (viewer/editor) | yes | yes | yes | yes |
| Create share links | no | yes | yes | yes |
| Invite collaborators | yes | yes | yes | yes |
| View dashboards of the whole platform, manage users/quotas, logs | no | no | yes (not admins) | yes |
| Create/modify administrators, delete users, change platform config | no | no | no | yes |
| Read other users' file contents | no | no | **no** | **no** |

## 4. Security design
- **Passwords**: Werkzeug scrypt hashes; policy enforced server-side; reset/verify tokens are stored only as SHA-256 hashes and expire.
- **Sessions**: short-lived access JWT + refresh token; every session is recorded and can be revoked (logout, suspension, password reset).
- **Authorization on every request**: ownership / collaboration level checked in `permissions.py` before any read, download, preview, move or delete. No access -> `404` (no existence leak).
- **Storage**: blobs are keyed by `uuid4().hex`; the key regex + realpath check blocks traversal; internal paths/keys are never returned by the API; there is **no static route** to the storage folder; downloads go through authenticated endpoints with `nosniff` + restrictive CSP headers.
- **Uploads**: extension allow-list (executables, HTML, SVG always refused), content signature must match extension, size limit enforced while streaming, quota check, SHA-256, **malware-scan hook** (`utils.scan_file`, ClamAV `clamd` supported via `CLAMAV_ENABLED=true`).
- **Share links**: 256-bit random tokens, optional password (hashed) and expiry, revocation, per-access logging, rate-limited unlock, and short-lived **signed access tokens** bound to the share (separate from login JWTs).
- **Other**: rate limiting (Flask-Limiter), SQLAlchemy ORM only (no string-built SQL), React escaping + no `dangerouslySetInnerHTML`, text previews returned as JSON, security headers + HSTS in production, CORS allow-list. **CSRF**: tokens travel in the `Authorization` header (never cookies), so cross-site request forgery does not apply.

## 5. Configuration
All backend settings are in `backend/.env` (see `.env.example`). Runtime limits (max upload size, default quotas, trash retention, versions kept, allowed extensions, registration on/off) are editable by the Super Admin in **Storage management -> Platform configuration**.

## 6. Production
See `docs/DEPLOYMENT.md` (Gunicorn/Waitress + nginx + HTTPS, S3 storage, backups, cron cleanup).

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| `ModuleNotFoundError` when running Python | Activate the venv and run `pip install -r requirements.txt` |
| Frontend shows network errors | Backend must be running on port 5000 (`python run.py`) |
| Port 5000 busy (macOS AirPlay) | Change the port in `backend/run.py` and the proxy `target` in `frontend/vite.config.js` |
| `npm install` fails | Use Node 18+; delete `node_modules` and retry |
| Want a clean database | Stop the server, delete `backend/instance/cloudvault.db*` and `backend/storage_data/`, run `python seed.py` again |
| Upload rejected | Check the allowed extensions / size limit in the admin configuration |

## 8. Honest notes
- SQLite is single-writer: perfect for a demo/portfolio/small team; move to a server DB (change `DATABASE_URL`) for heavy concurrent writes.
- Schema is created with `db.create_all()` by `seed.py`. Flask-Migrate is wired in; to start tracking migrations run `flask --app run db init && flask --app run db migrate && flask --app run db upgrade`.
- The auto-cleanup thread is per-process; with several Gunicorn workers prefer the cron command in the deployment guide.
