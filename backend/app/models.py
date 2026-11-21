"""Database models (SQLAlchemy). File contents are NEVER stored in SQLite - only metadata and opaque storage keys."""
import json
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


ROLE_LABELS = {
    "super_admin": "Super Admin",
    "admin": "Administrator",
    "user": "Regular User",
    "collaborator": "Shared Collaborator",
}


class Role(db.Model):
    __tablename__ = "roles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(30), unique=True, nullable=False)
    description = db.Column(db.String(255), default="")

    @property
    def label(self):
        return ROLE_LABELS.get(self.name, self.name)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(40), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(120), default="")
    bio = db.Column(db.String(300), default="")
    password_hash = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    verify_token_hash = db.Column(db.String(64))
    reset_token_hash = db.Column(db.String(64))
    reset_expires = db.Column(db.DateTime)
    avatar_key = db.Column(db.String(64))
    theme = db.Column(db.String(10), default="system")
    created_at = db.Column(db.DateTime, default=utcnow)
    last_login_at = db.Column(db.DateTime)
    last_seen_at = db.Column(db.DateTime)

    role = db.relationship("Role")

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    @property
    def is_admin(self):
        return self.role.name in ("super_admin", "admin")

    def brief(self):
        return {"id": self.id, "username": self.username, "full_name": self.full_name or self.username,
                "has_avatar": bool(self.avatar_key)}

    def to_dict(self):
        return {
            "id": self.id, "email": self.email, "username": self.username, "full_name": self.full_name,
            "bio": self.bio, "role": self.role.name, "role_label": self.role.label,
            "is_active": self.is_active, "email_verified": self.email_verified,
            "has_avatar": bool(self.avatar_key), "theme": self.theme,
            "created_at": iso(self.created_at), "last_login_at": iso(self.last_login_at),
        }


class Folder(db.Model):
    __tablename__ = "folders"
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    parent_id = db.Column(db.Integer, db.ForeignKey("folders.id"), nullable=True, index=True)
    name = db.Column(db.String(255), nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime)
    trashed_via = db.Column(db.Integer)  # id of the top-level folder whose deletion trashed this one
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)
    owner = db.relationship("User")


class File(db.Model):
    __tablename__ = "files"
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    folder_id = db.Column(db.Integer, db.ForeignKey("folders.id"), nullable=True, index=True)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    name = db.Column(db.String(255), nullable=False)
    ext = db.Column(db.String(20), default="")
    mime = db.Column(db.String(120), default="application/octet-stream")
    size = db.Column(db.BigInteger, default=0)
    sha256 = db.Column(db.String(64), index=True)
    stored_name = db.Column(db.String(64), nullable=False)  # opaque server-side id of the CURRENT version blob
    current_version = db.Column(db.Integer, default=1)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime)
    trashed_via = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    owner = db.relationship("User", foreign_keys=[owner_id])
    versions = db.relationship("FileVersion", backref="file", cascade="all, delete-orphan",
                               order_by="FileVersion.version.desc()")


class FileVersion(db.Model):
    __tablename__ = "file_versions"
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"), nullable=False, index=True)
    version = db.Column(db.Integer, nullable=False)
    stored_name = db.Column(db.String(64), nullable=False)
    size = db.Column(db.BigInteger, default=0)
    sha256 = db.Column(db.String(64))
    mime = db.Column(db.String(120))
    note = db.Column(db.String(255), default="")
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow)
    __table_args__ = (db.UniqueConstraint("file_id", "version", name="uq_file_version"),)

    def to_dict(self):
        creator = db.session.get(User, self.created_by) if self.created_by else None
        return {"version": self.version, "size": self.size, "sha256": self.sha256, "mime": self.mime,
                "note": self.note, "created_at": iso(self.created_at),
                "created_by": creator.brief() if creator else None,
                "is_current": self.version == self.file.current_version}


class FileShare(db.Model):
    __tablename__ = "file_shares"
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"), nullable=True)
    folder_id = db.Column(db.Integer, db.ForeignKey("folders.id"), nullable=True)
    token = db.Column(db.String(80), unique=True, nullable=False, index=True)
    is_public = db.Column(db.Boolean, default=True, nullable=False)  # False => only listed users, after login
    password_hash = db.Column(db.String(255))
    expires_at = db.Column(db.DateTime)
    allow_download = db.Column(db.Boolean, default=True, nullable=False)
    revoked = db.Column(db.Boolean, default=False, nullable=False)
    revoked_at = db.Column(db.DateTime)
    access_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utcnow)

    file = db.relationship("File")
    folder = db.relationship("Folder")
    permissions = db.relationship("SharePermission", backref="share", cascade="all, delete-orphan")
    accesses = db.relationship("ShareAccess", backref="share", cascade="all, delete-orphan")


class SharePermission(db.Model):
    __tablename__ = "share_permissions"
    id = db.Column(db.Integer, primary_key=True)
    share_id = db.Column(db.Integer, db.ForeignKey("file_shares.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    permission = db.Column(db.String(10), default="view")  # view | download
    user = db.relationship("User")


class ShareAccess(db.Model):
    __tablename__ = "share_access_logs"
    id = db.Column(db.Integer, primary_key=True)
    share_id = db.Column(db.Integer, db.ForeignKey("file_shares.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    action = db.Column(db.String(20))  # view | download | wrong_password
    ip = db.Column(db.String(64))
    user_agent = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=utcnow)


class Collaborator(db.Model):
    __tablename__ = "collaborators"
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    folder_id = db.Column(db.Integer, db.ForeignKey("folders.id"), nullable=True)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"), nullable=True)
    permission = db.Column(db.String(10), default="viewer")  # viewer | editor
    status = db.Column(db.String(10), default="pending")  # pending | accepted | declined
    created_at = db.Column(db.DateTime, default=utcnow)
    responded_at = db.Column(db.DateTime)
    owner = db.relationship("User", foreign_keys=[owner_id])
    user = db.relationship("User", foreign_keys=[user_id])
    folder = db.relationship("Folder")
    file = db.relationship("File")


class Favorite(db.Model):
    __tablename__ = "favorites"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"), nullable=True)
    folder_id = db.Column(db.Integer, db.ForeignKey("folders.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)


class Trash(db.Model):
    __tablename__ = "trash"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)  # owner
    item_type = db.Column(db.String(10), nullable=False)  # file | folder
    item_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(255))
    size = db.Column(db.BigInteger, default=0)
    original_folder_id = db.Column(db.Integer)
    deleted_by = db.Column(db.Integer)
    deleted_at = db.Column(db.DateTime, default=utcnow)
    expires_at = db.Column(db.DateTime)


class StorageQuota(db.Model):
    __tablename__ = "storage_quotas"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    quota_bytes = db.Column(db.BigInteger, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)
    updated_by = db.Column(db.Integer)


class StorageUsage(db.Model):
    __tablename__ = "storage_usage"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    used_bytes = db.Column(db.BigInteger, default=0)
    file_count = db.Column(db.Integer, default=0)
    folder_count = db.Column(db.Integer, default=0)
    warned_level = db.Column(db.Integer, default=0)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    type = db.Column(db.String(30))
    title = db.Column(db.String(150))
    message = db.Column(db.String(500))
    link = db.Column(db.String(255))
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    def to_dict(self):
        return {"id": self.id, "type": self.type, "title": self.title, "message": self.message,
                "link": self.link, "is_read": self.is_read, "created_at": iso(self.created_at)}


class DownloadLog(db.Model):
    __tablename__ = "download_logs"
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"), index=True)
    file_name = db.Column(db.String(255))
    version = db.Column(db.Integer)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    share_id = db.Column(db.Integer, db.ForeignKey("file_shares.id"))
    ip = db.Column(db.String(64))
    user_agent = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=utcnow)


class UploadLog(db.Model):
    __tablename__ = "upload_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"))
    filename = db.Column(db.String(255))
    size = db.Column(db.BigInteger, default=0)
    status = db.Column(db.String(15))  # completed | failed | rejected | duplicate | cancelled
    message = db.Column(db.String(255), default="")
    ip = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    def to_dict(self):
        return {"id": self.id, "file_id": self.file_id, "filename": self.filename, "size": self.size,
                "status": self.status, "message": self.message, "created_at": iso(self.created_at)}


class ActivityLog(db.Model):
    __tablename__ = "activity_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    scope_owner_id = db.Column(db.Integer, index=True)  # owner of the affected resource
    action = db.Column(db.String(40), index=True)
    target_type = db.Column(db.String(20))
    target_id = db.Column(db.Integer)
    target_name = db.Column(db.String(255))
    details = db.Column(db.Text)
    ip = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=utcnow, index=True)
    user = db.relationship("User")

    def to_dict(self):
        return {"id": self.id, "action": self.action, "target_type": self.target_type,
                "target_id": self.target_id, "target_name": self.target_name,
                "details": json.loads(self.details) if self.details else None, "ip": self.ip,
                "created_at": iso(self.created_at), "user": self.user.brief() if self.user else None}


class UserSession(db.Model):
    """Doubles as login history and as the JWT revocation list."""
    __tablename__ = "user_sessions"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    identifier = db.Column(db.String(255))
    jti = db.Column(db.String(64), index=True)
    refresh_jti = db.Column(db.String(64), index=True)
    success = db.Column(db.Boolean, default=True)
    ip = db.Column(db.String(64))
    user_agent = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=utcnow, index=True)
    logged_out_at = db.Column(db.DateTime)
    revoked = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {"id": self.id, "success": self.success, "ip": self.ip, "user_agent": self.user_agent,
                "created_at": iso(self.created_at), "logged_out_at": iso(self.logged_out_at),
                "identifier": self.identifier}


class Setting(db.Model):
    __tablename__ = "settings"
    key = db.Column(db.String(60), primary_key=True)
    value = db.Column(db.Text)


class RecentSearch(db.Model):
    __tablename__ = "recent_searches"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    query = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=utcnow)


class SupportTicket(db.Model):
    __tablename__ = "support_tickets"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    subject = db.Column(db.String(150))
    message = db.Column(db.Text)
    status = db.Column(db.String(10), default="open")
    created_at = db.Column(db.DateTime, default=utcnow)
    user = db.relationship("User")

    def to_dict(self):
        return {"id": self.id, "subject": self.subject, "message": self.message, "status": self.status,
                "created_at": iso(self.created_at), "user": self.user.brief() if self.user else None}
