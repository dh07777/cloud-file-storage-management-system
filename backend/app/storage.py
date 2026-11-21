"""Storage abstraction layer. Blobs are addressed ONLY by server-generated 32-hex keys, never by user input."""
import hashlib
import os
import re
import shutil
import uuid

from flask import current_app

from .errors import ApiError

KEY_RE = re.compile(r"^[0-9a-f]{32}$")
CHUNK = 1024 * 1024


def new_key():
    return uuid.uuid4().hex


def _check_key(key):
    if not isinstance(key, str) or not KEY_RE.match(key):
        raise ApiError(400, "Invalid storage key")
    return key


class LocalStorage:
    name = "local"

    def __init__(self, root):
        self.root = os.path.realpath(root)
        os.makedirs(self.root, exist_ok=True)

    def _path(self, key):
        _check_key(key)
        path = os.path.realpath(os.path.join(self.root, key[:2], key))
        if not path.startswith(self.root + os.sep):  # path traversal guard (defence in depth)
            raise ApiError(400, "Invalid storage path")
        return path

    def local_path(self, key):
        p = self._path(key)
        return p if os.path.exists(p) else None

    def save(self, stream, key, max_bytes=None):
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        h, size = hashlib.sha256(), 0
        try:
            with open(path, "wb") as out:
                while True:
                    chunk = stream.read(CHUNK)
                    if not chunk:
                        break
                    size += len(chunk)
                    if max_bytes is not None and size > max_bytes:
                        raise ApiError(413, f"File exceeds the maximum upload size of {max_bytes // (1024 * 1024)} MB")
                    h.update(chunk)
                    out.write(chunk)
        except BaseException:
            if os.path.exists(path):
                os.remove(path)
            raise
        return size, h.hexdigest()

    def save_bytes(self, data, key):
        import io
        return self.save(io.BytesIO(data), key)

    def open(self, key):
        return open(self._path(key), "rb")

    def read_bytes(self, key, limit=None):
        with self.open(key) as f:
            return f.read(limit) if limit else f.read()

    def delete(self, key):
        try:
            os.remove(self._path(key))
        except FileNotFoundError:
            pass

    def exists(self, key):
        return os.path.exists(self._path(key))

    def copy(self, src, dst):
        d = self._path(dst)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copyfile(self._path(src), d)


class S3Storage:
    """S3-compatible backend (AWS S3, MinIO, R2, ...). Requires `pip install boto3`."""
    name = "s3"

    def __init__(self, bucket, endpoint_url=None, region="us-east-1"):
        import boto3  # lazy import so boto3 stays optional
        self.bucket = bucket
        self.client = boto3.client("s3", endpoint_url=endpoint_url, region_name=region)

    def local_path(self, key):
        return None

    def save(self, stream, key, max_bytes=None):
        _check_key(key)
        h, size = hashlib.sha256(), 0
        import tempfile
        with tempfile.SpooledTemporaryFile(max_size=32 * CHUNK) as tmp:
            while True:
                chunk = stream.read(CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if max_bytes is not None and size > max_bytes:
                    raise ApiError(413, "File exceeds the maximum upload size")
                h.update(chunk)
                tmp.write(chunk)
            tmp.seek(0)
            self.client.upload_fileobj(tmp, self.bucket, key, ExtraArgs={"ServerSideEncryption": "AES256"})
        return size, h.hexdigest()

    def save_bytes(self, data, key):
        import io
        return self.save(io.BytesIO(data), key)

    def open(self, key):
        return self.client.get_object(Bucket=self.bucket, Key=_check_key(key))["Body"]

    def read_bytes(self, key, limit=None):
        body = self.open(key)
        return body.read(limit) if limit else body.read()

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key=_check_key(key))

    def exists(self, key):
        try:
            self.client.head_object(Bucket=self.bucket, Key=_check_key(key))
            return True
        except Exception:
            return False

    def copy(self, src, dst):
        self.client.copy_object(Bucket=self.bucket, Key=_check_key(dst),
                                CopySource={"Bucket": self.bucket, "Key": _check_key(src)})


def init_storage(app):
    cfg = app.config
    if cfg["STORAGE_BACKEND"] == "s3":
        app.extensions["storage"] = S3Storage(cfg["S3_BUCKET"], cfg["S3_ENDPOINT_URL"], cfg["S3_REGION"])
    else:
        app.extensions["storage"] = LocalStorage(cfg["STORAGE_ROOT"])


def get_storage():
    return current_app.extensions["storage"]
