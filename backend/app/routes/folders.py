from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from ..errors import ApiError
from ..extensions import db
from ..models import File, Folder
from ..permissions import descendants, folder_chain, folder_level, get_folder, level_name
from ..serializers import breadcrumbs, fav_sets, file_dict, folder_dict
from ..services import trash_folder
from ..utils import auth_required, clean_filename, log_activity, notify, recompute_usage, unique_name

bp = Blueprint("folders", __name__, url_prefix="/api/folders")

SORTS = {"name": lambda x: x["name"].lower(), "size": lambda x: x.get("size", 0),
         "date": lambda x: x["updated_at"] or "", "type": lambda x: (x.get("ext") or "")}


def _clean_folder_name(raw):
    name = (raw or "").strip().replace("/", "-").replace("\\", "-")[:120]
    if not name or name in (".", ".."):
        raise ApiError(400, "Please enter a valid folder name")
    return name


@bp.get("/contents")
@auth_required
def contents():
    """Contents of a folder (or the user's root). Works for owners and accepted collaborators."""
    raw = request.args.get("folder_id")
    sort, order = request.args.get("sort", "name"), request.args.get("order", "asc")
    favs = fav_sets(g.user.id)
    if raw in (None, "", "null", "root"):
        folder, level = None, 3
        folders = Folder.query.filter_by(owner_id=g.user.id, parent_id=None, is_deleted=False).all()
        files = File.query.filter_by(owner_id=g.user.id, folder_id=None, is_deleted=False).all()
        crumbs = []
    else:
        folder, level = get_folder(g.user, int(raw))
        folders = Folder.query.filter_by(parent_id=folder.id, is_deleted=False).all()
        files = File.query.filter_by(folder_id=folder.id, is_deleted=False).all()
        crumbs = breadcrumbs(folder)
    fd = [folder_dict(f, g.user, favs, level=level if level < 3 else 3) for f in folders]
    fl = [file_dict(f, g.user, favs, level=level if level < 3 else 3) for f in files]
    key = SORTS.get(sort, SORTS["name"])
    rev = order == "desc"
    fd.sort(key=SORTS["name"] if sort != "date" else SORTS["date"], reverse=rev)
    fl.sort(key=key, reverse=rev)
    return jsonify({"folder": folder_dict(folder, g.user, favs, level=level) if folder else None,
                    "breadcrumbs": crumbs, "folders": fd, "files": fl, "permission": level_name(level)})


@bp.get("/tree")
@auth_required
def tree():
    """Flat list of the user's own live folders (used by Move/Copy pickers)."""
    rows = Folder.query.filter_by(owner_id=g.user.id, is_deleted=False).order_by(func.lower(Folder.name)).all()
    return jsonify({"items": [{"id": f.id, "name": f.name, "parent_id": f.parent_id} for f in rows]})


@bp.get("/all")
@auth_required
def all_folders():
    """My Folders page: every folder with item counts, size and its path."""
    favs = fav_sets(g.user.id)
    rows = Folder.query.filter_by(owner_id=g.user.id, is_deleted=False).all()
    by_id = {f.id: f for f in rows}
    stats = {}
    for f in File.query.filter_by(owner_id=g.user.id, is_deleted=False).all():
        stats.setdefault(f.folder_id, [0, 0])
        stats[f.folder_id][0] += 1
        stats[f.folder_id][1] += f.size
    out = []
    for fo in rows:
        path, cur = [], fo
        while cur:
            path.append(cur.name)
            cur = by_id.get(cur.parent_id)
        c, s = stats.get(fo.id, [0, 0])
        out.append(folder_dict(fo, g.user, favs, extra={"file_count": c, "size": s,
                                                         "subfolder_count": sum(1 for x in rows if x.parent_id == fo.id),
                                                         "path": "/".join(reversed(path))}))
    out.sort(key=lambda x: x["path"].lower())
    return jsonify({"items": out})


@bp.post("")
@auth_required
def create():
    d = request.get_json(silent=True) or {}
    name = _clean_folder_name(d.get("name"))
    parent_id = d.get("parent_id")
    owner_id = g.user.id
    if parent_id not in (None, "", "null"):
        parent, _ = get_folder(g.user, int(parent_id), "edit")
        owner_id, parent_id = parent.owner_id, parent.id
    else:
        parent_id = None
    fo = Folder(owner_id=owner_id, parent_id=parent_id,
                name=unique_name(Folder, owner_id, Folder.parent_id, parent_id, name))
    db.session.add(fo)
    db.session.flush()
    log_activity("folder.create", "folder", fo.id, fo.name, owner_id=owner_id)
    recompute_usage(owner_id)
    db.session.commit()
    return jsonify({"folder": folder_dict(fo, g.user)}), 201


@bp.get("/<int:fid>")
@auth_required
def details(fid):
    fo, level = get_folder(g.user, fid)
    ids = [fo.id] + [d.id for d in descendants(fo)]
    files = File.query.filter(File.folder_id.in_(ids), File.is_deleted.is_(False)).all()
    return jsonify({"folder": folder_dict(fo, g.user, level=level, extra={
        "file_count": len(files), "size": sum(f.size for f in files), "subfolder_count": len(ids) - 1,
        "breadcrumbs": breadcrumbs(fo)})})


@bp.put("/<int:fid>")
@auth_required
def rename(fid):
    fo, _ = get_folder(g.user, fid, "edit")
    name = _clean_folder_name((request.get_json(silent=True) or {}).get("name"))
    old = fo.name
    fo.name = unique_name(Folder, fo.owner_id, Folder.parent_id, fo.parent_id, name, exclude_id=fo.id)
    log_activity("folder.rename", "folder", fo.id, fo.name, {"from": old}, owner_id=fo.owner_id)
    db.session.commit()
    return jsonify({"folder": folder_dict(fo, g.user)})


@bp.post("/<int:fid>/move")
@auth_required
def move(fid):
    fo, _ = get_folder(g.user, fid, "owner")
    raw = (request.get_json(silent=True) or {}).get("parent_id")
    if raw in (None, "", "null"):
        parent_id = None
    else:
        target, _ = get_folder(g.user, int(raw), "owner")
        if target.id == fo.id or target.id in {d.id for d in descendants(fo)}:
            raise ApiError(400, "A folder cannot be moved into itself or one of its subfolders")
        parent_id = target.id
    fo.parent_id = parent_id
    fo.name = unique_name(Folder, fo.owner_id, Folder.parent_id, parent_id, fo.name, exclude_id=fo.id)
    log_activity("folder.move", "folder", fo.id, fo.name, {"to": parent_id}, owner_id=fo.owner_id)
    db.session.commit()
    return jsonify({"folder": folder_dict(fo, g.user)})


@bp.delete("/<int:fid>")
@auth_required
def delete(fid):
    fo, _ = get_folder(g.user, fid, "owner")
    trash_folder(fo, g.user)
    log_activity("folder.trash", "folder", fo.id, fo.name, owner_id=fo.owner_id)
    notify(fo.owner_id, "file_deleted", "Folder moved to trash", f"{fo.name} and its contents were moved to trash",
           "/app/trash")
    db.session.flush()
    recompute_usage(fo.owner_id)
    db.session.commit()
    return jsonify({"message": "Moved to trash"})
