# CloudVault API reference

Base URL (development): `http://127.0.0.1:5000`. All endpoints live under `/api`. Bodies are JSON unless noted (uploads use `multipart/form-data`).

## Conventions

- **Auth**: send `Authorization: Bearer <access_token>`. Obtain tokens from `POST /api/auth/login`; renew with `POST /api/auth/refresh` (send the *refresh* token). `POST /api/auth/logout` revokes the session immediately.
- **Errors**: every error is JSON `{ "error": "human readable message", ...extra }` with a meaningful status: `400` validation, `401` unauthenticated, `403` forbidden, `404` not found *(also used when you have no access, so existence is not revealed)*, `409` conflict (e.g. `code: "duplicate"`), `410` expired link, `413` too large / `code: "quota_exceeded"`, `415` unsupported type or content mismatch, `422` malware detected, `429` rate limited.
- **Permission levels** on files/folders: `owner` > `editor` > `viewer`. Admins do **not** get implicit access to file contents.
- **Rate limits** (per IP): global 200/min, login 10/min, register 10/hour, uploads 120/min, share unlock 10/min, forgot-password 5/hour.

## Key flows

```http
POST /api/auth/login
{"identifier":"alice@example.com","password":"Alice@12345"}
-> {"access_token":"...","refresh_token":"...","user":{...}}
```

```http
POST /api/files/upload            (multipart: file, folder_id?, allow_duplicate?)
-> 201 {"file":{"id":12,"name":"report.pdf","size":48213,...}}
-> 409 {"error":"An identical file already exists: ...","code":"duplicate"}   (retry with allow_duplicate=true)
```

```http
POST /api/shares
{"file_id":12,"is_public":true,"password":"secret123","expires_in_hours":24,"allow_download":false}
-> 201 {"share":{"url":"http://localhost:5173/s/<token>",...}}

POST /api/public/<token>/unlock   {"password":"secret123"}   -> {"access":"<15 min signed token>"}
GET  /api/public/<token>/download?access=<token>
```

## Endpoints

### Activity

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/activity` | User | My activity |

### Administration

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/admin/config` | Admin | Get config |
| PUT | `/api/admin/config` | Super Admin | Put config |
| GET | `/api/admin/logs` | Admin | Logs |
| GET | `/api/admin/stats` | Admin | Stats |
| GET | `/api/admin/storage` | Admin | Storage overview |
| POST | `/api/admin/storage/cleanup-trash` | Admin | Run trash cleanup |
| GET | `/api/admin/suspicious` | Admin | Suspicious |
| GET | `/api/admin/tickets` | Admin | Tickets |
| PUT | `/api/admin/tickets/{tid}` | Admin | Update ticket |
| GET | `/api/admin/users` | Admin | Users |
| POST | `/api/admin/users` | Admin | Create user |
| DELETE | `/api/admin/users/{uid}` | Super Admin | Delete user |
| PUT | `/api/admin/users/{uid}` | Admin | Update user |

### Authentication & profile

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/auth/change-password` | User | Change password |
| POST | `/api/auth/forgot-password` | Public | Forgot password |
| POST | `/api/auth/login` | Public | Login |
| GET | `/api/auth/login-history` | User | Login history |
| POST | `/api/auth/logout` | User | Logout |
| GET | `/api/auth/me` | User | Me |
| PUT | `/api/auth/me` | User | Update me |
| DELETE | `/api/auth/me/avatar` | User | Delete avatar |
| POST | `/api/auth/me/avatar` | User | Upload avatar |
| POST | `/api/auth/refresh` | User | Refresh |
| POST | `/api/auth/register` | Public | Register |
| POST | `/api/auth/resend-verification` | User | Resend verification |
| POST | `/api/auth/reset-password` | Public | Reset password |
| POST | `/api/auth/verify-email` | Public | Verify email |

### Collaboration

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/collab/activity` | User | Collaboration activity: others acting on my resources, and my actions inside others' workspaces. |
| GET | `/api/collab/invitations` | User | Invitations |
| POST | `/api/collab/invitations/{cid}/respond` | User | Respond |
| POST | `/api/collab/invite` | User | Invite |
| GET | `/api/collab/item` | User | For item |
| GET | `/api/collab/workspace` | User | Shared workspace: every folder/file shared with me (accepted) plus items I share with others. |
| DELETE | `/api/collab/{cid}` | User | Remove |
| PUT | `/api/collab/{cid}` | User | Update |

### Dashboard

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/dashboard` | User | Dashboard |

### Favorites

| Method | Path | Access | Description |
|---|---|---|---|
| DELETE | `/api/favorites` | User | Remove favorite |
| GET | `/api/favorites` | User | Favorites |
| POST | `/api/favorites` | User | Add favorite |

### Files & versions

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/files/recent` | User | Recent files |
| POST | `/api/files/upload` | User | Upload |
| DELETE | `/api/files/{fid}` | User | Delete |
| GET | `/api/files/{fid}` | User | Details |
| PUT | `/api/files/{fid}` | User | Rename |
| POST | `/api/files/{fid}/copy` | User | Copy |
| GET | `/api/files/{fid}/download` | User | Download |
| POST | `/api/files/{fid}/move` | User | Move |
| GET | `/api/files/{fid}/preview` | User | Preview |
| GET | `/api/files/{fid}/text` | User | Text preview |
| GET | `/api/files/{fid}/versions` | User | Versions |
| POST | `/api/files/{fid}/versions` | User | New version |
| GET | `/api/files/{fid}/versions/compare` | User | Version compare |
| DELETE | `/api/files/{fid}/versions/{n}` | User | Version delete |
| GET | `/api/files/{fid}/versions/{n}/download` | User | Version download |
| GET | `/api/files/{fid}/versions/{n}/preview` | User | Version preview |
| POST | `/api/files/{fid}/versions/{n}/restore` | User | Version restore |

### Folders

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/folders` | User | Create |
| GET | `/api/folders/all` | User | My Folders page: every folder with item counts, size and its path. |
| GET | `/api/folders/contents` | User | Contents of a folder (or the user's root). Works for owners and accepted collaborators. |
| GET | `/api/folders/tree` | User | Flat list of the user's own live folders (used by Move/Copy pickers). |
| DELETE | `/api/folders/{fid}` | User | Delete |
| GET | `/api/folders/{fid}` | User | Details |
| PUT | `/api/folders/{fid}` | User | Rename |
| POST | `/api/folders/{fid}/move` | User | Move |

### Health

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Health |

### Notifications

| Method | Path | Access | Description |
|---|---|---|---|
| DELETE | `/api/notifications` | User | Clear notifications |
| GET | `/api/notifications` | User | Notifications |
| POST | `/api/notifications/read-all` | User | Mark all read |
| GET | `/api/notifications/unread-count` | User | Unread count |
| DELETE | `/api/notifications/{nid}` | User | Delete notification |
| POST | `/api/notifications/{nid}/read` | User | Mark read |

### Public stats

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/public-stats` | Public | Public stats |

### Public share access

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/public/{token}` | Public (login if private) | Info |
| GET | `/api/public/{token}/contents` | Share access token | Contents |
| GET | `/api/public/{token}/download` | Share access token | Download |
| GET | `/api/public/{token}/preview` | Share access token | Preview |
| POST | `/api/public/{token}/unlock` | Public | Unlock |

### Search

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/search` | User | Search |
| DELETE | `/api/search/recent` | User | Clear recent searches |
| GET | `/api/search/recent` | User | Recent searches |

### Sharing (owner side)

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/shares` | User | Create |
| GET | `/api/shares/activity` | User | All activity |
| GET | `/api/shares/by-me` | User | By me |
| GET | `/api/shares/item` | User | For item |
| GET | `/api/shares/with-me` | User | With me |
| DELETE | `/api/shares/{sid}` | User | Revoke |
| PUT | `/api/shares/{sid}` | User | Update |
| GET | `/api/shares/{sid}/activity` | User | Activity |

### Storage analytics

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/storage/analytics` | User | Storage analytics |

### Support

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/support` | User | My tickets |
| POST | `/api/support` | User | Support |

### Trash

| Method | Path | Access | Description |
|---|---|---|---|
| DELETE | `/api/trash` | User | Empty |
| GET | `/api/trash` | User | List trash |
| POST | `/api/trash/restore` | User | Restore |
| DELETE | `/api/trash/{tid}` | User | Permanent delete |

### Upload history

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/uploads/history` | User | Upload history |
| POST | `/api/uploads/log` | User | Lets the browser record uploads the user cancelled (the server never saw a finished request). |

### Users

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/users/{uid}/avatar` | User | Avatar |
