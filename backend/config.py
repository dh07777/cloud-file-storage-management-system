import os
from datetime import timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv is optional
    pass

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _db_uri():
    uri = os.getenv("DATABASE_URL", "sqlite:///instance/cloudvault.db")
    # make relative sqlite paths absolute so the app works from any cwd
    if uri.startswith("sqlite:///") and not uri.startswith("sqlite:////"):
        rel = uri.replace("sqlite:///", "", 1)
        if rel != ":memory:":
            uri = "sqlite:///" + os.path.join(BASE_DIR, rel)
    return uri


ALLOWED_EXTENSIONS = (
    "jpg,jpeg,png,gif,webp,bmp,pdf,txt,md,csv,json,xml,log,rtf,doc,docx,xls,xlsx,ppt,pptx,odt,ods,odp,"
    "zip,gz,tar,7z,rar,mp3,wav,ogg,m4a,flac,mp4,webm,mov,mkv,avi,py,js,jsx,ts,css,java,c,cpp,sql,yml,yaml,ini"
)

# Editable at runtime by the Super Admin (Admin -> Platform configuration)
DEFAULT_SETTINGS = {
    "max_upload_mb": 100,
    "default_quota_mb": 1024,
    "collaborator_quota_mb": 100,
    "trash_retention_days": 30,
    "max_versions": 20,
    "allow_registration": True,
    "require_email_verification": False,
    "allowed_extensions": ALLOWED_EXTENSIONS,
    "site_name": "CloudVault",
}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-change-me-please-32-bytes-min")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "60")))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)
    SQLALCHEMY_DATABASE_URI = _db_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 520 * 1024 * 1024  # hard ceiling; runtime limit is the max_upload_mb setting
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    DEV_EXPOSE_TOKENS = _bool("DEV_EXPOSE_TOKENS", True)
    TRUST_PROXY = _bool("TRUST_PROXY", False)

    STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
    STORAGE_ROOT = os.path.join(BASE_DIR, os.getenv("STORAGE_ROOT", "storage_data"))
    S3_BUCKET = os.getenv("S3_BUCKET", "")
    S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL") or None
    S3_REGION = os.getenv("S3_REGION", "us-east-1")

    MAIL_SERVER = os.getenv("MAIL_SERVER", "")
    MAIL_PORT = int(os.getenv("MAIL_PORT", "587"))
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
    MAIL_USE_TLS = _bool("MAIL_USE_TLS", True)
    MAIL_FROM = os.getenv("MAIL_FROM", "CloudVault <no-reply@cloudvault.local>")

    CLAMAV_ENABLED = _bool("CLAMAV_ENABLED", False)
    CLAMAV_HOST = os.getenv("CLAMAV_HOST", "127.0.0.1")
    CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))

    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_ENABLED = True
    DEFAULT_SETTINGS = DEFAULT_SETTINGS
    TRASH_CLEANUP_INTERVAL_SECONDS = 3600
    ENABLE_BACKGROUND_JOBS = True


class TestConfig(Config):
    TESTING = True
    RATELIMIT_ENABLED = False
    ENABLE_BACKGROUND_JOBS = False
    DEV_EXPOSE_TOKENS = True
