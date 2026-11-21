from .models import Favorite, File, Folder, User, iso
from .permissions import file_level, folder_level, level_name
from .utils import category_for


def fav_sets(user_id):
    favs = Favorite.query.filter_by(user_id=user_id).all()
    return {f.file_id for f in favs if f.file_id}, {f.folder_id for f in favs if f.folder_id}


def file_dict(f, user, favs=None, level=None):
    favs = favs if favs is not None else fav_sets(user.id)
    level = level if level is not None else file_level(user, f)
    return {
        "id": f.id, "type": "file", "name": f.name, "ext": f.ext, "mime": f.mime, "size": f.size,
        "category": category_for(f.mime, f.ext), "folder_id": f.folder_id, "version": f.current_version,
        "sha256": f.sha256, "created_at": iso(f.created_at), "updated_at": iso(f.updated_at),
        "is_deleted": f.is_deleted, "is_favorite": f.id in favs[0], "permission": level_name(level),
        "owner": f.owner.brief() if f.owner else None,
    }


def folder_dict(fo, user, favs=None, level=None, extra=None):
    favs = favs if favs is not None else fav_sets(user.id)
    level = level if level is not None else folder_level(user, fo)
    d = {"id": fo.id, "type": "folder", "name": fo.name, "parent_id": fo.parent_id,
         "created_at": iso(fo.created_at), "updated_at": iso(fo.updated_at), "is_deleted": fo.is_deleted,
         "is_favorite": fo.id in favs[1], "permission": level_name(level),
         "owner": fo.owner.brief() if fo.owner else None}
    if extra:
        d.update(extra)
    return d


def breadcrumbs(folder):
    from .permissions import folder_chain
    return [{"id": f.id, "name": f.name} for f in reversed(folder_chain(folder))]
