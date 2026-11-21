import io


def _new_version(client, h, fid, data, name="a.txt"):
    return client.post(f"/api/files/{fid}/versions", headers=h, content_type="multipart/form-data",
                       data={"file": (io.BytesIO(data), name), "note": "edit"})


def test_version_history_restore_compare(api, client):
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"one").get_json()["file"]["id"]
    assert _new_version(client, h, fid, b"two-two").status_code == 201
    vs = client.get(f"/api/files/{fid}/versions", headers=h).get_json()["items"]
    assert [v["version"] for v in vs] == [2, 1] and vs[0]["is_current"]
    assert client.get(f"/api/files/{fid}/versions/1/download", headers=h).data == b"one"
    assert client.get(f"/api/files/{fid}/download", headers=h).data == b"two-two"
    cmp_ = client.get(f"/api/files/{fid}/versions/compare?a=1&b=2", headers=h).get_json()
    assert cmp_["diff"]["size_delta"] == 4 and not cmp_["diff"]["same_content"]
    assert client.post(f"/api/files/{fid}/versions/1/restore", headers=h).status_code == 200
    assert client.get(f"/api/files/{fid}/download", headers=h).data == b"one"
    assert client.get(f"/api/files/{fid}", headers=h).get_json()["file"]["version"] == 3
    # identical content / wrong type are rejected
    assert _new_version(client, h, fid, b"one").status_code == 409
    assert _new_version(client, h, fid, b"%PDF-x", "a.pdf").status_code == 415


def test_old_versions_count_toward_quota_and_can_be_deleted(api, client):
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"aaaa").get_json()["file"]["id"]
    _new_version(client, h, fid, b"bbbbbb")
    assert client.get("/api/auth/me", headers=h).get_json()["usage"]["used"] == 10
    assert client.delete(f"/api/files/{fid}/versions/2", headers=h).status_code == 400  # current
    assert client.delete(f"/api/files/{fid}/versions/1", headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).get_json()["usage"]["used"] == 6


def test_version_pruning(api, client):
    root = api.register("root", role="super_admin")
    client.put("/api/admin/config", headers=root, json={"max_versions": 2})
    h = api.register("alice")
    fid = api.upload(h, "a.txt", b"v1").get_json()["file"]["id"]
    for i in (2, 3, 4):
        _new_version(client, h, fid, f"v{i}".encode())
    assert len(client.get(f"/api/files/{fid}/versions", headers=h).get_json()["items"]) == 2


def test_quota_enforced_and_warning_notification(api, client):
    root = api.register("root", role="super_admin")
    h = api.register("alice")
    uid = client.get("/api/auth/me", headers=h).get_json()["user"]["id"]
    assert client.put(f"/api/admin/users/{uid}", headers=root, json={"quota_mb": 1}).status_code == 200
    assert api.upload(h, "a.txt", b"a" * 900_000).status_code == 201
    r = api.upload(h, "b.txt", b"b" * 300_000)
    assert r.status_code == 413 and r.get_json()["code"] == "quota_exceeded"
    notes = client.get("/api/notifications", headers=h).get_json()["items"]
    assert any(n["type"] == "storage_warning" for n in notes)
    # deleting + emptying trash frees space
    fid = client.get("/api/folders/contents", headers=h).get_json()["files"][0]["id"]
    client.delete(f"/api/files/{fid}", headers=h)
    assert client.get("/api/auth/me", headers=h).get_json()["usage"]["used"] == 900_000  # trash still counts
    client.delete("/api/trash", headers=h)
    assert client.get("/api/auth/me", headers=h).get_json()["usage"]["used"] == 0


def test_storage_analytics(api, client):
    h = api.register("alice")
    api.upload(h, "a.txt", b"x" * 10)
    d = client.get("/api/storage/analytics", headers=h).get_json()
    assert d["usage"]["used"] == 10 and d["large_files"][0]["name"] == "a.txt" and len(d["timeline"]) == 30
