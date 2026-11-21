# Testing guide

## Backend (pytest)
```bash
cd backend
.venv\Scripts\activate   # or: source .venv/bin/activate
pytest -v                # all tests
pytest tests/test_security.py -v
```
Each test gets a fresh SQLite file and storage folder in a temp directory - your development data is never touched. Rate limiting is disabled in `TestConfig`.

| File | Covers |
|---|---|
| `test_auth.py` | register/login/logout, validation, duplicates, login history, email verification, forgot/reset/change password, role guards |
| `test_files.py` | upload+download round trip, multi-upload, duplicate detection, name collisions, extension/content/size validation, folders (nesting, breadcrumbs, rename, move, copy), trash restore/purge/auto-cleanup, favorites, search, dashboard, text preview |
| `test_permissions.py` | cross-user isolation (404s), admins cannot read content, collaborator viewer/editor lifecycle, collaborator-role restrictions |
| `test_sharing.py` | public links + temporary tokens, passwords, view-only, expiry/revocation, private (user-list) shares, token binding, notifications, folder shares |
| `test_versions_quota.py` | version history/restore/compare/prune, quota enforcement + warnings, analytics |
| `test_security.py` | path traversal, hostile filenames, no path leakage, SQL-injection inertness, HTML/SVG refused, headers, privilege escalation, malware-scan hook, avatar validation, admin user management |

## Frontend (Vitest + Testing Library)
```bash
cd frontend
npm test
```
Covers utilities, UI primitives (StorageBar, dialogs, context menu, empty state), route guards and the Login page.

## Manual smoke test (5 minutes)
1. `python seed.py`, start both servers, sign in as `alice@example.com`.
2. Upload 3 files at once, cancel one, re-upload a duplicate -> "Upload anyway" appears.
3. Preview an image, a PDF and a text file; download one and compare the bytes.
4. Share a file with a password + 1h expiry; open the link in a private window; wrong password then right password; check *Shared by me -> Access activity*.
5. Upload a new version, compare, restore.
6. Delete a folder, restore it from Trash; empty the trash and watch storage drop on *Storage*.
7. As admin: lower alice's quota to 1 MB, then try a bigger upload as alice -> quota error + warning notification.
