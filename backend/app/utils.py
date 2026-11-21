import hashlib
import json
import logging
import mimetypes
import re
import secrets
import smtplib
import socket
import struct
from email.message import EmailMessage
from functools import wraps

from flask import Response, current_app, g, request, send_file, stream_with_context
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from sqlalchemy import func
from werkzeug.utils import secure_filename

from .errors import ApiError
from .extensions import db
from .models import (ActivityLog, File, FileVersion, Folder, Notification, Setting, StorageQuota, StorageUsage,
                     User, utcnow)
from .storage import get_storage

log = logging.getLogger("cloudvault")
MB = 1024 * 1024
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")


# ---------------------------------------------------------------- settings
def get_setting(key):
    row = db.session.get(Setting, key)
    if row is not None:
        try:
            return json.loads(row.value)
        except ValueError:
            pass
    return current_app.config["DEFAULT_SETTINGS"].get(key)


def set_setting(key, value):
    row = db.session.get(Setting, key)
    if row is None:
        row = Setting(key=key)
        db.session.add(row)
    row.value = json.dumps(value)


def allowed_extensions():
    return {e.strip().lower() for e in str(get_setting("allowed_extensions")).split(",") if e.strip()}


# ---------------------------------------------------------------- auth helpers
def hash_token(t):
    return hashlib.sha256(t.encode()).hexdigest()


def validate_password(pw):
    if len(pw) < 8 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ApiError(400, "Password must be at least 8 characters and contain letters and numbers")


def client_ip():
    return request.remote_addr or ""


def auth_required(fn):
    @wraps(fn)
    def wrapper(*a, **k):
        verify_jwt_in_request()
        user = db.session.get(User, int(get_jwt_identity()))
        if not user or not user.is_active:
            raise ApiError(401, "Account unavailable")
        g.user = user
        now = utcnow()
        if not user.last_seen_at or (now - user.last_seen_at).total_seconds() > 60:
            user.last_seen_at = now
            db.session.commit()
        return fn(*a, **k)
    return wrapper


def roles_required(*roles):
    def deco(fn):
        @wraps(fn)
        @auth_required
        def wrapper(*a, **k):
            if g.user.role.name not in roles:
                raise ApiError(403, "You do not have permission to perform this action")
            return fn(*a, **k)
        return wrapper
    return deco


def optional_user():
    try:
        verify_jwt_in_request(optional=True)
        uid = get_jwt_identity()
        return db.session.get(User, int(uid)) if uid else None
    except Exception:
        return None


# ---------------------------------------------------------------- logging / notifications
def log_activity(action, target_type=None, target_id=None, target_name=None, details=None, user=None, owner_id=None):
    user = user or getattr(g, "user", None)
    db.session.add(ActivityLog(
        user_id=user.id if user else None, scope_owner_id=owner_id or (user.id if user else None),
        action=action, target_type=target_type, target_id=target_id, target_name=target_name,
        details=json.dumps(details) if details else None, ip=client_ip()))


def notify(user_id, ntype, title, message="", link=None):
    db.session.add(Notification(user_id=user_id, type=ntype, title=title, message=message[:500], link=link))


def send_email(to, subject, body):
    cfg = current_app.config
    if not cfg["MAIL_SERVER"]:
        import os
        line = f"--- TO: {to} | SUBJECT: {subject}\n{body}\n\n"
        log.info("EMAIL (no SMTP configured)\n%s", line)
        try:
            with open(os.path.join(current_app.instance_path, "outbox.log"), "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            pass
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = cfg["MAIL_FROM"], to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=15) as s:
            if cfg["MAIL_USE_TLS"]:
                s.starttls()
            if cfg["MAIL_USERNAME"]:
                s.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
            s.send_message(msg)
    except Exception:
        log.exception("Failed to send email to %s", to)


# ---------------------------------------------------------------- storage accounting
def get_quota_bytes(user_id):
    q = StorageQuota.query.filter_by(user_id=user_id).first()
    if q:
        return q.quota_bytes
    user = db.session.get(User, user_id)
    key = "collaborator_quota_mb" if user and user.role.name == "collaborator" else "default_quota_mb"
    return int(get_setting(key)) * MB


def recompute_usage(user_id):
    used = (db.session.query(func.coalesce(func.sum(FileVersion.size), 0))
            .join(File, File.id == FileVersion.file_id).filter(File.owner_id == user_id).scalar()) or 0
    su = StorageUsage.query.filter_by(user_id=user_id).first()
    if not su:
        su = StorageUsage(user_id=user_id)
        db.session.add(su)
    su.used_bytes = int(used)
    su.file_count = File.query.filter_by(owner_id=user_id, is_deleted=False).count()
    su.folder_count = Folder.query.filter_by(owner_id=user_id, is_deleted=False).count()
    quota = get_quota_bytes(user_id)
    pct = (used / quota * 100) if quota else 0
    level = 100 if pct >= 100 else 90 if pct >= 90 else 80 if pct >= 80 else 0
    if level > (su.warned_level or 0):
        notify(user_id, "storage_warning", "Storage limit warning",
               f"You have used {pct:.0f}% of your storage quota.", "/app/storage")
    su.warned_level = level
    return su


def usage_for(user_id):
    su = StorageUsage.query.filter_by(user_id=user_id).first() or recompute_usage(user_id)
    quota = get_quota_bytes(user_id)
    return {"used": su.used_bytes, "quota": quota, "available": max(quota - su.used_bytes, 0),
            "percent": round(su.used_bytes / quota * 100, 1) if quota else 0,
            "file_count": su.file_count, "folder_count": su.folder_count}


# ---------------------------------------------------------------- file validation
SIGNATURES = {
    "png": [b"\x89PNG\r\n\x1a\n"], "jpg": [b"\xff\xd8\xff"], "jpeg": [b"\xff\xd8\xff"], "gif": [b"GIF87a", b"GIF89a"],
    "pdf": [b"%PDF"], "bmp": [b"BM"],
    "zip": [b"PK\x03\x04", b"PK\x05\x06"], "docx": [b"PK\x03\x04"], "xlsx": [b"PK\x03\x04"],
    "pptx": [b"PK\x03\x04"], "odt": [b"PK\x03\x04"], "ods": [b"PK\x03\x04"], "odp": [b"PK\x03\x04"],
    "gz": [b"\x1f\x8b"], "7z": [b"7z\xbc\xaf\x27\x1c"], "rar": [b"Rar!"],
    "doc": [b"\xd0\xcf\x11\xe0"], "xls": [b"\xd0\xcf\x11\xe0"], "ppt": [b"\xd0\xcf\x11\xe0"],
    "ogg": [b"OggS"], "flac": [b"fLaC"], "webm": [b"\x1a\x45\xdf\xa3"], "mkv": [b"\x1a\x45\xdf\xa3"],
}
TEXT_EXTS = {"txt", "md", "csv", "json", "xml", "log", "rtf", "py", "js", "jsx", "ts", "css", "java", "c", "cpp",
             "sql", "yml", "yaml", "ini"}


def validate_content(ext, head):
    """MIME / magic-byte validation: the content must match the claimed extension."""
    if ext in SIGNATURES and not any(head.startswith(s) for s in SIGNATURES[ext]):
        raise ApiError(415, f"File content does not match the .{ext} extension")
    if ext == "webp" and not (head[:4] == b"RIFF" and head[8:12] == b"WEBP"):
        raise ApiError(415, "File content does not match the .webp extension")
    if ext in ("wav", "avi") and head[:4] != b"RIFF":
        raise ApiError(415, f"File content does not match the .{ext} extension")
    if ext in ("mp4", "mov", "m4a") and head[4:8] != b"ftyp" and ext != "mov":
        raise ApiError(415, f"File content does not match the .{ext} extension")
    if ext == "mp3" and not (head.startswith(b"ID3") or head[:1] == b"\xff"):
        raise ApiError(415, "File content does not match the .mp3 extension")
    if ext in TEXT_EXTS and b"\x00" in head:
        raise ApiError(415, f"File content does not look like a text file (.{ext})")


_BAD_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"|?*\\/]')


def clean_filename(raw):
    """Display-name sanitiser. Stored blobs are addressed by random ids, so the name is never used as a path;
    we still strip directory parts, control characters and reserved characters."""
    raw = (raw or "").replace("\\", "/").split("/")[-1]
    name = _BAD_CHARS.sub("", raw).strip().lstrip(".").strip()
    name = re.sub(r"\s+", " ", name)
    if not name:
        ext = raw.rsplit(".", 1)[-1].lower() if "." in raw else ""
        name = f"file.{ext}" if re.fullmatch(r"[a-z0-9]{1,8}", ext or "") else "file"
    if len(name) > 200:
        base, dot, ext = name.rpartition(".")
        name = (base[: 200 - len(ext) - 1] + "." + ext) if dot and len(ext) < 20 else name[:200]
    return name


def guess_mime(name):
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


def category_for(mime, ext):
    mime = mime or ""
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    if ext in ("zip", "gz", "tar", "7z", "rar"):
        return "archive"
    if ext in ("py", "js", "jsx", "ts", "css", "java", "c", "cpp", "sql", "yml", "yaml", "ini", "xml", "json"):
        return "code"
    if ext in ("pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "txt", "md", "csv", "rtf", "log"):
        return "document"
    return "other"


def scan_file(key):
    """Malware scanning integration point. Returns (clean: bool, message).
    With CLAMAV_ENABLED=true the blob is streamed to a clamd daemon (INSTREAM). Replace/extend as needed."""
    cfg = current_app.config
    if not cfg["CLAMAV_ENABLED"]:
        return True, "scan skipped"
    try:
        with socket.create_connection((cfg["CLAMAV_HOST"], cfg["CLAMAV_PORT"]), timeout=15) as s:
            s.sendall(b"zINSTREAM\0")
            with get_storage().open(key) as f:
                while True:
                    chunk = f.read(8192)
                    if not chunk:
                        break
                    s.sendall(struct.pack("!I", len(chunk)) + chunk)
            s.sendall(struct.pack("!I", 0))
            reply = s.recv(4096).decode(errors="ignore")
        return ("FOUND" not in reply), reply.strip()
    except Exception as e:  # fail closed
        log.exception("ClamAV scan failed")
        return False, f"scanner unavailable: {e}"


INLINE_MIME_PREFIXES = ("image/", "audio/", "video/")


def inline_safe(mime):
    if not mime or mime == "image/svg+xml":
        return False
    return mime.startswith(INLINE_MIME_PREFIXES) or mime in ("application/pdf", "text/plain")


def send_stored(key, mimetype, filename, as_attachment=True):
    st = get_storage()
    path = st.local_path(key)
    if path:
        resp = send_file(path, mimetype=mimetype, as_attachment=as_attachment, download_name=filename,
                         conditional=True, max_age=0)
    else:
        body = st.open(key)

        def gen():
            for chunk in iter(lambda: body.read(1024 * 1024), b""):
                yield chunk
        resp = Response(stream_with_context(gen()), mimetype=mimetype)
        disp = "attachment" if as_attachment else "inline"
        resp.headers["Content-Disposition"] = f'{disp}; filename="{secure_filename(filename) or "file"}"'
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


def unique_name(model, owner_id, parent_col, parent_id, name, exclude_id=None):
    """Return `name` or `name (n).ext` so that it is unique among live siblings."""
    base, dot, ext = name.rpartition(".") if (model is File and "." in name) else (name, "", "")
    candidate, n = name, 0
    while True:
        q = model.query.filter(model.owner_id == owner_id, model.is_deleted.is_(False),
                               func.lower(model.name) == candidate.lower())
        q = q.filter(parent_col.is_(None)) if parent_id is None else q.filter(parent_col == parent_id)
        if exclude_id:
            q = q.filter(model.id != exclude_id)
        if not q.first():
            return candidate
        n += 1
        candidate = f"{base} ({n}).{ext}" if dot else f"{name} ({n})"


def new_share_token():
    return secrets.token_urlsafe(32)
