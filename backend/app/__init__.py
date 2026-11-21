import logging
import os
import threading
import time

from flask import Flask, jsonify
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from config import Config
from .errors import ApiError
from .extensions import cors, db, jwt, limiter, migrate
from .storage import init_storage


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_connection, _):
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


def create_app(config_class=Config):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_class)
    os.makedirs(app.instance_path, exist_ok=True)
    logging.basicConfig(level=logging.INFO)
    if app.config["TRUST_PROXY"]:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
                  allow_headers=["Authorization", "Content-Type", "X-Share-Access"],
                  expose_headers=["Content-Disposition"])
    init_storage(app)

    from .models import UserSession
    from sqlalchemy import or_

    @jwt.token_in_blocklist_loader
    def _revoked(_header, payload):
        s = UserSession.query.filter(or_(UserSession.jti == payload["jti"],
                                         UserSession.refresh_jti == payload["jti"])).first()
        return bool(s and s.revoked)

    @jwt.unauthorized_loader
    def _unauth(msg):
        return jsonify(error="Authentication required", detail=msg), 401

    @jwt.invalid_token_loader
    def _invalid(msg):
        return jsonify(error="Invalid token", detail=msg), 401

    @jwt.expired_token_loader
    def _expired(_h, _p):
        return jsonify(error="Session expired", code="token_expired"), 401

    @jwt.revoked_token_loader
    def _revoked_cb(_h, _p):
        return jsonify(error="Session has been signed out", code="token_revoked"), 401

    from .routes import admin, auth, collab, files, folders, misc, shares, trash
    for bp in (auth.bp, auth.users_bp, files.bp, files.history_bp, folders.bp, trash.bp, shares.bp,
               shares.public_bp, collab.bp, misc.bp, admin.bp):
        app.register_blueprint(bp)

    @app.errorhandler(ApiError)
    def _api_error(e):
        db.session.rollback()
        return jsonify(error=e.message, **e.extra), e.status

    @app.errorhandler(HTTPException)
    def _http_error(e):
        msg = {413: "The uploaded file is too large", 429: "Too many requests - please slow down"}.get(
            e.code, e.description)
        return jsonify(error=msg), e.code

    @app.errorhandler(Exception)
    def _unhandled(e):
        db.session.rollback()
        app.logger.exception("Unhandled error")
        return jsonify(error="Something went wrong on our side. Please try again."), 500

    @app.after_request
    def _security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if not app.debug and not app.testing:
            resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return resp

    @app.cli.command("init-db")
    def init_db_cmd():
        """Create tables and default roles."""
        from seed import ensure_roles
        db.create_all()
        ensure_roles()
        print("Database initialised.")

    @app.cli.command("seed")
    def seed_cmd():
        """Create demo accounts, folders and files."""
        from seed import seed_database
        seed_database()

    @app.cli.command("cleanup-trash")
    def cleanup_cmd():
        from .services import cleanup_expired_trash
        print("Purged", cleanup_expired_trash(), "expired trash item(s)")

    if app.config["ENABLE_BACKGROUND_JOBS"]:
        _start_trash_cleaner(app)
    return app


def _start_trash_cleaner(app):
    """Automatic trash cleanup: hourly daemon thread (one per process). Use `flask cleanup-trash` from cron instead
    if you run several worker processes."""
    if os.environ.get("WERKZEUG_RUN_MAIN") == "false":  # parent process of the reloader
        return

    def loop():
        time.sleep(30)
        while True:
            try:
                with app.app_context():
                    from .services import cleanup_expired_trash
                    n = cleanup_expired_trash()
                    if n:
                        app.logger.info("Trash cleanup purged %s item(s)", n)
            except Exception:
                app.logger.exception("Trash cleanup failed")
            time.sleep(app.config["TRASH_CLEANUP_INTERVAL_SECONDS"])

    threading.Thread(target=loop, daemon=True, name="trash-cleaner").start()
