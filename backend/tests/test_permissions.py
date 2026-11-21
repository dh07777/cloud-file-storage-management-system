def test_other_users_cannot_touch_my_files(api, client):
    a, b = api.register("alice"), api.register("bob")
    fid = api.upload(a, "a.txt", b"private").get_json()["file"]["id"]
    folder = api.folder(a, "Secret")
    for url in (f"/api/files/{fid}", f"/api/files/{fid}/download", f"/api/files/{fid}/preview",
                f"/api/files/{fid}/versions", f"/api/folders/{folder}"):
        assert client.get(url, headers=b).status_code == 404, url
    assert client.delete(f"/api/files/{fid}", headers=b).status_code == 404
    assert client.put(f"/api/files/{fid}", json={"name": "z.txt"}, headers=b).status_code == 404
    assert client.get(f"/api/folders/contents?folder_id={folder}", headers=b).status_code == 404
    assert api.upload(b, "x.txt", b"x", folder_id=folder).status_code == 404


def test_admin_cannot_read_user_files(api, client):
    a, boss = api.register("alice"), api.register("boss", role="admin")
    fid = api.upload(a, "a.txt", b"private").get_json()["file"]["id"]
    assert client.get(f"/api/files/{fid}/download", headers=boss).status_code == 404


def test_collaborator_viewer_and_editor(api, client):
    a, b = api.register("alice"), api.register("bob")
    folder = api.folder(a, "Team")
    fid = api.upload(a, "plan.txt", b"plan", folder_id=folder).get_json()["file"]["id"]
    inv = client.post("/api/collab/invite", headers=a, json={"folder_id": folder, "email": "bob@t.io", "permission": "viewer"})
    assert inv.status_code == 201
    # pending invitation grants nothing
    assert client.get(f"/api/files/{fid}", headers=b).status_code == 404
    inv_id = client.get("/api/collab/invitations", headers=b).get_json()["items"][0]["id"]
    assert client.post(f"/api/collab/invitations/{inv_id}/respond", headers=b, json={"accept": True}).status_code == 200
    assert client.get(f"/api/files/{fid}/download", headers=b).data == b"plan"
    assert client.delete(f"/api/files/{fid}", headers=b).status_code == 403      # viewer can't delete
    assert api.upload(b, "n.txt", b"n", folder_id=folder).status_code == 403      # viewer can't upload
    assert client.put(f"/api/collab/{inv_id}", headers=a, json={"permission": "editor"}).status_code == 200
    up = api.upload(b, "n.txt", b"n", folder_id=folder)
    assert up.status_code == 201 and up.get_json()["file"]["owner"]["username"] == "alice"
    # revoking access removes it immediately
    assert client.delete(f"/api/collab/{inv_id}", headers=a).status_code == 200
    assert client.get(f"/api/files/{fid}", headers=b).status_code == 404


def test_collaborator_role_cannot_create_share_links(api, client):
    c = api.register("carol", role="collaborator")
    fid = api.upload(c, "a.txt", b"x").get_json()["file"]["id"]
    assert client.post("/api/shares", headers=c, json={"file_id": fid}).status_code == 403
