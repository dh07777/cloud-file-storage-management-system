import pytest

from app.errors import ApiError
from app.storage import LocalStorage


def test_storage_rejects_path_traversal(tmp_path):
    st = LocalStorage(str(tmp_path))
    for bad in ("../etc/passwd", "..\\..\\x", "a/b", "A" * 32, "", "../" + "a" * 29):
        with pytest.raises(ApiError):
            st.local_path(bad)


def test_hostile_filenames_are_sanitised(api, client):
    h = api.register("alice")
    r = api.upload(h, "../../../etc/passwd.txt", b"x")
    assert r.status_code == 201
    f = r.get_json()["file"]
    assert "/" not in f["name"] and ".." not in f["name"]
    assert "stored_name" not in f and "path" not in f  # internal paths are never exposed


def test_internal_paths_never_in_responses(api, client):
    h = api.register("alice")
    api.upload(h, "a.txt", b"x")
    body = client.get("/api/folders/contents", headers=h).get_data(as_text=True)
    assert "stored_name" not in body and "storage_data" not in body


def test_no_public_static_access_to_storage(client):
    assert client.get("/storage_data/anything").status_code == 404
    assert client.get("/static/../storage_data").status_code in (404, 308, 400)


def test_sql_injection_attempts_are_inert(api, client):
    h = api.register("alice")
    api.upload(h, "a.txt", b"x")
    r = client.get("/api/search", headers=h, query_string={"q": "' OR 1=1 --"})
    assert r.status_code == 200 and r.get_json()["files"] == []
    r = client.post("/api/auth/login", json={"identifier": "alice' OR '1'='1", "password": "x"})
    assert r.status_code == 401


def test_html_and_svg_cannot_be_uploaded_or_inlined(api):
    h = api.register("alice")
    assert api.upload(h, "x.svg", b"<svg onload=alert(1)>").status_code == 415
    assert api.upload(h, "x.html", b"<html>").status_code == 415


def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["X-Frame-Options"] == "DENY"


def test_cannot_escalate_via_admin_endpoints(api, client):
    h = api.register("alice")
    other = client.get("/api/auth/me", headers=h).get_json()["user"]["id"]
    assert client.put(f"/api/admin/users/{other}", headers=h, json={"role": "super_admin"}).status_code == 403
    boss = api.register("boss", role="admin")
    assert client.put(f"/api/admin/users/{other}", headers=boss, json={"role": "super_admin"}).status_code == 403


def test_malware_scan_hook_rejects(api, client, app, monkeypatch):
    import app.services as services
    monkeypatch.setattr(services, "scan_file", lambda key: (False, "Eicar-Test FOUND"))
    h = api.register("alice")
    assert api.upload(h, "a.txt", b"x").status_code == 422


def test_avatar_must_be_a_real_image(api, client):
    import io
    h = api.register("alice")
    r = client.post("/api/auth/me/avatar", headers=h, content_type="multipart/form-data",
                    data={"avatar": (io.BytesIO(b"not an image"), "a.png")})
    assert r.status_code == 415


def test_admin_user_management(api, client):
    root, h = api.register("root", role="super_admin"), api.register("alice")
    uid = client.get("/api/auth/me", headers=h).get_json()["user"]["id"]
    assert client.put(f"/api/admin/users/{uid}", headers=root, json={"is_active": False}).status_code == 200
    assert client.post("/api/auth/login", json={"identifier": "alice", "password": "Passw0rd!x"}).status_code == 403
    assert client.get("/api/auth/me", headers=h).status_code == 401  # existing sessions revoked
    api.upload  # noqa
    assert client.delete(f"/api/admin/users/{uid}", headers=root).status_code == 200
    stats = client.get("/api/admin/stats", headers=root).get_json()
    assert stats["total_users"] == 1
    assert client.get("/api/admin/logs", headers=root).get_json()["total"] > 0
