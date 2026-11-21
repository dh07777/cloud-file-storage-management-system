import time


def _share(client, h, fid, **kw):
    r = client.post("/api/shares", headers=h, json={"file_id": fid, **kw})
    assert r.status_code == 201, r.get_json()
    return r.get_json()["share"]


def test_public_share_flow_with_temp_token(api, client):
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"shared!").get_json()["file"]["id"]
    s = _share(client, h, fid)
    info = client.get(f"/api/public/{s['token']}").get_json()
    assert info["name"] == "a.txt" and not info["needs_password"]
    # download without the temporary token is refused
    assert client.get(f"/api/public/{s['token']}/download").status_code == 401
    acc = client.post(f"/api/public/{s['token']}/unlock", json={}).get_json()["access"]
    d = client.get(f"/api/public/{s['token']}/download?access={acc}")
    assert d.status_code == 200 and d.data == b"shared!"
    acts = client.get(f"/api/shares/{s['id']}/activity", headers=h).get_json()["items"]
    assert {x["action"] for x in acts} == {"view", "download"}


def test_password_protected_share(api, client):
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"x").get_json()["file"]["id"]
    s = _share(client, h, fid, password="hunter22")
    assert client.get(f"/api/public/{s['token']}").get_json()["needs_password"]
    assert client.post(f"/api/public/{s['token']}/unlock", json={"password": "bad"}).status_code == 401
    assert client.post(f"/api/public/{s['token']}/unlock", json={"password": "hunter22"}).status_code == 200


def test_view_only_share_blocks_download(api, client):
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"x").get_json()["file"]["id"]
    s = _share(client, h, fid, allow_download=False)
    acc = client.post(f"/api/public/{s['token']}/unlock", json={}).get_json()["access"]
    assert client.get(f"/api/public/{s['token']}/download?access={acc}").status_code == 403
    assert client.get(f"/api/public/{s['token']}/preview?access={acc}").status_code == 200


def test_expired_and_revoked_links(api, client, app):
    from datetime import timedelta
    from app.extensions import db
    from app.models import FileShare, utcnow
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"x").get_json()["file"]["id"]
    s = _share(client, h, fid, expires_in_hours=1)
    with app.app_context():
        FileShare.query.update({"expires_at": utcnow() - timedelta(minutes=1)})
        db.session.commit()
    assert client.get(f"/api/public/{s['token']}").status_code == 410
    s2 = _share(client, h, fid)
    assert client.delete(f"/api/shares/{s2['id']}", headers=h).status_code == 200
    assert client.get(f"/api/public/{s2['token']}").status_code == 404


def test_private_share_only_for_listed_users(api, client):
    a, b, c = api.register("alice"), api.register("bob"), api.register("cara")
    fid = api.upload(a, "a.txt", b"x").get_json()["file"]["id"]
    s = _share(client, a, fid, is_public=False, user_emails=["bob@t.io"])
    assert client.get(f"/api/public/{s['token']}").status_code == 401           # anonymous
    assert client.get(f"/api/public/{s['token']}", headers=c).status_code == 403  # not listed
    assert client.get(f"/api/public/{s['token']}", headers=b).status_code == 200
    assert len(client.get("/api/shares/with-me", headers=b).get_json()["items"]) == 1


def test_temp_token_is_bound_to_its_share(api, client):
    h = api.register("alice")
    f1 = api.upload(h, "a.txt", b"1").get_json()["file"]["id"]
    f2 = api.upload(h, "b.txt", b"2").get_json()["file"]["id"]
    s1, s2 = _share(client, h, f1), _share(client, h, f2, password="pw123456")
    acc1 = client.post(f"/api/public/{s1['token']}/unlock", json={}).get_json()["access"]
    assert client.get(f"/api/public/{s2['token']}/download?access={acc1}").status_code == 401


def test_share_notifications(api, client):
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"x").get_json()["file"]["id"]
    s = _share(client, h, fid)
    client.post(f"/api/public/{s['token']}/unlock", json={})
    types = {n["type"] for n in client.get("/api/notifications", headers=h).get_json()["items"]}
    assert "share_accessed" in types and "file_uploaded" in types


def test_folder_share_lists_and_serves_only_inside_folder(api, client):
    h = api.register("alice")
    fo = api.folder(h, "Pub")
    inside = api.upload(h, "in.txt", b"in", folder_id=fo).get_json()["file"]["id"]
    outside = api.upload(h, "out.txt", b"out").get_json()["file"]["id"]
    s = client.post("/api/shares", headers=h, json={"folder_id": fo}).get_json()["share"]
    acc = client.post(f"/api/public/{s['token']}/unlock", json={}).get_json()["access"]
    assert len(client.get(f"/api/public/{s['token']}/contents?access={acc}").get_json()["files"]) == 1
    assert client.get(f"/api/public/{s['token']}/download?access={acc}&file_id={inside}").data == b"in"
    assert client.get(f"/api/public/{s['token']}/download?access={acc}&file_id={outside}").status_code == 404
