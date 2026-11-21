from flask import Blueprint, g, jsonify, request
from sqlalchemy import func, or_

from ..errors import ApiError
from ..extensions import db
from ..models import ActivityLog, Collaborator, File, Folder, User, iso, utcnow
from ..permissions import get_file, get_folder
from ..serializers import folder_dict
from ..utils import auth_required, log_activity, notify

bp = Blueprint("collab", __name__, url_prefix="/api/collab")


def _cdict(c):
    obj = c.folder or c.file
    return {"id": c.id, "permission": c.permission, "status": c.status, "created_at": iso(c.created_at),
            "owner": c.owner.brief(), "user": {**c.user.brief(), "email": c.user.email},
            "item_type": "folder" if c.folder_id else "file", "item_id": c.folder_id or c.file_id,
            "item_name": obj.name if obj else "(deleted)"}


@bp.post("/invite")
@auth_required
def invite():
    d = request.get_json(silent=True) or {}
    perm = d.get("permission", "viewer")
    if perm not in ("viewer", "editor"):
        raise ApiError(400, "Permission must be 'viewer' or 'editor'")
    if d.get("folder_id"):
        item, _ = get_folder(g.user, int(d["folder_id"]), "owner")
        kw = {"folder_id": item.id}
    elif d.get("file_id"):
        item, _ = get_file(g.user, int(d["file_id"]), "owner")
        kw = {"file_id": item.id}
    else:
        raise ApiError(400, "folder_id or file_id is required")
    email = (d.get("email") or "").strip().lower()
    target = User.query.filter(func.lower(User.email) == email).first()
    if not target or not target.is_active:
        raise ApiError(404, "No active CloudVault user with that email")
    if target.id == g.user.id:
        raise ApiError(400, "You already own this item")
    c = Collaborator.query.filter_by(user_id=target.id, **kw).first()
    if c and c.status != "declined":
        c.permission = perm
    else:
        if not c:
            c = Collaborator(owner_id=g.user.id, user_id=target.id, **kw)
            db.session.add(c)
        c.permission, c.status, c.created_at, c.responded_at = perm, "pending", utcnow(), None
    notify(target.id, "collab_invite", "New collaboration invitation",
           f"{g.user.username} invited you to {perm} '{item.name}'", "/app/shared-with-me")
    log_activity("collab.invite", "folder" if "folder_id" in kw else "file", item.id, item.name,
                 {"user": target.username, "permission": perm})
    db.session.commit()
    return jsonify({"collaborator": _cdict(c)}), 201


@bp.get("/item")
@auth_required
def for_item():
    if request.args.get("folder_id"):
        item, _ = get_folder(g.user, int(request.args["folder_id"]), "owner")
        q = Collaborator.query.filter_by(folder_id=item.id)
    elif request.args.get("file_id"):
        item, _ = get_file(g.user, int(request.args["file_id"]), "owner")
        q = Collaborator.query.filter_by(file_id=item.id)
    else:
        raise ApiError(400, "folder_id or file_id is required")
    return jsonify({"items": [_cdict(c) for c in q.filter(Collaborator.status != "declined").all()]})


@bp.get("/invitations")
@auth_required
def invitations():
    rows = Collaborator.query.filter_by(user_id=g.user.id, status="pending").order_by(Collaborator.created_at.desc())
    return jsonify({"items": [_cdict(c) for c in rows.all()]})


@bp.post("/invitations/<int:cid>/respond")
@auth_required
def respond(cid):
    c = Collaborator.query.filter_by(id=cid, user_id=g.user.id, status="pending").first()
    if not c:
        raise ApiError(404, "Invitation not found")
    accept = bool((request.get_json(silent=True) or {}).get("accept"))
    c.status, c.responded_at = ("accepted" if accept else "declined"), utcnow()
    obj = c.folder or c.file
    notify(c.owner_id, "collab_invite", "Invitation " + ("accepted" if accept else "declined"),
           f"{g.user.username} {'accepted' if accept else 'declined'} your invitation to '{obj.name if obj else ''}'")
    log_activity("collab.accept" if accept else "collab.decline", "folder" if c.folder_id else "file",
                 c.folder_id or c.file_id, obj.name if obj else None, owner_id=c.owner_id)
    db.session.commit()
    return jsonify({"collaborator": _cdict(c)})


@bp.put("/<int:cid>")
@auth_required
def update(cid):
    c = Collaborator.query.filter_by(id=cid, owner_id=g.user.id).first()
    perm = (request.get_json(silent=True) or {}).get("permission")
    if not c:
        raise ApiError(404, "Collaborator not found")
    if perm not in ("viewer", "editor"):
        raise ApiError(400, "Permission must be 'viewer' or 'editor'")
    c.permission = perm
    db.session.commit()
    return jsonify({"collaborator": _cdict(c)})


@bp.delete("/<int:cid>")
@auth_required
def remove(cid):
    c = Collaborator.query.filter(Collaborator.id == cid,
                                  or_(Collaborator.owner_id == g.user.id, Collaborator.user_id == g.user.id)).first()
    if not c:
        raise ApiError(404, "Collaborator not found")
    obj = c.folder or c.file
    log_activity("collab.remove", "folder" if c.folder_id else "file", c.folder_id or c.file_id,
                 obj.name if obj else None, owner_id=c.owner_id)
    db.session.delete(c)
    db.session.commit()
    return jsonify({"message": "Removed"})


@bp.get("/workspace")
@auth_required
def workspace():
    """Shared workspace: every folder/file shared with me (accepted) plus items I share with others."""
    mine = [_cdict(c) for c in Collaborator.query.filter_by(owner_id=g.user.id).filter(
        Collaborator.status != "declined").order_by(Collaborator.created_at.desc()).all()]
    shared_to_me = []
    for c in Collaborator.query.filter_by(user_id=g.user.id, status="accepted").all():
        if c.folder and not c.folder.is_deleted:
            shared_to_me.append({**_cdict(c), "folder": folder_dict(c.folder, g.user)})
        elif c.file and not c.file.is_deleted:
            shared_to_me.append(_cdict(c))
    return jsonify({"shared_with_me": shared_to_me, "shared_by_me": mine})


@bp.get("/activity")
@auth_required
def activity():
    """Collaboration activity: others acting on my resources, and my actions inside others' workspaces."""
    rows = (ActivityLog.query.filter(or_(
        (ActivityLog.scope_owner_id == g.user.id) & (ActivityLog.user_id != g.user.id),
        (ActivityLog.user_id == g.user.id) & (ActivityLog.scope_owner_id != g.user.id)))
        .order_by(ActivityLog.created_at.desc()).limit(100).all())
    return jsonify({"items": [r.to_dict() for r in rows]})
