"""Business logic shared by several routes (uploads, trash, deletion)."""
from flask import request

from .errors import ApiError
from .extensions import db
from .models import (Collaborator, DownloadLog, Favorite, File, FileShare, FileVersion, Folder, Trash, UploadLog,
                     utcnow)
from datetime import timedelta
from .permissions import descendants
from .storage import get_storage, new_key
from .utils import (MB, allowed_extensions, client_ip, clean_filename, get_quota_bytes, get_setting, guess_mime,
                    log_activity, notify, recompute_usage, scan_file, unique_name, validate_content)


def _reject(user, filename, size, status, message):
    db.session.add(UploadLog(user_id=user.id, filename=(filename or "")[:255], size=size or 0, status=status,
                             message=message[:255], ip=client_ip()))
    db.session.commit()


def process_upload(fs, uploader, owner, folder_id, existing=None, note="", allow_duplicate=False):
    """Validate + store an uploaded file. Creates a new File (existing=None) or a new version of `existing`."""
    if fs is None or not getattr(fs, "filename", None):
        raise ApiError(400, "No file provided")
    name = clean_filename(fs.filename)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    try:
        if ext not in allowed_extensions():
            raise ApiError(415, f"Files of type '.{ext or 'unknown'}' are not allowed")
        if existing is not None and ext != existing.ext:
            raise ApiError(415, f"A new version must keep the same file type (.{existing.ext})")
        head = fs.stream.read(8192)
        fs.stream.seek(0)
        validate_content(ext, head)
    except ApiError as e:
        _reject(uploader, fs.filename, 0, "rejected", e.message)
        raise

    st = get_storage()
    key = new_key()
    max_bytes = int(get_setting("max_upload_mb")) * MB
    try:
        size, sha = st.save(fs.stream, key, max_bytes)
    except ApiError as e:
        _reject(uploader, name, 0, "rejected", e.message)
        raise
    except Exception as e:  # client aborted / IO error
        _reject(uploader, name, 0, "failed", "Upload interrupted")
        raise ApiError(400, "Upload interrupted") from e

    def fail(status, code, msg, **extra):
        st.delete(key)
        _reject(uploader, name, size, status, msg)
        raise ApiError(code, msg, **extra)

    used = recompute_usage(owner.id).used_bytes
    if used + size > get_quota_bytes(owner.id):
        fail("rejected", 413, "Storage quota exceeded", code="quota_exceeded")
    clean, info = scan_file(key)
    if not clean:
        fail("rejected", 422, f"File rejected by malware scan ({info})")

    mime = guess_mime(name)
    if existing is None:
        if not allow_duplicate:
            dup = File.query.filter_by(owner_id=owner.id, sha256=sha, is_deleted=False).first()
            if dup:
                fail("duplicate", 409, f"An identical file already exists: {dup.name}", code="duplicate",
                     duplicate={"id": dup.id, "name": dup.name})
        f = File(owner_id=owner.id, folder_id=folder_id, uploaded_by=uploader.id,
                 name=unique_name(File, owner.id, File.folder_id, folder_id, name), ext=ext, mime=mime, size=size,
                 sha256=sha, stored_name=key, current_version=1)
        db.session.add(f)
        db.session.flush()
        db.session.add(FileVersion(file_id=f.id, version=1, stored_name=key, size=size, sha256=sha, mime=mime,
                                   note=note or "Initial upload", created_by=uploader.id))
        action = "file.upload"
    else:
        f = existing
        if sha == f.sha256:
            fail("rejected", 409, "This file is identical to the current version", code="identical")
        nv = f.current_version + 1
        db.session.add(FileVersion(file_id=f.id, version=nv, stored_name=key, size=size, sha256=sha, mime=mime,
                                   note=note or f"Version {nv}", created_by=uploader.id))
        f.current_version, f.stored_name, f.size, f.sha256, f.mime = nv, key, size, sha, mime
        f.updated_at = utcnow()
        action = "file.new_version"
        db.session.flush()
        prune_versions(f)
    db.session.add(UploadLog(user_id=uploader.id, file_id=f.id, filename=f.name, size=size, status="completed",
                             ip=client_ip()))
    log_activity(action, "file", f.id, f.name, {"size": size, "version": f.current_version}, user=uploader,
                 owner_id=owner.id)
    if uploader.id != owner.id:
        notify(owner.id, "file_uploaded", "File uploaded to your shared folder",
               f"{uploader.username} uploaded {f.name}", f"/app/files/{f.folder_id}" if f.folder_id else "/app/files")
    else:
        notify(owner.id, "file_uploaded", "File uploaded", f"{f.name} was uploaded successfully",
               f"/app/file/{f.id}")
    db.session.flush()
    recompute_usage(owner.id)
    db.session.commit()
    return f


def prune_versions(f):
    limit = max(int(get_setting("max_versions")), 1)
    versions = FileVersion.query.filter_by(file_id=f.id).order_by(FileVersion.version.desc()).all()
    st = get_storage()
    for v in versions[limit:]:
        if v.stored_name != f.stored_name:
            st.delete(v.stored_name)
        db.session.delete(v)


def trash_file(f, by_user, via=None, record=True):
    f.is_deleted, f.deleted_at, f.trashed_via = True, utcnow(), via
    if record:
        days = int(get_setting("trash_retention_days"))
        db.session.add(Trash(user_id=f.owner_id, item_type="file", item_id=f.id, name=f.name, size=f.size,
                             original_folder_id=f.folder_id, deleted_by=by_user.id,
                             expires_at=utcnow() + timedelta(days=days)))


def trash_folder(fo, by_user):
    now = utcnow()
    days = int(get_setting("trash_retention_days"))
    fo.is_deleted, fo.deleted_at, fo.trashed_via = True, now, fo.id
    total = 0
    for d in descendants(fo):
        if not d.is_deleted:
            d.is_deleted, d.deleted_at, d.trashed_via = True, now, fo.id
    ids = [fo.id] + [d.id for d in descendants(fo)]
    for f in File.query.filter(File.folder_id.in_(ids), File.is_deleted.is_(False)).all():
        trash_file(f, by_user, via=fo.id, record=False)
        total += f.size
    total += sum(f.size for f in File.query.filter(File.folder_id.in_(ids), File.trashed_via != fo.id,
                                                   File.is_deleted.is_(True)).all())
    db.session.add(Trash(user_id=fo.owner_id, item_type="folder", item_id=fo.id, name=fo.name, size=total,
                         original_folder_id=fo.parent_id, deleted_by=by_user.id, deleted_at=now,
                         expires_at=now + timedelta(days=days)))


def delete_share(s):
    """Delete a share link and detach rows that reference it (download logs keep existing, share_id cleared)."""
    DownloadLog.query.filter_by(share_id=s.id).update({"share_id": None})
    db.session.delete(s)


def purge_file(f):
    """Permanently remove a file: every version blob, plus related rows."""
    st = get_storage()
    for v in list(f.versions):
        st.delete(v.stored_name)
    Favorite.query.filter_by(file_id=f.id).delete()
    Collaborator.query.filter_by(file_id=f.id).delete()
    for s in FileShare.query.filter_by(file_id=f.id).all():
        delete_share(s)
    DownloadLog.query.filter_by(file_id=f.id).update({"file_id": None})
    UploadLog.query.filter_by(file_id=f.id).update({"file_id": None})
    Trash.query.filter_by(item_type="file", item_id=f.id).delete()
    db.session.delete(f)


def purge_folder(fo):
    for d in reversed(descendants(fo)):
        for f in File.query.filter_by(folder_id=d.id).all():
            purge_file(f)
    for f in File.query.filter_by(folder_id=fo.id).all():
        purge_file(f)
    for d in reversed(descendants(fo)):
        _drop_folder_rows(d)
    _drop_folder_rows(fo)


def _drop_folder_rows(fo):
    Favorite.query.filter_by(folder_id=fo.id).delete()
    Collaborator.query.filter_by(folder_id=fo.id).delete()
    for s in FileShare.query.filter_by(folder_id=fo.id).all():
        delete_share(s)
    Trash.query.filter_by(item_type="folder", item_id=fo.id).delete()
    db.session.delete(fo)


def cleanup_expired_trash():
    """Automatic trash cleanup: purge everything past its expiry. Returns number of items purged."""
    n = 0
    owners = set()
    for t in Trash.query.filter(Trash.expires_at < utcnow()).all():
        owners.add(t.user_id)
        if t.item_type == "file":
            f = db.session.get(File, t.item_id)
            if f:
                purge_file(f)
        else:
            fo = db.session.get(Folder, t.item_id)
            if fo:
                purge_folder(fo)
        Trash.query.filter_by(id=t.id).delete()
        n += 1
    db.session.flush()
    for uid in owners:
        recompute_usage(uid)
    db.session.commit()
    return n


def log_download(f, user, version=None, share=None):
    db.session.add(DownloadLog(file_id=f.id, file_name=f.name, version=version or f.current_version,
                               user_id=user.id if user else None, share_id=share.id if share else None,
                               ip=client_ip(), user_agent=(request.user_agent.string or "")[:255]))
