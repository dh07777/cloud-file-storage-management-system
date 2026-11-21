# Deployment guide (no Docker, SQLite)

## 1. Server prerequisites
Ubuntu 22.04+ (or similar), Python 3.11+, Node 18+ (only to build), nginx, a domain with DNS pointing at the server.

## 2. Backend
```bash
sudo adduser --system --group cloudvault && sudo mkdir -p /srv/cloudvault && sudo chown cloudvault: /srv/cloudvault
# copy the project to /srv/cloudvault, then:
cd /srv/cloudvault/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```
Edit `.env` for production:
```ini
FLASK_ENV=production
SECRET_KEY=<64 random hex chars>        # python -c "import secrets;print(secrets.token_hex(32))"
JWT_SECRET_KEY=<another 64 random hex chars>
FRONTEND_URL=https://files.example.com
CORS_ORIGINS=https://files.example.com
DEV_EXPOSE_TOKENS=false
TRUST_PROXY=true
MAIL_SERVER=smtp.example.com            # real email for verification / reset
MAIL_USERNAME=...  MAIL_PASSWORD=...
```
Initialise the database and roles once:
```bash
flask --app wsgi init-db
```
Then either load the demo data (`python seed.py` - **change or delete the demo accounts afterwards**) or create your own first Super Admin:
Create your own Super Admin by running `python seed.py` once, signing in as `admin@cloudvault.local`, create your account with role *Super Admin* in **User management**, then delete the demo users.

### Run with Gunicorn + systemd
`/etc/systemd/system/cloudvault.service`
```ini
[Unit]
Description=CloudVault API
After=network.target

[Service]
User=cloudvault
WorkingDirectory=/srv/cloudvault/backend
EnvironmentFile=/srv/cloudvault/backend/.env
ExecStart=/srv/cloudvault/backend/.venv/bin/gunicorn -w 1 --threads 8 -b 127.0.0.1:8000 --timeout 300 wsgi:app
Restart=always

[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now cloudvault`

> **Use one worker process with threads** with SQLite (single writer) and the in-process trash cleaner. On Windows servers use `waitress-serve --listen=127.0.0.1:8000 wsgi:app`.
> If you need several workers, set `ENABLE_BACKGROUND_JOBS` off in `config.py` and run cleanup from cron: `0 * * * * cd /srv/cloudvault/backend && .venv/bin/flask --app wsgi cleanup-trash`.

## 3. Frontend
```bash
cd /srv/cloudvault/frontend
npm ci && npm run build            # outputs frontend/dist
```
Leave `VITE_API_URL` empty if nginx serves the API on the same domain under `/api`.

## 4. nginx + HTTPS
```nginx
server {
  listen 80; server_name files.example.com;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2; server_name files.example.com;
  # certificates via: sudo certbot --nginx -d files.example.com
  client_max_body_size 520m;

  root /srv/cloudvault/frontend/dist;
  location / { try_files $uri /index.html; }          # SPA routing

  location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_request_buffering off;       # stream large uploads
    proxy_read_timeout 300s;
  }
  # storage folder is NOT exposed - never add a location for it
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'" always;
}
```

## 5. S3-compatible storage (optional)
```bash
pip install boto3
```
`.env`: `STORAGE_BACKEND=s3`, `S3_BUCKET=...`, `S3_ENDPOINT_URL=` (blank for AWS; set for MinIO/R2), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Keep the bucket **private**; all access goes through the API.

## 6. Malware scanning (optional)
Install ClamAV (`sudo apt install clamav-daemon`), then `.env`: `CLAMAV_ENABLED=true`. Uploads are rejected if the scanner finds a threat **or is unreachable** (fail closed).

## 7. Backups
- SQLite: `sqlite3 instance/cloudvault.db ".backup '/backups/cloudvault-$(date +%F).db'"` (safe while running).
- Files: back up `backend/storage_data/` (or rely on bucket versioning for S3). Back up both together.

## 8. Hardening checklist
- [ ] Unique random `SECRET_KEY` / `JWT_SECRET_KEY`; `DEV_EXPOSE_TOKENS=false`
- [ ] Demo accounts removed or passwords changed
- [ ] HTTPS only (HSTS is sent automatically when not in debug)
- [ ] `TRUST_PROXY=true` only when actually behind a proxy
- [ ] Firewall: only 80/443 open; Gunicorn bound to 127.0.0.1
- [ ] SMTP configured; email verification enabled in admin config if desired
- [ ] Regular backups tested; log rotation for the systemd journal
