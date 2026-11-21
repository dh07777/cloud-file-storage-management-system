import io
import secrets
from datetime import timedelta

from flask import Blueprint, current_app, g, jsonify, request
from flask_jwt_extended import (create_access_token, create_refresh_token, decode_token, get_jwt, get_jwt_identity,
                                jwt_required)
from PIL import Image, ImageOps
from sqlalchemy import func, or_

from ..errors import ApiError
from ..extensions import db, limiter
from ..models import (Role, StorageQuota, StorageUsage, User, UserSession, utcnow)
from ..storage import get_storage, new_key
from ..utils import (allowed_extensions, EMAIL_RE, MB, USERNAME_RE, auth_required, client_ip, get_setting, hash_token, log_activity,
                     notify, recompute_usage, send_email, usage_for, validate_password)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _issue_tokens(user, session_row=None):
    claims = {"role": user.role.name}
    access = create_access_token(identity=str(user.id), additional_claims=claims)
    refresh = create_refresh_token(identity=str(user.id), additional_claims=claims)
    return access, refresh


def _session(user, identifier, success):
    s = UserSession(user_id=user.id if user else None, identifier=identifier[:255], success=success,
                    ip=client_ip(), user_agent=(request.user_agent.string or "")[:255])
    db.session.add(s)
    return s


@bp.post("/register")
@limiter.limit("10 per hour")
def register():
    if not get_setting("allow_registration"):
        raise ApiError(403, "Registration is currently disabled")
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or "").strip().lower()
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""
    if not EMAIL_RE.match(email):
        raise ApiError(400, "Please enter a valid email address")
    if not USERNAME_RE.match(username):
        raise ApiError(400, "Username must be 3-30 characters (letters, numbers, . _ -)")
    validate_password(password)
    if User.query.filter(func.lower(User.email) == email).first():
        raise ApiError(409, "An account with this email already exists")
    if User.query.filter(func.lower(User.username) == username.lower()).first():
        raise ApiError(409, "This username is taken")
    role = Role.query.filter_by(name="user").first()
    user = User(email=email, username=username, full_name=(d.get("full_name") or "").strip()[:120], role_id=role.id)
    user.set_password(password)
    token = secrets.token_urlsafe(32)
    user.verify_token_hash = hash_token(token)
    db.session.add(user)
    db.session.flush()
    db.session.add(StorageQuota(user_id=user.id, quota_bytes=int(get_setting("default_quota_mb")) * MB))
    recompute_usage(user.id)
    notify(user.id, "welcome", "Welcome to CloudVault", "Upload your first file to get started.", "/app/files")
    log_activity("user.register", "user", user.id, user.username, user=user)
    db.session.commit()
    link = f"{current_app.config['FRONTEND_URL']}/verify-email?token={token}"
    send_email(email, "Verify your CloudVault email", f"Hi {user.username},\n\nConfirm your email: {link}\n")
    out = {"message": "Account created. Check your email to verify your address.", "user": user.to_dict()}
    if current_app.config["DEV_EXPOSE_TOKENS"]:
        out["dev_verify_link"] = link
    return jsonify(out), 201


@bp.post("/login")
@limiter.limit("10 per minute")
def login():
    d = request.get_json(silent=True) or {}
    ident = (d.get("identifier") or d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    user = User.query.filter(or_(func.lower(User.email) == ident, func.lower(User.username) == ident)).first() \
        if ident else None
    if not user or not user.check_password(password):
        _session(user, ident or "?", False)
        log_activity("auth.login_failed", "user", user.id if user else None, ident, user=user)
        db.session.commit()
        raise ApiError(401, "Invalid email/username or password")
    if not user.is_active:
        raise ApiError(403, "This account has been suspended. Contact an administrator.")
    if get_setting("require_email_verification") and not user.email_verified:
        raise ApiError(403, "Please verify your email before signing in")
    access, refresh = _issue_tokens(user)
    s = _session(user, ident, True)
    s.jti = decode_token(access)["jti"]
    s.refresh_jti = decode_token(refresh)["jti"]
    user.last_login_at = utcnow()
    log_activity("auth.login", "user", user.id, user.username, user=user)
    db.session.commit()
    return jsonify({"access_token": access, "refresh_token": refresh, "user": user.to_dict()})


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        raise ApiError(401, "Account unavailable")
    access = create_access_token(identity=str(user.id), additional_claims={"role": user.role.name})
    s = UserSession.query.filter_by(refresh_jti=get_jwt()["jti"]).first()
    if s:
        s.jti = decode_token(access)["jti"]
        db.session.commit()
    return jsonify({"access_token": access})


@bp.post("/logout")
@auth_required
def logout():
    jti = get_jwt()["jti"]
    s = UserSession.query.filter_by(jti=jti).first()
    if s:
        s.revoked, s.logged_out_at = True, utcnow()
    log_activity("auth.logout", "user", g.user.id, g.user.username)
    db.session.commit()
    return jsonify({"message": "Signed out"})


@bp.post("/verify-email")
@limiter.limit("20 per hour")
def verify_email():
    token = (request.get_json(silent=True) or {}).get("token") or ""
    user = User.query.filter_by(verify_token_hash=hash_token(token)).first() if token else None
    if not user:
        raise ApiError(400, "This verification link is invalid or has already been used")
    user.email_verified, user.verify_token_hash = True, None
    db.session.commit()
    return jsonify({"message": "Email verified. You can now sign in."})


@bp.post("/resend-verification")
@auth_required
@limiter.limit("5 per hour")
def resend_verification():
    u = g.user
    if u.email_verified:
        return jsonify({"message": "Your email is already verified"})
    token = secrets.token_urlsafe(32)
    u.verify_token_hash = hash_token(token)
    db.session.commit()
    link = f"{current_app.config['FRONTEND_URL']}/verify-email?token={token}"
    send_email(u.email, "Verify your CloudVault email", f"Confirm your email: {link}\n")
    out = {"message": "Verification email sent"}
    if current_app.config["DEV_EXPOSE_TOKENS"]:
        out["dev_verify_link"] = link
    return jsonify(out)


@bp.post("/forgot-password")
@limiter.limit("5 per hour")
def forgot_password():
    email = ((request.get_json(silent=True) or {}).get("email") or "").strip().lower()
    user = User.query.filter(func.lower(User.email) == email).first() if email else None
    out = {"message": "If that email is registered, a reset link has been sent."}  # no account enumeration
    if user and user.is_active:
        token = secrets.token_urlsafe(32)
        user.reset_token_hash, user.reset_expires = hash_token(token), utcnow() + timedelta(hours=1)
        log_activity("auth.password_reset_requested", "user", user.id, user.username, user=user)
        db.session.commit()
        link = f"{current_app.config['FRONTEND_URL']}/reset-password?token={token}"
        send_email(user.email, "Reset your CloudVault password",
                   f"Use this link within 1 hour to choose a new password: {link}\n")
        if current_app.config["DEV_EXPOSE_TOKENS"]:
            out["dev_reset_link"] = link
    return jsonify(out)


@bp.post("/reset-password")
@limiter.limit("10 per hour")
def reset_password():
    d = request.get_json(silent=True) or {}
    token, pw = d.get("token") or "", d.get("password") or ""
    validate_password(pw)
    user = User.query.filter_by(reset_token_hash=hash_token(token)).first() if token else None
    if not user or not user.reset_expires or user.reset_expires < utcnow():
        raise ApiError(400, "This reset link is invalid or has expired")
    user.set_password(pw)
    user.reset_token_hash, user.reset_expires = None, None
    UserSession.query.filter_by(user_id=user.id, revoked=False).update({"revoked": True})
    log_activity("auth.password_reset", "user", user.id, user.username, user=user)
    db.session.commit()
    return jsonify({"message": "Password updated. Please sign in."})


@bp.post("/change-password")
@auth_required
@limiter.limit("10 per hour")
def change_password():
    d = request.get_json(silent=True) or {}
    if not g.user.check_password(d.get("current_password") or ""):
        raise ApiError(400, "Current password is incorrect")
    validate_password(d.get("new_password") or "")
    g.user.set_password(d["new_password"])
    log_activity("auth.password_changed", "user", g.user.id, g.user.username)
    db.session.commit()
    return jsonify({"message": "Password changed"})


@bp.get("/me")
@auth_required
def me():
    return jsonify({"user": g.user.to_dict(), "usage": usage_for(g.user.id),
                    "limits": {"max_upload_mb": get_setting("max_upload_mb"),
                               "allowed_extensions": sorted(allowed_extensions())}})


@bp.put("/me")
@auth_required
def update_me():
    d = request.get_json(silent=True) or {}
    u = g.user
    if "full_name" in d:
        u.full_name = (d["full_name"] or "").strip()[:120]
    if "bio" in d:
        u.bio = (d["bio"] or "").strip()[:300]
    if "theme" in d and d["theme"] in ("light", "dark", "system"):
        u.theme = d["theme"]
    if "username" in d and d["username"] != u.username:
        if not USERNAME_RE.match(d["username"]):
            raise ApiError(400, "Invalid username")
        if User.query.filter(func.lower(User.username) == d["username"].lower(), User.id != u.id).first():
            raise ApiError(409, "This username is taken")
        u.username = d["username"]
    db.session.commit()
    return jsonify({"user": u.to_dict()})


@bp.post("/me/avatar")
@auth_required
@limiter.limit("20 per hour")
def upload_avatar():
    fs = request.files.get("avatar")
    if not fs:
        raise ApiError(400, "No image provided")
    data = fs.stream.read(5 * MB + 1)
    if len(data) > 5 * MB:
        raise ApiError(413, "Image must be smaller than 5 MB")
    try:
        Image.open(io.BytesIO(data)).verify()
        img = Image.open(io.BytesIO(data))
        if img.format not in ("PNG", "JPEG", "WEBP", "GIF"):
            raise ValueError
        img = ImageOps.exif_transpose(img).convert("RGB")
        img = ImageOps.fit(img, (256, 256))
        buf = io.BytesIO()
        img.save(buf, "PNG")  # re-encoding strips metadata and any embedded payload
    except Exception:
        raise ApiError(415, "Please upload a valid PNG, JPEG, WEBP or GIF image")
    st = get_storage()
    if g.user.avatar_key:
        st.delete(g.user.avatar_key)
    key = new_key()
    st.save_bytes(buf.getvalue(), key)
    g.user.avatar_key = key
    db.session.commit()
    return jsonify({"user": g.user.to_dict()})


@bp.delete("/me/avatar")
@auth_required
def delete_avatar():
    if g.user.avatar_key:
        get_storage().delete(g.user.avatar_key)
        g.user.avatar_key = None
        db.session.commit()
    return jsonify({"user": g.user.to_dict()})


@bp.get("/login-history")
@auth_required
def login_history():
    rows = (UserSession.query.filter(or_(UserSession.user_id == g.user.id,
                                         func.lower(UserSession.identifier).in_(
                                             [g.user.email.lower(), g.user.username.lower()])))
            .order_by(UserSession.created_at.desc()).limit(50).all())
    return jsonify({"items": [r.to_dict() for r in rows]})


users_bp = Blueprint("users", __name__, url_prefix="/api/users")


@users_bp.get("/<int:uid>/avatar")
@auth_required
def avatar(uid):
    from ..utils import send_stored
    u = db.session.get(User, uid)
    if not u or not u.avatar_key:
        raise ApiError(404, "No avatar")
    return send_stored(u.avatar_key, "image/png", "avatar.png", as_attachment=False)
