import io


def test_upload_download_roundtrip(api, client):
    h = api.register("alice")
    r = api.upload(h, "notes.txt", b"secret notes")
    assert r.status_code == 201
    fid = r.get_json()["file"]["id"]
    d = client.get(f"/api/files/{fid}/download", headers=h)
    assert d.status_code == 200 and d.data == b"secret notes"
    assert "attachment" in d.headers["Content-Disposition"]
    assert d.headers["X-Content-Type-Options"] == "nosniff"


def test_multiple_uploads_and_listing(api, client):
    h = api.register("alice")
    for i in range(3):
        assert api.upload(h, f"f{i}.txt", f"data{i}".encode()).status_code == 201
    items = client.get("/api/folders/contents", headers=h).get_json()["files"]
    assert len(items) == 3


def test_duplicate_detection(api):
    h = api.register("alice")
    assert api.upload(h, "a.txt", b"same").status_code == 201
    dup = api.upload(h, "b.txt", b"same")
    assert dup.status_code == 409 and dup.get_json()["code"] == "duplicate"
    assert api.upload(h, "b.txt", b"same", allow_duplicate="true").status_code == 201


def test_same_name_gets_suffix(api):
    h = api.register("alice")
    n1 = api.upload(h, "a.txt", b"one").get_json()["file"]["name"]
    n2 = api.upload(h, "a.txt", b"two").get_json()["file"]["name"]
    assert n1 == "a.txt" and n2 == "a (1).txt"


def test_extension_and_content_validation(api):
    h = api.register("alice")
    assert api.upload(h, "virus.exe", b"MZ....").status_code == 415
    assert api.upload(h, "page.html", b"<script>alert(1)</script>").status_code == 415
    assert api.upload(h, "fake.png", b"this is not a png").status_code == 415
    assert api.upload(h, "fake.pdf", b"not a pdf").status_code == 415
    assert api.upload(h, "bin.txt", b"abc\x00def").status_code == 415


def test_max_upload_size(api, client):
    root = api.register("root", role="super_admin")
    client.put("/api/admin/config", headers=root, json={"max_upload_mb": 1})
    h = api.register("alice")
    assert api.upload(h, "big.txt", b"a" * (1024 * 1024 + 10)).status_code == 413


def test_folders_nesting_breadcrumbs_rename_move(api, client):
    h = api.register("alice")
    a = api.folder(h, "A")
    b = api.folder(h, "B", a)
    r = client.get(f"/api/folders/contents?folder_id={b}", headers=h).get_json()
    assert [c["name"] for c in r["breadcrumbs"]] == ["A", "B"]
    assert client.put(f"/api/folders/{b}", json={"name": "Bee"}, headers=h).get_json()["folder"]["name"] == "Bee"
    # cannot move a folder into its own descendant
    assert client.post(f"/api/folders/{a}/move", json={"parent_id": b}, headers=h).status_code == 400
    fid = api.upload(h, "x.txt", b"x", folder_id=a).get_json()["file"]["id"]
    assert client.post(f"/api/files/{fid}/move", json={"folder_id": b}, headers=h).status_code == 200
    assert client.post(f"/api/files/{fid}/copy", json={"folder_id": None}, headers=h).status_code == 201


def test_rename_keeps_extension(api, client):
    h = api.register("alice")
    fid = api.upload(h, "x.txt", b"x").get_json()["file"]["id"]
    assert client.put(f"/api/files/{fid}", json={"name": "y.txt"}, headers=h).status_code == 200
    assert client.put(f"/api/files/{fid}", json={"name": "y.exe"}, headers=h).status_code == 400


def test_trash_restore_and_permanent_delete(api, client, app):
    h = api.register("alice")
    folder = api.folder(h, "Docs")
    fid = api.upload(h, "x.txt", b"x", folder_id=folder).get_json()["file"]["id"]
    assert client.delete(f"/api/folders/{folder}", headers=h).status_code == 200
    assert client.get(f"/api/files/{fid}", headers=h).status_code == 404
    t = client.get("/api/trash", headers=h).get_json()
    assert t["count"] == 1 and t["total_size"] == 1
    assert client.post("/api/trash/restore", json={"id": t["items"][0]["id"]}, headers=h).status_code == 200
    assert client.get(f"/api/files/{fid}", headers=h).status_code == 200
    # permanent delete removes the blob from disk
    client.delete(f"/api/files/{fid}", headers=h)
    tid = client.get("/api/trash", headers=h).get_json()["items"][0]["id"]
    assert client.delete(f"/api/trash/{tid}", headers=h).status_code == 200
    import os
    stored = [f for _, _, fs in os.walk(app.config["STORAGE_ROOT"]) for f in fs]
    assert stored == [] or len(stored) == 0


def test_trash_auto_cleanup(api, client, app):
    from datetime import timedelta
    from app.extensions import db
    from app.models import Trash, utcnow
    from app.services import cleanup_expired_trash
    h = api.register("alice")
    fid = api.upload(h, "x.txt", b"x").get_json()["file"]["id"]
    client.delete(f"/api/files/{fid}", headers=h)
    with app.app_context():
        Trash.query.update({"expires_at": utcnow() - timedelta(days=1)})
        db.session.commit()
        assert cleanup_expired_trash() == 1
    assert client.get("/api/trash", headers=h).get_json()["count"] == 0


def test_favorites_and_search(api, client):
    h = api.register("alice")
    fid = api.upload(h, "Budget 2025.csv", b"a,b\n1,2\n").get_json()["file"]["id"]
    api.upload(h, "photo.png", b"\x89PNG\r\n\x1a\n" + b"0" * 20)
    assert client.post("/api/favorites", json={"file_id": fid}, headers=h).status_code == 201
    assert len(client.get("/api/favorites", headers=h).get_json()["files"]) == 1
    assert client.delete(f"/api/favorites?file_id={fid}", headers=h).status_code == 200
    assert len(client.get("/api/search?q=budget", headers=h).get_json()["files"]) == 1
    assert len(client.get("/api/search?ext=png", headers=h).get_json()["files"]) == 1
    assert len(client.get("/api/search?type=document", headers=h).get_json()["files"]) == 1
    assert "budget" in client.get("/api/search/recent", headers=h).get_json()["items"]


def test_dashboard_is_live(api, client):
    h = api.register("alice")
    api.upload(h, "a.txt", b"12345")
    d = client.get("/api/dashboard", headers=h).get_json()
    assert d["usage"]["used"] == 5 and d["usage"]["file_count"] == 1
    assert d["recent_files"][0]["name"] == "a.txt"


def test_text_preview(api, client):
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"hello preview").get_json()["file"]["id"]
    assert client.get(f"/api/files/{fid}/text", headers=h).get_json()["content"] == "hello preview"
    assert client.get(f"/api/files/{fid}/preview", headers=h).status_code == 200
