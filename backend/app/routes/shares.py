from datetime import timedelta

from flask import Blueprint, current_app, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash

from ..errors import ApiError
from ..extensions import db, limiter
from ..models import (Collaborator, File, FileShare, Folder, ShareAccess, SharePermission, User, iso, utcnow)
from ..permissions import descendants, get_file, get_folder
from ..serializers import file_dict, folder_dict
from ..services import log_download
from ..utils import (auth_required, client_ip, inline_safe, log_activity, new_share_token, notify, optional_user,
                     send_stored)

bp = Blueprint("shares", __name__, url_prefix="/api/shares")
public_bp = Blueprint("public", __name__, url_prefix="/api/public")
ACCESS_TTL = 15 * 60  # temporary access tokens live 15 minutes


def share_dict(s, detail=False):
    item = s.file or s.folder
    d = {"id": s.id, "token": s.token, "url": f"{current_app.config['FRONTEND_URL']}/s/{s.token}",
         "item_type": "file" if s.file_id else "folder", "item_id": s.file_id or s.folder_id,
         "item_name": item.name if item else "(deleted)", "is_public": s.is_public,
         "has_password": bool(s.password_hash), "expires_at": iso(s.expires_at),
         "expired": bool(s.expires_at and s.expires_at < utcnow()), "allow_download": s.allow_download,
         "revoked": s.revoked, "access_count": s.access_count, "created_at": iso(s.created_at),
         "users": [{"id": p.user.id, "username": p.user.username, "email": p.user.email} for p in s.permissions]}
    return d


def _apply(s, d, creating=False):
    if "is_public" in d:
        s.is_public = bool(d["is_public"])
    if "allow_download" in d:
        s.allow_download = bool(d["allow_download"])
    if "password" in d:  # "" or None clears
        s.password_hash = generate_password_hash(d["password"]) if d["password"] else None
    if "expires_in_hours" in d:
        h = d["expires_in_hours"]
        s.expires_at = utcnow() + timedelta(hours=float(h)) if h else None
    if "user_emails" in d:
        SharePermission.query.filter_by(share_id=s.id).delete() if s.id else None
        emails = {e.strip().lower() for e in d["user_emails"] or [] if e and e.strip()}
        for email in emails:
            u = User.query.filter(func.lower(User.email) == email).first()
            if not u:
                raise ApiError(404, f"No CloudVault user with email {email}")
            if u.id != s.owner_id:
                db.session.add(SharePermission(share=s, user_id=u.id,
                                               permission="download" if s.allow_download else "view"))
                notify(u.id, "file_shared", "Something was shared with you",
                       f"{g.user.username} shared '{(s.file or s.folder).name}' with you", "/app/shared-with-me")
    if not s.is_public and not (d.get("user_emails") or s.permissions) and creating:
        raise ApiError(400, "A private share needs at least one user email")


@bp.post("")
@auth_required
def create():
    if g.user.role.name == "collaborator":
        raise ApiError(403, "Shared collaborators cannot create share links")
    d = request.get_json(silent=True) or {}
    s = FileShare(owner_id=g.user.id, token=new_share_token())
    if d.get("file_id"):
        f, _ = get_file(g.user, int(d["file_id"]), "owner")
        s.file_id, name = f.id, f.name
    elif d.get("folder_id"):
        fo, _ = get_folder(g.user, int(d["folder_id"]), "owner")
        s.folder_id, name = fo.id, fo.name
    else:
        raise ApiError(400, "file_id or folder_id is required")
    d.setdefault("is_public", True)
    db.session.add(s)
    db.session.flush()
    _apply(s, d, creating=True)
    log_activity("share.create", "file" if s.file_id else "folder", s.file_id or s.folder_id, name,
                 {"public": s.is_public})
    db.session.commit()
    return jsonify({"share": share_dict(s)}), 201


@bp.get("/by-me")
@auth_required
def by_me():
    rows = FileShare.query.filter_by(owner_id=g.user.id).order_by(FileShare.created_at.desc()).all()
    return jsonify({"items": [share_dict(s) for s in rows]})


@bp.get("/item")
@auth_required
def for_item():
    q = FileShare.query.filter_by(owner_id=g.user.id, revoked=False)
    if request.args.get("file_id"):
        q = q.filter_by(file_id=int(request.args["file_id"]))
    elif request.args.get("folder_id"):
        q = q.filter_by(folder_id=int(request.args["folder_id"]))
    return jsonify({"items": [share_dict(s) for s in q.order_by(FileShare.created_at.desc()).all()]})


def _own_share(sid):
    s = FileShare.query.filter_by(id=sid, owner_id=g.user.id).first()
    if not s:
        raise ApiError(404, "Share not found")
    return s


@bp.put("/<int:sid>")
@auth_required
def update(sid):
    s = _own_share(sid)
    if s.revoked:
        raise ApiError(400, "This link has been revoked")
    _apply(s, request.get_json(silent=True) or {})
    log_activity("share.update", "share", s.id, (s.file or s.folder).name)
    db.session.commit()
    return jsonify({"share": share_dict(s)})


@bp.delete("/<int:sid>")
@auth_required
def revoke(sid):
    s = _own_share(sid)
    s.revoked, s.revoked_at = True, utcnow()
    log_activity("share.revoke", "share", s.id, (s.file or s.folder).name)
    db.session.commit()
    return jsonify({"message": "Link revoked"})


@bp.get("/<int:sid>/activity")
@auth_required
def activity(sid):
    s = _own_share(sid)
    rows = ShareAccess.query.filter_by(share_id=s.id).order_by(ShareAccess.created_at.desc()).limit(100).all()
    return jsonify({"share": share_dict(s), "items": [_access_dict(a) for a in rows]})


def _access_dict(a):
    u = db.session.get(User, a.user_id) if a.user_id else None
    return {"id": a.id, "action": a.action, "ip": a.ip, "created_at": iso(a.created_at),
            "user_agent": a.user_agent, "user": u.brief() if u else None, "share_id": a.share_id}


@bp.get("/activity")
@auth_required
def all_activity():
    ids = [s.id for s in FileShare.query.filter_by(owner_id=g.user.id).all()]
    rows = (ShareAccess.query.filter(ShareAccess.share_id.in_(ids)).order_by(ShareAccess.created_at.desc())
            .limit(100).all()) if ids else []
    names = {s.id: (s.file or s.folder).name for s in FileShare.query.filter(FileShare.id.in_(ids)).all()} if ids else {}
    return jsonify({"items": [dict(_access_dict(a), item_name=names.get(a.share_id)) for a in rows]})


@bp.get("/with-me")
@auth_required
def with_me():
    favs = None
    items = []
    for c in Collaborator.query.filter_by(user_id=g.user.id, status="accepted").all():
        obj = c.folder or c.file
        if not obj or obj.is_deleted:
            continue
        data = folder_dict(obj, g.user) if c.folder_id else file_dict(obj, g.user)
        items.append({"kind": "collaboration", "permission": c.permission, "shared_at": iso(c.responded_at or c.created_at),
                      "owner": c.owner.brief(), "item": data, "item_type": data["type"]})
    now = utcnow()
    for p in SharePermission.query.filter_by(user_id=g.user.id).all():
        s = p.share
        if s.revoked or (s.expires_at and s.expires_at < now):
            continue
        obj = s.file or s.folder
        if not obj or obj.is_deleted:
            continue
        data = {"id": obj.id, "type": "file" if s.file_id else "folder", "name": obj.name,
                "size": getattr(obj, "size", None), "ext": getattr(obj, "ext", None)}
        items.append({"kind": "link", "permission": p.permission, "shared_at": iso(s.created_at),
                      "owner": s.file.owner.brief() if s.file else s.folder.owner.brief(), "item": data,
                      "item_type": data["type"], "token": s.token})
    items.sort(key=lambda x: x["shared_at"] or "", reverse=True)
    return jsonify({"items": items})


# ============================================================ public (token) access
def _serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="share-access")


def _load_share(token):
    s = FileShare.query.filter_by(token=token).first()
    if not s or s.revoked:
        raise ApiError(404, "This link is invalid or has been revoked")
    if s.expires_at and s.expires_at < utcnow():
        raise ApiError(410, "This link has expired")
    item = s.file or s.folder
    if not item or item.is_deleted:
        raise ApiError(404, "The shared item is no longer available")
    return s


def _check_private(s):
    """Private shares: only the listed users, signed in."""
    if s.is_public:
        return None
    user = optional_user()
    if not user:
        raise ApiError(401, "Please sign in to open this link", code="login_required")
    if user.id != s.owner_id and not SharePermission.query.filter_by(share_id=s.id, user_id=user.id).first():
        raise ApiError(403, "This item was not shared with your account")
    return user


def _record(s, action, user=None):
    db.session.add(ShareAccess(share_id=s.id, user_id=user.id if user else None, action=action, ip=client_ip(),
                               user_agent=(request.user_agent.string or "")[:255]))
    if action in ("view", "download"):
        s.access_count = (s.access_count or 0) + 1
        item = s.file or s.folder
        notify(s.owner_id, "share_accessed", "Shared link accessed",
               f"'{item.name}' was {'downloaded' if action == 'download' else 'opened'} via your link",
               "/app/shared-by-me")


def _require_access(token):
    s = _load_share(token)
    user = _check_private(s)
    tok = request.args.get("access") or request.headers.get("X-Share-Access") or ""
    try:
        data = _serializer().loads(tok, max_age=ACCESS_TTL)
    except SignatureExpired:
        raise ApiError(401, "Access expired, please re-open the link", code="access_expired")
    except BadSignature:
        raise ApiError(401, "Access token required", code="access_required")
    if data.get("s") != s.id:
        raise ApiError(401, "Access token required", code="access_required")
    return s, user


def _can_download(s, user):
    if s.is_public:
        return s.allow_download
    p = SharePermission.query.filter_by(share_id=s.id, user_id=user.id).first() if user else None
    return bool(user and (user.id == s.owner_id or (p and p.permission == "download")))


@public_bp.get("/<token>")
@limiter.limit("60 per minute")
def info(token):
    s = _load_share(token)
    user = _check_private(s)
    item = s.file or s.folder
    owner = db.session.get(User, s.owner_id)
    return jsonify({"name": item.name, "type": "file" if s.file_id else "folder",
                    "size": getattr(item, "size", None), "mime": getattr(item, "mime", None),
                    "ext": getattr(item, "ext", None), "owner": owner.brief(),
                    "needs_password": bool(s.password_hash), "allow_download": _can_download(s, user),
                    "expires_at": iso(s.expires_at), "is_public": s.is_public})


@public_bp.post("/<token>/unlock")
@limiter.limit("10 per minute")
def unlock(token):
    s = _load_share(token)
    user = _check_private(s)
    if s.password_hash:
        pw = (request.get_json(silent=True) or {}).get("password") or ""
        if not check_password_hash(s.password_hash, pw):
            _record(s, "wrong_password", user)
            db.session.commit()
            raise ApiError(401, "Incorrect password", code="wrong_password")
    _record(s, "view", user)
    db.session.commit()
    return jsonify({"access": _serializer().dumps({"s": s.id}), "expires_in": ACCESS_TTL})


def _folder_scope(s, folder_id):
    root = s.folder
    if folder_id is None or folder_id == root.id:
        return root
    fo = db.session.get(Folder, folder_id)
    if not fo or fo.is_deleted or fo.id not in {d.id for d in descendants(root)}:
        raise ApiError(404, "Folder not found")
    return fo


@public_bp.get("/<token>/contents")
@limiter.limit("60 per minute")
def contents(token):
    s, _ = _require_access(token)
    if not s.folder_id:
        raise ApiError(400, "Not a folder share")
    fo = _folder_scope(s, request.args.get("folder_id", type=int))
    return jsonify({
        "folder": {"id": fo.id, "name": fo.name, "is_root": fo.id == s.folder_id},
        "folders": [{"id": x.id, "name": x.name} for x in Folder.query.filter_by(parent_id=fo.id, is_deleted=False)],
        "files": [{"id": x.id, "name": x.name, "size": x.size, "mime": x.mime, "ext": x.ext}
                  for x in File.query.filter_by(folder_id=fo.id, is_deleted=False)]})


def _shared_file(s, file_id):
    if s.file_id:
        return s.file
    f = db.session.get(File, file_id) if file_id else None
    if not f or f.is_deleted or not f.folder_id:
        raise ApiError(404, "File not found")
    allowed = {s.folder_id} | {d.id for d in descendants(s.folder)}
    if f.folder_id not in allowed:
        raise ApiError(404, "File not found")
    return f


@public_bp.get("/<token>/download")
@limiter.limit("30 per minute")
def download(token):
    s, user = _require_access(token)
    if not _can_download(s, user):
        raise ApiError(403, "Downloading is disabled for this link")
    f = _shared_file(s, request.args.get("file_id", type=int))
    log_download(f, user, share=s)
    _record(s, "download", user)
    notify(f.owner_id, "file_downloaded", "File downloaded", f"'{f.name}' was downloaded via a share link",
           f"/app/file/{f.id}")
    db.session.commit()
    return send_stored(f.stored_name, f.mime, f.name, True)


@public_bp.get("/<token>/preview")
@limiter.limit("60 per minute")
def preview(token):
    s, _ = _require_access(token)
    f = _shared_file(s, request.args.get("file_id", type=int))
    if not inline_safe(f.mime):
        raise ApiError(415, "This file type cannot be previewed")
    return send_stored(f.stored_name, f.mime, f.name, False)
