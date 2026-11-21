"""Database initialisation + demo data.   Usage:  python seed.py   (safe to run repeatedly)"""
import csv
import io
import json
import random
from datetime import timedelta

from werkzeug.datastructures import FileStorage

from app import create_app
from app.extensions import db
from app.models import (Collaborator, Favorite, File, FileShare, Folder, Role, SharePermission, StorageQuota,
                        UploadLog, User, utcnow)
from app.services import process_upload
from app.utils import MB, notify, new_share_token, recompute_usage, set_setting

ROLES = {
    "super_admin": "Full platform control, configuration and user management",
    "admin": "Manage users, quotas and monitor activity",
    "user": "Regular user with a personal storage space",
    "collaborator": "Limited account that mainly works in folders shared by others",
}
DEMO_USERS = [
    ("admin@cloudvault.local", "superadmin", "Sam Super", "Admin@12345", "super_admin"),
    ("manager@cloudvault.local", "manager", "Morgan Admin", "Manager@12345", "admin"),
    ("alice@example.com", "alice", "Alice Johnson", "Alice@12345", "user"),
    ("bob@example.com", "bob", "Bob Martin", "Bob@12345", "user"),
    ("carol@example.com", "carol", "Carol Reed", "Carol@12345", "collaborator"),
]


def ensure_roles():
    for name, desc in ROLES.items():
        if not Role.query.filter_by(name=name).first():
            db.session.add(Role(name=name, description=desc))
    db.session.commit()


def _make_user(email, username, name, pw, role):
    u = User(email=email, username=username, full_name=name, email_verified=True,
             role_id=Role.query.filter_by(name=role).first().id)
    u.set_password(pw)
    db.session.add(u)
    db.session.flush()
    mb = 100 if role == "collaborator" else 1024
    db.session.add(StorageQuota(user_id=u.id, quota_bytes=mb * MB))
    recompute_usage(u.id)
    return u


def _png(color, size=(640, 400)):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", size, color)
    d = ImageDraw.Draw(img)
    for i in range(0, size[0], 40):
        d.line([(i, 0), (size[0] - i, size[1])], fill=(255, 255, 255), width=1)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _pdf(title):
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"]
    stream = f"BT /F1 18 Tf 20 80 Td ({title}) Tj ET".encode()
    objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for o in offs:
        out += f"{o:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def _csv():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["month", "revenue", "expenses"])
    for m in range(1, 13):
        w.writerow([m, random.randint(40, 90) * 1000, random.randint(20, 60) * 1000])
    return buf.getvalue().encode()


def seed_database():
    app_ctx_needed = False
    db.create_all()
    ensure_roles()
    if User.query.filter_by(username="alice").first():
        print("Demo data already present - nothing to do.")
        return
    random.seed(7)
    users = {u[1]: _make_user(*u) for u in DEMO_USERS}
    db.session.commit()
    alice, bob, carol = users["alice"], users["bob"], users["carol"]

    def folder(owner, name, parent=None):
        f = Folder(owner_id=owner.id, name=name, parent_id=parent.id if parent else None)
        db.session.add(f)
        db.session.flush()
        return f

    from flask import current_app
    with current_app.test_request_context():
        def add(owner, fo, name, data, days_ago=0):
            f = process_upload(FileStorage(stream=io.BytesIO(data), filename=name), owner, owner,
                               fo.id if fo else None)
            when = utcnow() - timedelta(days=days_ago, hours=random.randint(0, 8))
            f.created_at = f.updated_at = when
            for log in UploadLog.query.filter_by(file_id=f.id):
                log.created_at = when
            db.session.commit()
            return f

        docs, photos, projects = folder(alice, "Documents"), folder(alice, "Photos"), folder(alice, "Projects")
        reports = folder(alice, "Reports", docs)
        folder(alice, "Contracts", docs)
        web = folder(alice, "Website Redesign", projects)
        db.session.commit()

        add(alice, None, "Welcome to CloudVault.txt",
            b"Welcome to CloudVault!\n\nUpload, organise, share and version your files securely.\n", 12)
        q3 = add(alice, reports, "Quarterly Report.pdf", _pdf("Quarterly Report Q3"), 9)
        add(alice, reports, "Revenue 2025.csv", _csv(), 8)
        add(alice, docs, "Meeting Notes.md", b"# Meeting notes\n\n- Review roadmap\n- Assign owners\n- Next sync Friday\n", 6)
        add(alice, docs, "Employee Handbook.pdf", _pdf("Employee Handbook"), 20)
        for i, c in enumerate([(14, 116, 144), (180, 83, 9), (22, 101, 52), (109, 40, 217)]):
            add(alice, photos, f"Sunset {i + 1}.png", _png(c), 5 - i)
        add(alice, web, "wireframe.png", _png((30, 41, 59), (900, 600)), 3)
        brief = add(alice, web, "project-brief.txt", b"Project brief v1\nGoal: refresh the marketing site.\n", 4)
        add(alice, projects, "config.json", json.dumps({"env": "demo", "features": ["share", "versions"]}, indent=2).encode(), 2)
        add(alice, projects, "app.py", b"print('hello from CloudVault')\n", 1)
        add(bob, None, "Bob's Todo.txt", b"1. Try CloudVault\n2. Share a file\n", 2)

        # version history on the brief
        for n, text in enumerate([b"Project brief v2\nGoal: refresh the marketing site.\nAdded: timeline.\n",
                                  b"Project brief v3\nGoal: refresh and rebrand the site.\nTimeline: 6 weeks.\n"], 2):
            process_upload(FileStorage(stream=io.BytesIO(text), filename="project-brief.txt"), alice, alice,
                           web.id, existing=brief, note=f"Edit {n}")

        # favorites, sharing, collaboration
        db.session.add_all([Favorite(user_id=alice.id, file_id=q3.id), Favorite(user_id=alice.id, folder_id=projects.id)])
        db.session.add(FileShare(owner_id=alice.id, file_id=q3.id, token=new_share_token(), is_public=True,
                                 allow_download=True, expires_at=utcnow() + timedelta(days=7)))
        priv = FileShare(owner_id=alice.id, file_id=brief.id, token=new_share_token(), is_public=False,
                         allow_download=False)
        db.session.add(priv)
        db.session.flush()
        db.session.add(SharePermission(share_id=priv.id, user_id=bob.id, permission="view"))
        db.session.add(Collaborator(owner_id=alice.id, user_id=bob.id, folder_id=projects.id, permission="editor",
                                    status="accepted", responded_at=utcnow()))
        db.session.add(Collaborator(owner_id=alice.id, user_id=carol.id, folder_id=photos.id, permission="viewer",
                                    status="pending"))
        notify(bob.id, "file_shared", "Something was shared with you", "alice shared 'project-brief.txt' with you",
               "/app/shared-with-me")
        notify(carol.id, "collab_invite", "New collaboration invitation", "alice invited you to view 'Photos'",
               "/app/shared-with-me")
        db.session.commit()
        for u in users.values():
            recompute_usage(u.id)
        db.session.commit()

    print("Seeded demo data.\n")
    print("  Super Admin  admin@cloudvault.local    Admin@12345")
    print("  Admin        manager@cloudvault.local  Manager@12345")
    print("  User         alice@example.com         Alice@12345   (has sample files)")
    print("  User         bob@example.com           Bob@12345")
    print("  Collaborator carol@example.com         Carol@12345")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed_database()
