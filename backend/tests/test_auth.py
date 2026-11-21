def test_register_login_me_logout(api, client):
    h = api.register("alice")
    me = client.get("/api/auth/me", headers=h).get_json()
    assert me["user"]["username"] == "alice" and me["user"]["role"] == "user"
    assert me["usage"]["quota"] > 0
    assert client.post("/api/auth/logout", headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401  # token revoked


def test_register_validation_and_duplicates(api, client):
    api.register("alice")
    bad = client.post("/api/auth/register", json={"email": "x@t.io", "username": "xx", "password": "Passw0rd!x"})
    assert bad.status_code == 400
    weak = client.post("/api/auth/register", json={"email": "w@t.io", "username": "weakone", "password": "short"})
    assert weak.status_code == 400
    dup = client.post("/api/auth/register", json={"email": "alice@t.io", "username": "other", "password": "Passw0rd!x"})
    assert dup.status_code == 409


def test_wrong_password_and_login_history(api, client):
    h = api.register("alice")
    assert client.post("/api/auth/login", json={"identifier": "alice", "password": "nope"}).status_code == 401
    hist = client.get("/api/auth/login-history", headers=h).get_json()["items"]
    assert any(not x["success"] for x in hist) and any(x["success"] for x in hist)


def test_protected_routes_need_token(client):
    for url in ("/api/dashboard", "/api/folders/contents", "/api/trash", "/api/admin/stats"):
        assert client.get(url).status_code == 401


def test_email_verification(api, client):
    r = client.post("/api/auth/register", json={"email": "v@t.io", "username": "vera", "password": "Passw0rd!x"})
    link = r.get_json()["dev_verify_link"]
    token = link.split("token=")[1]
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 400  # single use


def test_forgot_and_reset_password(api, client):
    api.register("alice")
    r = client.post("/api/auth/forgot-password", json={"email": "alice@t.io"}).get_json()
    token = r["dev_reset_link"].split("token=")[1]
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "NewPassw0rd!"}).status_code == 200
    assert client.post("/api/auth/login", json={"identifier": "alice", "password": "NewPassw0rd!"}).status_code == 200
    # unknown email gives the same answer (no account enumeration)
    assert client.post("/api/auth/forgot-password", json={"email": "ghost@t.io"}).status_code == 200


def test_change_password(api, client):
    h = api.register("alice")
    bad = client.post("/api/auth/change-password", headers=h, json={"current_password": "x", "new_password": "Another1pass"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/change-password", headers=h,
                     json={"current_password": "Passw0rd!x", "new_password": "Another1pass"})
    assert ok.status_code == 200


def test_role_based_admin_access(api, client):
    u = api.register("alice")
    a = api.register("boss", role="admin")
    assert client.get("/api/admin/users", headers=u).status_code == 403
    assert client.get("/api/admin/users", headers=a).status_code == 200
    # admins cannot edit platform config - super admin only
    assert client.put("/api/admin/config", headers=a, json={"max_upload_mb": 10}).status_code == 403
    s = api.register("root", role="super_admin")
    assert client.put("/api/admin/config", headers=s, json={"max_upload_mb": 10}).status_code == 200
