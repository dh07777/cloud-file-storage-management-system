from datetime import timedelta

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func, or_

from ..errors import ApiError
from ..extensions import db
from ..models import (ActivityLog, Collaborator, DownloadLog, Favorite, File, FileShare, FileVersion, Folder,
                      Notification, RecentSearch, StorageUsage, SupportTicket, Trash, UploadLog, User, Role, iso,
                      utcnow)
from ..permissions import get_file, get_folder
from ..serializers import fav_sets, file_dict, folder_dict
from ..utils import (MB, auth_required, category_for, log_activity, notify, usage_for)

bp = Blueprint("misc", __name__, url_prefix="/api")


# ------------------------------------------------------------------ dashboard
def _type_distribution(user_id):
    dist = {}
    for f in File.query.filter_by(owner_id=user_id, is_deleted=False).all():
        c = category_for(f.mime, f.ext)
        d = dist.setdefault(c, {"category": c, "count": 0, "size": 0})
        d["count"] += 1
        d["size"] += f.size
    return sorted(dist.values(), key=lambda x: -x["size"])


@bp.get("/dashboard")
@auth_required
def dashboard():
    u = g.user
    favs = fav_sets(u.id)
    recent = File.query.filter_by(owner_id=u.id, is_deleted=False).order_by(File.created_at.desc()).limit(6).all()
    acts = ActivityLog.query.filter(or_(ActivityLog.user_id == u.id, ActivityLog.scope_owner_id == u.id)) \
        .order_by(ActivityLog.created_at.desc()).limit(8).all()
    shared_by_me = FileShare.query.filter_by(owner_id=u.id, revoked=False).count() + \
        Collaborator.query.filter_by(owner_id=u.id).filter(Collaborator.status != "declined").count()
    shared_with_me = Collaborator.query.filter_by(user_id=u.id, status="accepted").count()
    return jsonify({
        "usage": usage_for(u.id), "recent_files": [file_dict(f, u, favs) for f in recent],
        "recent_activity": [a.to_dict() for a in acts], "shared_by_me": shared_by_me,
        "shared_with_me": shared_with_me, "type_distribution": _type_distribution(u.id),
        "favorites_count": len(favs[0]) + len(favs[1]),
        "unread_notifications": Notification.query.filter_by(user_id=u.id, is_read=False).count(),
    })


@bp.get("/files/recent")
@auth_required
def recent_files():
    favs = fav_sets(g.user.id)
    rows = File.query.filter_by(owner_id=g.user.id, is_deleted=False).order_by(File.updated_at.desc()).limit(60).all()
    return jsonify({"items": [file_dict(f, g.user, favs) for f in rows]})


# ------------------------------------------------------------------ storage analytics
@bp.get("/storage/analytics")
@auth_required
def storage_analytics():
    u = g.user
    files = File.query.filter_by(owner_id=u.id, is_deleted=False).all()
    favs = fav_sets(u.id)
    large = sorted(files, key=lambda f: -f.size)[:10]
    since = utcnow() - timedelta(days=29)
    per_day = {}
    for ul in UploadLog.query.filter(UploadLog.user_id == u.id, UploadLog.status == "completed",
                                     UploadLog.created_at >= since).all():
        k = ul.created_at.strftime("%Y-%m-%d")
        per_day[k] = per_day.get(k, 0) + ul.size
    timeline = []
    for i in range(30):
        day = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        timeline.append({"date": day, "uploaded": per_day.get(day, 0)})
    trash_size = db.session.query(func.coalesce(func.sum(Trash.size), 0)).filter_by(user_id=u.id).scalar()
    version_extra = (db.session.query(func.coalesce(func.sum(FileVersion.size), 0))
                     .join(File, File.id == FileVersion.file_id)
                     .filter(File.owner_id == u.id, FileVersion.version != File.current_version).scalar())
    dup_groups = (db.session.query(File.sha256, func.count(File.id), func.sum(File.size))
                  .filter(File.owner_id == u.id, File.is_deleted.is_(False))
                  .group_by(File.sha256).having(func.count(File.id) > 1).all())
    dup_waste = sum(int(total) - int(total) // int(n) for _, n, total in dup_groups)
    old_cut = utcnow() - timedelta(days=180)
    stale = [f for f in files if f.updated_at < old_cut and f.size > 5 * MB]
    suggestions = []
    if trash_size:
        suggestions.append({"id": "trash", "title": "Empty your trash", "bytes": int(trash_size), "link": "/app/trash",
                            "description": "Deleted items still count toward your quota until they are permanently removed."})
    if version_extra:
        suggestions.append({"id": "versions", "title": "Review old file versions", "bytes": int(version_extra),
                            "link": "/app/files", "description": "Previous versions of your files use extra space."})
    if dup_waste:
        suggestions.append({"id": "duplicates", "title": f"{len(dup_groups)} set(s) of duplicate files", "bytes": dup_waste,
                            "link": "/app/files", "description": "Identical files stored more than once."})
    if stale:
        suggestions.append({"id": "stale", "title": f"{len(stale)} large file(s) untouched for 6+ months",
                            "bytes": sum(f.size for f in stale), "link": "/app/files",
                            "description": "Large files you have not modified in a long time."})
    return jsonify({
        "usage": usage_for(u.id), "type_distribution": _type_distribution(u.id),
        "large_files": [file_dict(f, u, favs) for f in large], "timeline": timeline,
        "trash_size": int(trash_size), "old_versions_size": int(version_extra),
        "duplicate_groups": len(dup_groups), "suggestions": suggestions,
    })


# ------------------------------------------------------------------ search
@bp.get("/search")
@auth_required
def search():
    a, u = request.args, g.user
    q = (a.get("q") or "").strip()
    favs = fav_sets(u.id)
    shared_ids = [c.folder_id for c in Collaborator.query.filter_by(user_id=u.id, status="accepted")
                  if c.folder_id]
    own = File.owner_id == u.id
    fq = File.query.filter(File.is_deleted.is_(False), own)  # search covers the user's own storage
    if q:
        like = f"%{q.lower()}%"
        fq = fq.filter(func.lower(File.name).like(like))
        db.session.add(RecentSearch(user_id=u.id, query=q[:120]))
    if a.get("ext"):
        fq = fq.filter(File.ext == a["ext"].lower().lstrip("."))
    if a.get("from"):
        fq = fq.filter(File.created_at >= _date(a["from"]))
    if a.get("to"):
        fq = fq.filter(File.created_at < _date(a["to"]) + timedelta(days=1))
    if a.get("min_size"):
        fq = fq.filter(File.size >= int(float(a["min_size"]) * MB))
    if a.get("max_size"):
        fq = fq.filter(File.size <= int(float(a["max_size"]) * MB))
    rows = fq.all()
    if a.get("type"):
        rows = [f for f in rows if category_for(f.mime, f.ext) == a["type"]]
    sort, rev = a.get("sort", "date"), a.get("order", "desc") == "desc"
    keyf = {"name": lambda f: f.name.lower(), "size": lambda f: f.size, "type": lambda f: f.ext,
            "date": lambda f: f.created_at}.get(sort, lambda f: f.created_at)
    rows.sort(key=keyf, reverse=rev)
    folders = []
    if q:
        folders = Folder.query.filter(Folder.owner_id == u.id, Folder.is_deleted.is_(False),
                                      func.lower(Folder.name).like(f"%{q.lower()}%")).limit(20).all()
    db.session.commit()
    return jsonify({"files": [file_dict(f, u, favs) for f in rows[:200]],
                    "folders": [folder_dict(f, u, favs) for f in folders], "total": len(rows)})


def _date(s):
    from datetime import datetime
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError:
        raise ApiError(400, "Dates must be YYYY-MM-DD")


@bp.get("/search/recent")
@auth_required
def recent_searches():
    seen, out = set(), []
    for r in RecentSearch.query.filter_by(user_id=g.user.id).order_by(RecentSearch.created_at.desc()).limit(40):
        if r.query.lower() not in seen:
            seen.add(r.query.lower())
            out.append(r.query)
        if len(out) >= 8:
            break
    return jsonify({"items": out})


@bp.delete("/search/recent")
@auth_required
def clear_recent_searches():
    RecentSearch.query.filter_by(user_id=g.user.id).delete()
    db.session.commit()
    return jsonify({"message": "Cleared"})


# ------------------------------------------------------------------ favorites
@bp.get("/favorites")
@auth_required
def favorites():
    favs = fav_sets(g.user.id)
    files = File.query.filter(File.id.in_(list(favs[0]) or [0]), File.is_deleted.is_(False)).all()
    folders = Folder.query.filter(Folder.id.in_(list(favs[1]) or [0]), Folder.is_deleted.is_(False)).all()
    return jsonify({"files": [file_dict(f, g.user, favs) for f in files],
                    "folders": [folder_dict(f, g.user, favs) for f in folders]})


@bp.post("/favorites")
@auth_required
def add_favorite():
    d = request.get_json(silent=True) or {}
    if d.get("file_id"):
        f, _ = get_file(g.user, int(d["file_id"]))
        if not Favorite.query.filter_by(user_id=g.user.id, file_id=f.id).first():
            db.session.add(Favorite(user_id=g.user.id, file_id=f.id))
    elif d.get("folder_id"):
        fo, _ = get_folder(g.user, int(d["folder_id"]))
        if not Favorite.query.filter_by(user_id=g.user.id, folder_id=fo.id).first():
            db.session.add(Favorite(user_id=g.user.id, folder_id=fo.id))
    else:
        raise ApiError(400, "file_id or folder_id is required")
    db.session.commit()
    return jsonify({"message": "Added to favorites"}), 201


@bp.delete("/favorites")
@auth_required
def remove_favorite():
    q = Favorite.query.filter_by(user_id=g.user.id)
    if request.args.get("file_id"):
        q = q.filter_by(file_id=int(request.args["file_id"]))
    elif request.args.get("folder_id"):
        q = q.filter_by(folder_id=int(request.args["folder_id"]))
    else:
        raise ApiError(400, "file_id or folder_id is required")
    q.delete()
    db.session.commit()
    return jsonify({"message": "Removed from favorites"})


# ------------------------------------------------------------------ notifications
@bp.get("/notifications")
@auth_required
def notifications():
    rows = Notification.query.filter_by(user_id=g.user.id).order_by(Notification.created_at.desc()).limit(100).all()
    return jsonify({"items": [n.to_dict() for n in rows],
                    "unread": Notification.query.filter_by(user_id=g.user.id, is_read=False).count()})


@bp.get("/notifications/unread-count")
@auth_required
def unread_count():
    return jsonify({"unread": Notification.query.filter_by(user_id=g.user.id, is_read=False).count()})


@bp.post("/notifications/<int:nid>/read")
@auth_required
def mark_read(nid):
    Notification.query.filter_by(id=nid, user_id=g.user.id).update({"is_read": True})
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/notifications/read-all")
@auth_required
def mark_all_read():
    Notification.query.filter_by(user_id=g.user.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"ok": True})


@bp.delete("/notifications/<int:nid>")
@auth_required
def delete_notification(nid):
    Notification.query.filter_by(id=nid, user_id=g.user.id).delete()
    db.session.commit()
    return jsonify({"ok": True})


@bp.delete("/notifications")
@auth_required
def clear_notifications():
    Notification.query.filter_by(user_id=g.user.id).delete()
    db.session.commit()
    return jsonify({"ok": True})


# ------------------------------------------------------------------ user's own activity
@bp.get("/activity")
@auth_required
def my_activity():
    rows = (ActivityLog.query.filter(or_(ActivityLog.user_id == g.user.id, ActivityLog.scope_owner_id == g.user.id))
            .order_by(ActivityLog.created_at.desc()).limit(100).all())
    return jsonify({"items": [r.to_dict() for r in rows]})


# ------------------------------------------------------------------ support + public stats
@bp.post("/support")
@auth_required
def support():
    d = request.get_json(silent=True) or {}
    subject, message = (d.get("subject") or "").strip(), (d.get("message") or "").strip()
    if len(subject) < 3 or len(message) < 10:
        raise ApiError(400, "Please provide a subject and a message of at least 10 characters")
    t = SupportTicket(user_id=g.user.id, subject=subject[:150], message=message[:4000])
    db.session.add(t)
    for admin in User.query.join(Role).filter(Role.name.in_(["admin", "super_admin"])).all():
        notify(admin.id, "support", "New support request", f"{g.user.username}: {subject}", "/app/admin/activity")
    log_activity("support.ticket", "ticket", None, subject)
    db.session.commit()
    return jsonify({"ticket": t.to_dict()}), 201


@bp.get("/support")
@auth_required
def my_tickets():
    rows = SupportTicket.query.filter_by(user_id=g.user.id).order_by(SupportTicket.created_at.desc()).all()
    return jsonify({"items": [t.to_dict() for t in rows]})


@bp.get("/public-stats")
def public_stats():
    used = db.session.query(func.coalesce(func.sum(FileVersion.size), 0)).scalar()
    return jsonify({"users": User.query.count(), "files": File.query.filter_by(is_deleted=False).count(),
                    "bytes_stored": int(used)})


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})
