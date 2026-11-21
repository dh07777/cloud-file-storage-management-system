"""Ownership + collaboration permission checks. Levels: 0 none, 1 viewer, 2 editor, 3 owner.
Admins manage accounts and the platform but do NOT get implicit access to users' file contents (least privilege)."""
from sqlalchemy import or_

from .errors import ApiError
from .extensions import db
from .models import Collaborator, File, Folder

NEED = {"view": 1, "edit": 2, "owner": 3}


def folder_chain(folder):
    chain, seen, cur = [], set(), folder
    while cur is not None and cur.id not in seen:
        chain.append(cur)
        seen.add(cur.id)
        cur = db.session.get(Folder, cur.parent_id) if cur.parent_id else None
    return chain


def _collab_level(user_id, folder_ids, file_id=None):
    conds = []
    if folder_ids:
        conds.append(Collaborator.folder_id.in_(folder_ids))
    if file_id:
        conds.append(Collaborator.file_id == file_id)
    if not conds:
        return 0
    rows = Collaborator.query.filter(Collaborator.user_id == user_id, Collaborator.status == "accepted",
                                     or_(*conds)).all()
    return max([2 if r.permission == "editor" else 1 for r in rows], default=0)


def folder_level(user, folder):
    if folder.owner_id == user.id:
        return 3
    return _collab_level(user.id, [f.id for f in folder_chain(folder)])


def file_level(user, f):
    if f.owner_id == user.id:
        return 3
    ids = []
    if f.folder_id:
        ids = [x.id for x in folder_chain(db.session.get(Folder, f.folder_id))]
    return _collab_level(user.id, ids, f.id)


def get_file(user, file_id, need="view", include_deleted=False):
    f = db.session.get(File, file_id)
    if not f or (f.is_deleted and not include_deleted):
        raise ApiError(404, "File not found")
    level = file_level(user, f)
    if f.is_deleted and f.owner_id != user.id:
        level = 0
    if level == 0:
        raise ApiError(404, "File not found")  # 404 rather than 403: do not reveal that it exists
    if level < NEED[need]:
        raise ApiError(403, "You do not have permission to do that")
    return f, level


def get_folder(user, folder_id, need="view", include_deleted=False):
    fo = db.session.get(Folder, folder_id)
    if not fo or (fo.is_deleted and not include_deleted):
        raise ApiError(404, "Folder not found")
    level = folder_level(user, fo)
    if fo.is_deleted and fo.owner_id != user.id:
        level = 0
    if level == 0:
        raise ApiError(404, "Folder not found")
    if level < NEED[need]:
        raise ApiError(403, "You do not have permission to do that")
    return fo, level


def level_name(level):
    return {3: "owner", 2: "editor", 1: "viewer"}.get(level)


def descendants(folder):
    """All folders below `folder` (excluding itself), iteratively."""
    out, frontier = [], [folder.id]
    while frontier:
        kids = Folder.query.filter(Folder.parent_id.in_(frontier)).all()
        out.extend(kids)
        frontier = [k.id for k in kids]
    return out
