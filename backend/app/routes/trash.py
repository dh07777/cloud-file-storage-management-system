from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from ..errors import ApiError
from ..extensions import db
from ..models import File, Folder, Trash, iso
from ..permissions import descendants
from ..services import purge_file, purge_folder
from ..utils import auth_required, get_setting, log_activity, recompute_usage, unique_name

bp = Blueprint("trash", __name__, url_prefix="/api/trash")


def _row_dict(t):
    return {"id": t.id, "item_type": t.item_type, "item_id": t.item_id, "name": t.name, "size": t.size,
            "deleted_at": iso(t.deleted_at), "expires_at": iso(t.expires_at)}


@bp.get("")
@auth_required
def list_trash():
    rows = Trash.query.filter_by(user_id=g.user.id).order_by(Trash.deleted_at.desc()).all()
    total = sum(r.size or 0 for r in rows)
    return jsonify({"items": [_row_dict(r) for r in rows], "total_size": total, "count": len(rows),
                    "retention_days": int(get_setting("trash_retention_days"))})


def _restore(t):
    if t.item_type == "file":
        f = db.session.get(File, t.item_id)
        if f:
            parent = db.session.get(Folder, f.folder_id) if f.folder_id else None
            if parent is not None and parent.is_deleted:
                f.folder_id = None  # original folder is gone -> restore to root
            f.is_deleted, f.deleted_at, f.trashed_via = False, None, None
            f.name = unique_name(File, f.owner_id, File.folder_id, f.folder_id, f.name, exclude_id=f.id)
    else:
        fo = db.session.get(Folder, t.item_id)
        if fo:
            parent = db.session.get(Folder, fo.parent_id) if fo.parent_id else None
            if parent is not None and parent.is_deleted:
                fo.parent_id = None
            fo.is_deleted, fo.deleted_at, fo.trashed_via = False, None, None
            fo.name = unique_name(Folder, fo.owner_id, Folder.parent_id, fo.parent_id, fo.name, exclude_id=fo.id)
            for d in descendants(fo):
                if d.trashed_via == t.item_id:
                    d.is_deleted, d.deleted_at, d.trashed_via = False, None, None
            ids = [fo.id] + [d.id for d in descendants(fo)]
            for f in File.query.filter(File.folder_id.in_(ids), File.trashed_via == t.item_id).all():
                f.is_deleted, f.deleted_at, f.trashed_via = False, None, None
    db.session.delete(t)


@bp.post("/restore")
@auth_required
def restore():
    d = request.get_json(silent=True) or {}
    t = Trash.query.filter_by(user_id=g.user.id, id=d.get("id")).first()
    if not t:
        raise ApiError(404, "Item not found in trash")
    _restore(t)
    log_activity("trash.restore", t.item_type, t.item_id, t.name)
    db.session.flush()
    recompute_usage(g.user.id)
    db.session.commit()
    return jsonify({"message": "Restored"})


@bp.delete("/<int:tid>")
@auth_required
def permanent_delete(tid):
    t = Trash.query.filter_by(user_id=g.user.id, id=tid).first()
    if not t:
        raise ApiError(404, "Item not found in trash")
    _purge(t)
    db.session.flush()
    recompute_usage(g.user.id)
    db.session.commit()
    return jsonify({"message": "Permanently deleted"})


def _purge(t):
    if t.item_type == "file":
        f = db.session.get(File, t.item_id)
        if f:
            purge_file(f)
    else:
        fo = db.session.get(Folder, t.item_id)
        if fo:
            purge_folder(fo)
    Trash.query.filter_by(id=t.id).delete()
    log_activity("trash.purge", t.item_type, t.item_id, t.name)


@bp.delete("")
@auth_required
def empty():
    for t in Trash.query.filter_by(user_id=g.user.id).all():
        _purge(t)
    db.session.flush()
    recompute_usage(g.user.id)
    db.session.commit()
    return jsonify({"message": "Trash emptied"})
