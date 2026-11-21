from datetime import timedelta

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import func, or_

from ..errors import ApiError
from ..extensions import db
from ..models import (ActivityLog, Collaborator, DownloadLog, Favorite, File, FileShare, FileVersion, Folder,
                      Notification, RecentSearch, Role, StorageQuota, StorageUsage, SupportTicket, Trash,
                      UploadLog, User, UserSession, ShareAccess, SharePermission, iso, utcnow)
from ..services import cleanup_expired_trash, delete_share, purge_file
from ..storage import get_storage
from ..utils import (EMAIL_RE, MB, USERNAME_RE, allowed_extensions, auth_required, category_for, get_quota_bytes,
                     get_setting, log_activity, recompute_usage, roles_required, set_setting, validate_password,
                     usage_for)

bp = Blueprint("admin", __name__, url_prefix="/api/admin")
ADMINS = ("admin", "super_admin")


def _user_row(u):
    usage = usage_for(u.id)
    d = u.to_dict()
    d.update({"used_bytes": usage["used"], "quota_bytes": usage["quota"], "file_count": usage["file_count"],
              "percent": usage["percent"], "last_seen_at": iso(u.last_seen_at)})
    return d


@bp.get("/stats")
@roles_required(*ADMINS)
def stats():
    now = utcnow()
    used = db.session.query(func.coalesce(func.sum(FileVersion.size), 0)).scalar()
    quota_total = db.session.query(func.coalesce(func.sum(StorageQuota.quota_bytes), 0)).scalar()
    active_now = User.query.filter(User.last_seen_at >= now - timedelta(minutes=15)).count()
    active_day = User.query.filter(User.last_seen_at >= now - timedelta(hours=24)).count()
    by_user = (db.session.query(User.username, func.coalesce(func.sum(FileVersion.size), 0).label("b"))
               .join(File, File.owner_id == User.id).join(FileVersion, FileVersion.file_id == File.id)
               .group_by(User.id).order_by(func.sum(FileVersion.size).desc()).limit(8).all())
    cats = {}
    for f in File.query.filter_by(is_deleted=False).with_entities(File.mime, File.ext, File.size).all():
        c = category_for(f.mime, f.ext)
        cats[c] = cats.get(c, 0) + f.size
    since = now - timedelta(days=13)
    per_day = {}
    for ul in UploadLog.query.filter(UploadLog.status == "completed", UploadLog.created_at >= since).all():
        k = ul.created_at.strftime("%Y-%m-%d")
        per_day[k] = per_day.get(k, 0) + 1
    timeline = [{"date": (since + timedelta(days=i)).strftime("%Y-%m-%d"),
                 "uploads": per_day.get((since + timedelta(days=i)).strftime("%Y-%m-%d"), 0)} for i in range(14)]
    recent = UploadLog.query.filter_by(status="completed").order_by(UploadLog.created_at.desc()).limit(8).all()
    names = {u.id: u.username for u in User.query.filter(User.id.in_([r.user_id for r in recent] or [0]))}
    roles = {r: c for r, c in db.session.query(Role.name, func.count(User.id)).join(User).group_by(Role.name)}
    return jsonify({
        "total_users": User.query.count(), "active_users_now": active_now, "active_users_24h": active_day,
        "suspended_users": User.query.filter_by(is_active=False).count(),
        "total_files": File.query.filter_by(is_deleted=False).count(), "total_folders": Folder.query.filter_by(is_deleted=False).count(),
        "total_storage_used": int(used), "total_quota_allocated": int(quota_total),
        "storage_by_user": [{"username": n, "bytes": int(b)} for n, b in by_user],
        "storage_by_type": [{"category": k, "size": v} for k, v in sorted(cats.items(), key=lambda x: -x[1])],
        "uploads_timeline": timeline, "roles": roles,
        "recent_uploads": [dict(r.to_dict(), username=names.get(r.user_id)) for r in recent],
        "open_tickets": SupportTicket.query.filter_by(status="open").count(),
        "suspicious_count": len(_suspicious()),
    })


@bp.get("/users")
@roles_required(*ADMINS)
def users():
    q = User.query.join(Role)
    s = (request.args.get("q") or "").strip().lower()
    if s:
        q = q.filter(or_(func.lower(User.email).like(f"%{s}%"), func.lower(User.username).like(f"%{s}%"),
                         func.lower(User.full_name).like(f"%{s}%")))
    if request.args.get("role"):
        q = q.filter(Role.name == request.args["role"])
    if request.args.get("status") in ("active", "suspended"):
        q = q.filter(User.is_active.is_(request.args["status"] == "active"))
    page, per = max(request.args.get("page", 1, type=int), 1), min(request.args.get("per_page", 25, type=int), 100)
    total = q.count()
    rows = q.order_by(User.created_at.desc()).offset((page - 1) * per).limit(per).all()
    return jsonify({"items": [_user_row(u) for u in rows], "total": total, "page": page, "per_page": per})


def _manageable(target):
    if target.role.name == "super_admin" and g.user.role.name != "super_admin":
        raise ApiError(403, "Only a Super Admin can modify a Super Admin")
    if target.role.name == "admin" and g.user.role.name != "super_admin" and target.id != g.user.id:
        raise ApiError(403, "Only a Super Admin can modify an Administrator")


@bp.post("/users")
@roles_required(*ADMINS)
def create_user():
    d = request.get_json(silent=True) or {}
    email, username = (d.get("email") or "").strip().lower(), (d.get("username") or "").strip()
    if not EMAIL_RE.match(email) or not USERNAME_RE.match(username):
        raise ApiError(400, "A valid email and username are required")
    validate_password(d.get("password") or "")
    role_name = d.get("role", "user")
    if role_name in ("admin", "super_admin") and g.user.role.name != "super_admin":
        raise ApiError(403, "Only a Super Admin can create administrators")
    role = Role.query.filter_by(name=role_name).first()
    if not role:
        raise ApiError(400, "Unknown role")
    if User.query.filter(or_(func.lower(User.email) == email, func.lower(User.username) == username.lower())).first():
        raise ApiError(409, "Email or username already in use")
    u = User(email=email, username=username, full_name=(d.get("full_name") or "")[:120], role_id=role.id,
             email_verified=True)
    u.set_password(d["password"])
    db.session.add(u)
    db.session.flush()
    key = "collaborator_quota_mb" if role.name == "collaborator" else "default_quota_mb"
    db.session.add(StorageQuota(user_id=u.id, quota_bytes=int(get_setting(key)) * MB, updated_by=g.user.id))
    recompute_usage(u.id)
    log_activity("admin.user_create", "user", u.id, u.username)
    db.session.commit()
    return jsonify({"user": _user_row(u)}), 201


@bp.put("/users/<int:uid>")
@roles_required(*ADMINS)
def update_user(uid):
    u = db.session.get(User, uid)
    if not u:
        raise ApiError(404, "User not found")
    _manageable(u)
    d = request.get_json(silent=True) or {}
    changes = {}
    if "role" in d and d["role"] != u.role.name:
        if u.id == g.user.id:
            raise ApiError(400, "You cannot change your own role")
        if d["role"] in ("admin", "super_admin") and g.user.role.name != "super_admin":
            raise ApiError(403, "Only a Super Admin can grant administrator roles")
        role = Role.query.filter_by(name=d["role"]).first()
        if not role:
            raise ApiError(400, "Unknown role")
        changes["role"] = [u.role.name, role.name]
        u.role_id = role.id
        u.role = role
    if "is_active" in d and bool(d["is_active"]) != u.is_active:
        if u.id == g.user.id:
            raise ApiError(400, "You cannot suspend your own account")
        u.is_active = bool(d["is_active"])
        changes["is_active"] = u.is_active
        if not u.is_active:
            UserSession.query.filter_by(user_id=u.id, revoked=False).update({"revoked": True})
    if "quota_mb" in d:
        mb = float(d["quota_mb"])
        if mb < 1 or mb > 1024 * 1024:
            raise ApiError(400, "Quota must be between 1 MB and 1 TB")
        q = StorageQuota.query.filter_by(user_id=u.id).first() or StorageQuota(user_id=u.id)
        q.quota_bytes, q.updated_by = int(mb * MB), g.user.id
        db.session.add(q)
        changes["quota_mb"] = mb
    if d.get("new_password"):
        validate_password(d["new_password"])
        u.set_password(d["new_password"])
        UserSession.query.filter_by(user_id=u.id, revoked=False).update({"revoked": True})
        changes["password_reset"] = True
    if "full_name" in d:
        u.full_name = (d["full_name"] or "")[:120]
    db.session.flush()
    recompute_usage(u.id)
    log_activity("admin.user_update", "user", u.id, u.username, changes)
    db.session.commit()
    return jsonify({"user": _user_row(u)})


@bp.delete("/users/<int:uid>")
@roles_required("super_admin")
def delete_user(uid):
    u = db.session.get(User, uid)
    if not u:
        raise ApiError(404, "User not found")
    if u.id == g.user.id:
        raise ApiError(400, "You cannot delete your own account")
    name = u.username
    for f in File.query.filter_by(owner_id=u.id).all():
        purge_file(f)
    st = get_storage()
    if u.avatar_key:
        st.delete(u.avatar_key)
    db.session.flush()
    for fo in Folder.query.filter_by(owner_id=u.id).all():
        Favorite.query.filter_by(folder_id=fo.id).delete()
        Collaborator.query.filter_by(folder_id=fo.id).delete()
        for s in FileShare.query.filter_by(folder_id=fo.id).all():
            delete_share(s)
    db.session.flush()
    Folder.query.filter_by(owner_id=u.id).update({"parent_id": None})
    Folder.query.filter_by(owner_id=u.id).delete()
    for s in FileShare.query.filter_by(owner_id=u.id).all():
        delete_share(s)
    SharePermission.query.filter_by(user_id=u.id).delete()
    ShareAccess.query.filter_by(user_id=u.id).update({"user_id": None})
    Collaborator.query.filter(or_(Collaborator.owner_id == u.id, Collaborator.user_id == u.id)).delete()
    for model in (Favorite, Notification, RecentSearch, StorageQuota, StorageUsage, Trash):
        model.query.filter_by(user_id=u.id).delete()
    UserSession.query.filter_by(user_id=u.id).delete()
    UploadLog.query.filter_by(user_id=u.id).delete()
    DownloadLog.query.filter_by(user_id=u.id).update({"user_id": None})
    ActivityLog.query.filter_by(user_id=u.id).update({"user_id": None})
    SupportTicket.query.filter_by(user_id=u.id).update({"user_id": None})
    FileVersion.query.filter_by(created_by=u.id).update({"created_by": None})
    File.query.filter_by(uploaded_by=u.id).update({"uploaded_by": None})
    db.session.delete(u)
    log_activity("admin.user_delete", "user", uid, name)
    db.session.commit()
    return jsonify({"message": "User deleted"})


@bp.get("/storage")
@roles_required(*ADMINS)
def storage_overview():
    rows = []
    for u in User.query.order_by(User.username).all():
        rows.append(_user_row(u))
    rows.sort(key=lambda r: -r["used_bytes"])
    used = sum(r["used_bytes"] for r in rows)
    return jsonify({"users": rows, "total_used": used, "total_quota": sum(r["quota_bytes"] for r in rows),
                    "default_quota_mb": get_setting("default_quota_mb"),
                    "trash_bytes": int(db.session.query(func.coalesce(func.sum(Trash.size), 0)).scalar())})


@bp.post("/storage/cleanup-trash")
@roles_required(*ADMINS)
def run_trash_cleanup():
    n = cleanup_expired_trash()
    log_activity("admin.trash_cleanup", None, None, None, {"purged": n})
    db.session.commit()
    return jsonify({"purged": n})


def _suspicious():
    now = utcnow()
    out = []
    day, hour = now - timedelta(hours=24), now - timedelta(hours=1)
    for ip, ident, n in (db.session.query(UserSession.ip, UserSession.identifier, func.count(UserSession.id))
                         .filter(UserSession.success.is_(False), UserSession.created_at >= day)
                         .group_by(UserSession.ip, UserSession.identifier).having(func.count(UserSession.id) >= 5)):
        out.append({"type": "failed_logins", "severity": "high" if n >= 10 else "medium",
                    "message": f"{n} failed sign-ins for '{ident}' from {ip} in the last 24h", "ip": ip})
    for uid, n in (db.session.query(DownloadLog.user_id, func.count(DownloadLog.id))
                   .filter(DownloadLog.created_at >= hour, DownloadLog.user_id.isnot(None))
                   .group_by(DownloadLog.user_id).having(func.count(DownloadLog.id) >= 100)):
        u = db.session.get(User, uid)
        out.append({"type": "mass_download", "severity": "high",
                    "message": f"{u.username if u else uid} downloaded {n} files in the last hour"})
    for uid, n in (db.session.query(UploadLog.user_id, func.count(UploadLog.id))
                   .filter(UploadLog.status == "rejected", UploadLog.created_at >= hour)
                   .group_by(UploadLog.user_id).having(func.count(UploadLog.id) >= 5)):
        u = db.session.get(User, uid)
        out.append({"type": "rejected_uploads", "severity": "medium",
                    "message": f"{u.username if u else uid} had {n} rejected uploads in the last hour"})
    for sid, n in (db.session.query(ShareAccess.share_id, func.count())
                   .filter(ShareAccess.action == "wrong_password", ShareAccess.created_at >= day)
                   .group_by(ShareAccess.share_id).having(func.count() >= 5)):
        out.append({"type": "share_password_guessing", "severity": "high",
                    "message": f"{n} wrong password attempts on share link #{sid} in the last 24h"})
    return out


@bp.get("/suspicious")
@roles_required(*ADMINS)
def suspicious():
    failed = (UserSession.query.filter_by(success=False).order_by(UserSession.created_at.desc()).limit(25).all())
    return jsonify({"alerts": _suspicious(), "recent_failed_logins": [s.to_dict() for s in failed]})


@bp.get("/logs")
@roles_required(*ADMINS)
def logs():
    q = ActivityLog.query
    a = request.args
    if a.get("action"):
        q = q.filter(ActivityLog.action.like(a["action"] + "%"))
    if a.get("user_id"):
        q = q.filter(ActivityLog.user_id == int(a["user_id"]))
    if a.get("q"):
        q = q.filter(or_(func.lower(ActivityLog.target_name).like(f"%{a['q'].lower()}%"),
                         ActivityLog.ip.like(f"%{a['q']}%")))
    page, per = max(a.get("page", 1, type=int), 1), 50
    total = q.count()
    rows = q.order_by(ActivityLog.created_at.desc()).offset((page - 1) * per).limit(per).all()
    return jsonify({"items": [r.to_dict() for r in rows], "total": total, "page": page, "per_page": per})


@bp.get("/tickets")
@roles_required(*ADMINS)
def tickets():
    rows = SupportTicket.query.order_by(SupportTicket.status.desc(), SupportTicket.created_at.desc()).limit(100).all()
    return jsonify({"items": [t.to_dict() for t in rows]})


@bp.put("/tickets/<int:tid>")
@roles_required(*ADMINS)
def update_ticket(tid):
    t = db.session.get(SupportTicket, tid)
    if not t:
        raise ApiError(404, "Ticket not found")
    t.status = "closed" if (request.get_json(silent=True) or {}).get("status") == "closed" else "open"
    db.session.commit()
    return jsonify({"ticket": t.to_dict()})


CONFIG_KEYS = {"max_upload_mb": (1, 500), "default_quota_mb": (1, 1048576), "collaborator_quota_mb": (1, 1048576),
               "trash_retention_days": (1, 365), "max_versions": (1, 100)}


@bp.get("/config")
@roles_required(*ADMINS)
def get_config():
    keys = list(current_app.config["DEFAULT_SETTINGS"].keys())
    return jsonify({"config": {k: get_setting(k) for k in keys}, "can_edit": g.user.role.name == "super_admin"})


@bp.put("/config")
@roles_required("super_admin")
def put_config():
    d = request.get_json(silent=True) or {}
    for k, (lo, hi) in CONFIG_KEYS.items():
        if k in d:
            try:
                v = int(d[k])
            except (TypeError, ValueError):
                raise ApiError(400, f"{k} must be a number")
            if not lo <= v <= hi:
                raise ApiError(400, f"{k} must be between {lo} and {hi}")
            set_setting(k, v)
    for k in ("allow_registration", "require_email_verification"):
        if k in d:
            set_setting(k, bool(d[k]))
    if "allowed_extensions" in d:
        exts = sorted({e.strip().lower().lstrip(".") for e in str(d["allowed_extensions"]).split(",") if e.strip()})
        blocked = {"exe", "dll", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "jar", "php", "html", "htm", "svg",
                   "sh", "app", "apk"} & set(exts)
        if blocked:
            raise ApiError(400, "These extensions are blocked for security: " + ", ".join(sorted(blocked)))
        set_setting("allowed_extensions", ",".join(exts))
    if "site_name" in d:
        set_setting("site_name", str(d["site_name"])[:40] or "CloudVault")
    log_activity("admin.config_update", None, None, None, {k: d[k] for k in d if k != "allowed_extensions"})
    db.session.commit()
    return get_config()
