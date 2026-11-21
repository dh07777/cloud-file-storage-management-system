import io
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Role, StorageQuota, User  # noqa: E402
from config import TestConfig  # noqa: E402
from seed import ensure_roles  # noqa: E402


@pytest.fixture()
def app(tmp_path):
    class C(TestConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp_path / 'test.db'}"
        STORAGE_ROOT = str(tmp_path / "storage")

    app = create_app(C)
    with app.app_context():
        db.create_all()
        ensure_roles()
    yield app
    with app.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture()
def client(app):
    return app.test_client()


class Api:
    """Tiny helper around the Flask test client."""

    def __init__(self, client, app):
        self.c, self.app = client, app

    def register(self, name, role=None, pw="Passw0rd!x"):
        r = self.c.post("/api/auth/register", json={"email": f"{name}@t.io", "username": name, "password": pw})
        assert r.status_code == 201, r.get_json()
        if role:
            with self.app.app_context():
                u = User.query.filter_by(username=name).first()
                u.role_id = Role.query.filter_by(name=role).first().id
                db.session.commit()
        return self.login(name, pw)

    def login(self, name, pw="Passw0rd!x"):
        r = self.c.post("/api/auth/login", json={"identifier": name, "password": pw})
        assert r.status_code == 200, r.get_json()
        return {"Authorization": "Bearer " + r.get_json()["access_token"]}

    def upload(self, h, name="a.txt", data=b"hello world", folder_id=None, **extra):
        form = {"file": (io.BytesIO(data), name)}
        if folder_id:
            form["folder_id"] = str(folder_id)
        form.update(extra)
        return self.c.post("/api/files/upload", data=form, headers=h, content_type="multipart/form-data")

    def folder(self, h, name, parent_id=None):
        r = self.c.post("/api/folders", json={"name": name, "parent_id": parent_id}, headers=h)
        assert r.status_code == 201, r.get_json()
        return r.get_json()["folder"]["id"]


@pytest.fixture()
def api(client, app):
    return Api(client, app)
