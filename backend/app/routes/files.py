import json
from flask import Blueprint, g, jsonify, request
from PIL import Image

from ..errors import ApiError
from ..extensions import db, limiter
from ..models import (DownloadLog, FileShare, File, FileVersion, Folder, UploadLog, User, iso, utcnow)
from ..permissions import NEED, get_file, get_folder
from ..serializers import file_dict
from ..services import log_download, process_upload, purge_file, trash_file
from ..storage import get_storage, new_key
from ..utils import (auth_required, clean_filename, get_quota_bytes, inline_safe, log_activity, notify,
                     recompute_usage, send_stored, unique_name)

bp = Blueprint("files", __name__, url_prefix="/api/files")
TEXT_PREVIEW_BYTES = 200 * 1024
TEXT_EXTS = {"txt", "md", "csv", "json", "xml", "log", "py", "js", "jsx", "ts", "css", "java", "c", "cpp", "sql",
             "yml", "yaml", "ini", "rtf"}


def _target_folder(user, raw):
    """Resolve upload/move destination -> (folder_or_None, owner_id). Editor access required in shared folders."""
    if raw in (None, "", "null", "root"):
        return None, user.id
    fo, _ = get_folder(user, int(raw), "edit")
    return fo, fo.owner_id


@bp.post("/upload")
@auth_required
@limiter.limit("120 per minute")
def upload():
    fo, owner_id = _target_folder(g.user, request.form.get("folder_id"))
    owner = db.session.get(User, owner_id)
    f = process_upload(request.files.get("file"), g.user, owner, fo.id if fo else None,
                       allow_duplicate=request.form.get("allow_duplicate") == "true")
    return jsonify({"file": file_dict(f, g.user)}), 201


@bp.get("/<int:fid>")
@auth_required
def details(fid):
    f, level = get_file(g.user, fid)
    d = file_dict(f, g.user, level=level)
    d["media"] = None
    if f.mime.startswith("image/") and f.mime != "image/svg+xml":
        try:
            with get_storage().open(f.stored_name) as fh:
                w, h = Image.open(fh).size
            d["media"] = {"width": w, "height": h}
        except Exception:
            pass
    d["version_count"] = FileVersion.query.filter_by(file_id=f.id).count()
    d["download_count"] = DownloadLog.query.filter_by(file_id=f.id).count()
    d["share_count"] = FileShare.query.filter_by(file_id=f.id, revoked=False).count() if level == 3 else 0
    d["previewable"] = inline_safe(f.mime) or f.ext in TEXT_EXTS
    d["text_previewable"] = f.ext in TEXT_EXTS
    return jsonify({"file": d})


@bp.put("/<int:fid>")
@auth_required
def rename(fid):
    f, _ = get_file(g.user, fid, "edit")
    name = clean_filename((request.get_json(silent=True) or {}).get("name"))
    new_ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if new_ext != f.ext:
        raise ApiError(400, f"The file extension must stay .{f.ext}" if f.ext else "Extension cannot be added")
    old = f.name
    f.name = unique_name(File, f.owner_id, File.folder_id, f.folder_id, name, exclude_id=f.id)
    log_activity("file.rename", "file", f.id, f.name, {"from": old}, owner_id=f.owner_id)
    db.session.commit()
    return jsonify({"file": file_dict(f, g.user)})


@bp.post("/<int:fid>/move")
@auth_required
def move(fid):
    f, _ = get_file(g.user, fid, "edit")
    raw = (request.get_json(silent=True) or {}).get("folder_id")
    fo, owner_id = _target_folder(g.user, raw)
    if owner_id != f.owner_id:
        raise ApiError(400, "Files can only be moved within the same owner's storage")
    f.folder_id = fo.id if fo else None
    f.name = unique_name(File, f.owner_id, File.folder_id, f.folder_id, f.name, exclude_id=f.id)
    log_activity("file.move", "file", f.id, f.name, {"to": f.folder_id}, owner_id=f.owner_id)
    db.session.commit()
    return jsonify({"file": file_dict(f, g.user)})


@bp.post("/<int:fid>/copy")
@auth_required
def copy(fid):
    f, _ = get_file(g.user, fid, "view")
    raw = (request.get_json(silent=True) or {}).get("folder_id", f.folder_id)
    fo, owner_id = _target_folder(g.user, raw)
    if recompute_usage(owner_id).used_bytes + f.size > get_quota_bytes(owner_id):
        raise ApiError(413, "Storage quota exceeded", code="quota_exceeded")
    st, key = get_storage(), new_key()
    st.copy(f.stored_name, key)
    nf = File(owner_id=owner_id, folder_id=fo.id if fo else None, uploaded_by=g.user.id,
              name=unique_name(File, owner_id, File.folder_id, fo.id if fo else None, f"Copy of {f.name}"),
              ext=f.ext, mime=f.mime, size=f.size, sha256=f.sha256, stored_name=key, current_version=1)
    db.session.add(nf)
    db.session.flush()
    db.session.add(FileVersion(file_id=nf.id, version=1, stored_name=key, size=f.size, sha256=f.sha256,
                               mime=f.mime, note=f"Copied from {f.name}", created_by=g.user.id))
    log_activity("file.copy", "file", nf.id, nf.name, {"source": f.id}, owner_id=owner_id)
    db.session.flush()
    recompute_usage(owner_id)
    db.session.commit()
    return jsonify({"file": file_dict(nf, g.user)}), 201


@bp.delete("/<int:fid>")
@auth_required
def delete(fid):
    f, _ = get_file(g.user, fid, "edit")
    trash_file(f, g.user)
    log_activity("file.trash", "file", f.id, f.name, owner_id=f.owner_id)
    notify(f.owner_id, "file_deleted", "File moved to trash",
           f"{f.name} was moved to trash" + (f" by {g.user.username}" if g.user.id != f.owner_id else ""), "/app/trash")
    db.session.commit()
    return jsonify({"message": "Moved to trash"})


def _serve(f, version_row, as_attachment):
    key, mime = (version_row.stored_name, version_row.mime) if version_row else (f.stored_name, f.mime)
    if not as_attachment and not inline_safe(mime):
        raise ApiError(415, "This file type cannot be previewed")
    return send_stored(key, mime, f.name, as_attachment)


@bp.get("/<int:fid>/download")
@auth_required
def download(fid):
    f, _ = get_file(g.user, fid, "view")
    log_download(f, g.user)
    log_activity("file.download", "file", f.id, f.name, owner_id=f.owner_id)
    if f.owner_id != g.user.id:
        notify(f.owner_id, "file_downloaded", "File downloaded", f"{g.user.username} downloaded {f.name}",
               f"/app/file/{f.id}")
    db.session.commit()
    return _serve(f, None, True)


@bp.get("/<int:fid>/preview")
@auth_required
def preview(fid):
    f, _ = get_file(g.user, fid, "view")
    return _serve(f, None, False)


@bp.get("/<int:fid>/text")
@auth_required
def text_preview(fid):
    f, _ = get_file(g.user, fid, "view")
    if f.ext not in TEXT_EXTS:
        raise ApiError(415, "Not a text file")
    raw = get_storage().read_bytes(f.stored_name, TEXT_PREVIEW_BYTES + 1)
    truncated = len(raw) > TEXT_PREVIEW_BYTES
    return jsonify({"content": raw[:TEXT_PREVIEW_BYTES].decode("utf-8", errors="replace"), "truncated": truncated})


# ------------------------------------------------------------------ versions
@bp.get("/<int:fid>/versions")
@auth_required
def versions(fid):
    f, _ = get_file(g.user, fid, "view")
    rows = FileVersion.query.filter_by(file_id=f.id).order_by(FileVersion.version.desc()).all()
    return jsonify({"file": file_dict(f, g.user), "items": [v.to_dict() for v in rows]})


@bp.post("/<int:fid>/versions")
@auth_required
@limiter.limit("60 per minute")
def new_version(fid):
    f, _ = get_file(g.user, fid, "edit")
    owner = db.session.get(User, f.owner_id)
    process_upload(request.files.get("file"), g.user, owner, f.folder_id, existing=f,
                   note=(request.form.get("note") or "")[:255])
    return jsonify({"file": file_dict(f, g.user)}), 201


def _version(f, n):
    v = FileVersion.query.filter_by(file_id=f.id, version=n).first()
    if not v:
        raise ApiError(404, "Version not found")
    return v


@bp.get("/<int:fid>/versions/<int:n>/download")
@auth_required
def version_download(fid, n):
    f, _ = get_file(g.user, fid, "view")
    v = _version(f, n)
    log_download(f, g.user, version=n)
    db.session.commit()
    return _serve(f, v, True)


@bp.get("/<int:fid>/versions/<int:n>/preview")
@auth_required
def version_preview(fid, n):
    f, _ = get_file(g.user, fid, "view")
    return _serve(f, _version(f, n), False)


@bp.post("/<int:fid>/versions/<int:n>/restore")
@auth_required
def version_restore(fid, n):
    f, _ = get_file(g.user, fid, "edit")
    v = _version(f, n)
    if v.version == f.current_version:
        raise ApiError(400, "This is already the current version")
    st, key = get_storage(), new_key()
    st.copy(v.stored_name, key)
    nv = f.current_version + 1
    db.session.add(FileVersion(file_id=f.id, version=nv, stored_name=key, size=v.size, sha256=v.sha256,
                               mime=v.mime, note=f"Restored from version {n}", created_by=g.user.id))
    f.current_version, f.stored_name, f.size, f.sha256, f.mime = nv, key, v.size, v.sha256, v.mime
    f.updated_at = utcnow()
    db.session.flush()
    from ..services import prune_versions
    prune_versions(f)
    log_activity("file.version_restore", "file", f.id, f.name, {"from": n, "to": nv}, owner_id=f.owner_id)
    db.session.flush()
    recompute_usage(f.owner_id)
    db.session.commit()
    return jsonify({"file": file_dict(f, g.user)})


@bp.delete("/<int:fid>/versions/<int:n>")
@auth_required
def version_delete(fid, n):
    f, _ = get_file(g.user, fid, "owner")
    v = _version(f, n)
    if v.version == f.current_version:
        raise ApiError(400, "The current version cannot be deleted")
    get_storage().delete(v.stored_name)
    db.session.delete(v)
    db.session.flush()
    recompute_usage(f.owner_id)
    db.session.commit()
    return jsonify({"message": "Version deleted"})


@bp.get("/<int:fid>/versions/compare")
@auth_required
def version_compare(fid):
    f, _ = get_file(g.user, fid, "view")
    a, b = _version(f, request.args.get("a", type=int) or 0), _version(f, request.args.get("b", type=int) or 0)
    da, db_ = a.to_dict(), b.to_dict()
    return jsonify({
        "a": da, "b": db_,
        "diff": {"size_delta": b.size - a.size, "same_content": a.sha256 == b.sha256,
                 "time_between_seconds": int((b.created_at - a.created_at).total_seconds())},
    })


# ------------------------------------------------------------------ upload history
history_bp = Blueprint("uploads", __name__, url_prefix="/api/uploads")


@history_bp.get("/history")
@auth_required
def upload_history():
    rows = UploadLog.query.filter_by(user_id=g.user.id).order_by(UploadLog.created_at.desc()).limit(100).all()
    return jsonify({"items": [r.to_dict() for r in rows]})


@history_bp.post("/log")
@auth_required
def client_log():
    """Lets the browser record uploads the user cancelled (the server never saw a finished request)."""
    d = request.get_json(silent=True) or {}
    status = d.get("status") if d.get("status") in ("cancelled", "failed") else "failed"
    db.session.add(UploadLog(user_id=g.user.id, filename=str(d.get("filename", ""))[:255],
                             size=int(d.get("size") or 0), status=status, message=str(d.get("message", ""))[:255]))
    db.session.commit()
    return jsonify({"ok": True})
